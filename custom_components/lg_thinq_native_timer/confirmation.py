"""Bounded status confirmation; this module never sends control commands."""
import asyncio
import time
from dataclasses import dataclass


def matches(observed, service, minutes=None, elapsed_seconds=0):
    if not observed:
        return False
    if service == "cancel_timer":
        return observed.get("timer_state") == "UNSET"
    remaining = observed.get("remaining_minutes")
    return (observed.get("timer_state") == "SET"
            and isinstance(remaining, (int, float))
            and not isinstance(remaining, bool)
            and max(0, minutes - elapsed_seconds / 60 - 2) <= remaining
            <= max(0, minutes - elapsed_seconds / 60) + 1)


async def confirm(read, service, minutes=None, sleep=asyncio.sleep):
    """Read immediately, then at approximately 2, 5 and 10 seconds."""
    observed = None
    for delay in (0, 2, 3, 5):
        if delay:
            await sleep(delay)
        latest = await read()
        if latest is not None:
            observed = latest
        if matches(latest, service, minutes):
            return latest, True
    return observed, False


@dataclass
class PendingConfirmation:
    service: str
    minutes: object
    started: float
    status: str = "pending"


class ConfirmationTracker:
    """Track accepted commands independently of any open browser card.

    Only read callbacks run here. New accepted commands replace older work,
    and the same device lock serializes reads with control requests.
    """
    def __init__(self, create_task, changed, clock=time.monotonic,
                 sleep=asyncio.sleep, checkpoints=(5, 15, 30, 60, 120, 180, 300)):
        self.records = {}
        self.tasks = {}
        self.create_task = create_task
        self.changed = changed
        self.clock = clock
        self.sleep = sleep
        self.checkpoints = checkpoints

    def begin(self, key, service, minutes, started=None):
        task = self.tasks.pop(key, None)
        if task:
            task.cancel()
        record = PendingConfirmation(service, minutes,
                                     self.clock() if started is None else started)
        self.records[key] = record
        return record

    def status(self, key):
        record = self.records.get(key)
        if record is None:
            return {"status": "idle"}
        return {"status": record.status, "operation": record.service,
                "requested_minutes": record.minutes,
                "elapsed_seconds": max(0, self.clock() - record.started)}

    def observe(self, key, observed):
        record = self.records.get(key)
        if record and record.status != "confirmed" and matches(
                observed, record.service, record.minutes,
                max(0, self.clock() - record.started)):
            record.status = "confirmed"
            self.changed(key, record.status)
        return bool(record and record.status == "confirmed")

    def follow(self, key, read, lock):
        record = self.records[key]
        if record.status != "pending":
            return
        async def run():
            try:
                for checkpoint in self.checkpoints:
                    await self.sleep(max(0, record.started + checkpoint - self.clock()))
                    async with lock:
                        if self.records.get(key) is not record or record.status != "pending":
                            return
                        observed = await read()
                        if self.observe(key, observed):
                            return
                if self.records.get(key) is record and record.status == "pending":
                    record.status = "unconfirmed"
                    self.changed(key, record.status)
            finally:
                if self.tasks.get(key) is asyncio.current_task():
                    self.tasks.pop(key, None)
        self.tasks[key] = self.create_task(run())

    def stop(self):
        for task in self.tasks.values():
            task.cancel()
        self.tasks.clear()
