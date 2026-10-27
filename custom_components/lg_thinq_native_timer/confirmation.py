"""Bounded status confirmation; this module never sends control commands."""
import asyncio


def matches(observed, service, minutes=None):
    if not observed:
        return False
    if service == "cancel_timer":
        return observed.get("timer_state") == "UNSET"
    remaining = observed.get("remaining_minutes")
    return (observed.get("timer_state") == "SET"
            and isinstance(remaining, (int, float))
            and not isinstance(remaining, bool)
            and max(0, minutes - 2) <= remaining <= minutes)


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
