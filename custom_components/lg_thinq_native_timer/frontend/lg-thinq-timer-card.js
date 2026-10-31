/* LG ThinQ Native Timer Card v0.2.5. No external scripts or credentials. */
(() => {
  "use strict";
  const TAG = "lg-thinq-timer-card";
  const DOMAIN = "lg_thinq_native_timer";
  const E = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const B = (label, fn, cls) => {
    const el = E("button", label, cls);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  };
  const icon = (name) => {
    const el = E("ha-icon"); el.setAttribute("icon", name); return el;
  };
  const CSS = [
    ":host{display:block;min-width:0;height:auto;align-self:start;--accent:#2d71f5;--soft:rgba(45,113,245,.09);--muted:var(--secondary-text-color,#6f7785);font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif)}",
    "ha-card{display:block;padding:24px;border-radius:28px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--primary-text-color,#1c2431);border:1px solid var(--divider-color,rgba(0,0,0,.06));box-shadow:var(--ha-card-box-shadow,0 4px 22px rgba(20,40,80,.04));overflow:hidden}",
    "*{box-sizing:border-box}.header,.row{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:20px;line-height:1.4;margin:0;font-weight:700}.sub{font-size:12px;color:var(--muted);margin:5px 0 0;line-height:1.6}",
    "button,select{font:inherit}button{cursor:pointer;border:0;min-height:44px;border-radius:14px;font-weight:600;transition:background .15s,opacity .15s}button:disabled{opacity:.42;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}",
    ".power{width:48px;height:48px;flex:0 0 48px;border-radius:50%;background:var(--soft);color:var(--accent)}.power[data-on=false]{color:var(--muted);background:var(--secondary-background-color,#f1f3f6)}",
    ".device-state{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin-top:18px}.dot{width:6px;height:6px;border-radius:50%;background:#8c94a2}.dot[data-on=true]{background:#28ae7b}",
    ".dial{width:190px;height:190px;max-width:100%;margin:18px auto 22px;border-radius:50%;border:9px solid var(--soft);display:flex;align-items:center;justify-content:center;text-align:center;flex-direction:column;gap:6px}.dial ha-icon{--mdc-icon-size:26px;color:var(--accent)}.time{max-width:100%;font-size:30px;font-weight:700;letter-spacing:-1px;font-variant-numeric:tabular-nums;line-height:1.3}.dial-label{max-width:148px;font-size:11px;line-height:1.5;color:var(--muted)}",
    ".section-label{display:block;font-size:14px;font-weight:600;margin-bottom:10px}.select{display:block;width:100%;height:50px;border:1px solid var(--divider-color,#e4e8ef);border-radius:14px;padding:0 14px;background:var(--secondary-background-color,#f6f7fa);color:inherit;font-size:16px}",
    ".presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 18px}.preset{background:var(--secondary-background-color,#f3f5f8);color:var(--muted);font-size:13px}.preset[aria-pressed=true]{background:var(--soft);color:var(--accent)}",
    ".apply{display:block;width:100%;background:var(--accent);color:#fff;font-size:16px;min-height:50px}.cancel{display:block;width:100%;background:transparent;color:var(--muted);margin-top:6px}.footer{border-top:1px solid var(--divider-color,#e7eaf0);padding-top:14px;margin-top:8px}.refresh{background:transparent;color:var(--accent);min-height:36px;padding:0 10px;font-size:13px}.stamp{font-size:11px;color:var(--muted);line-height:1.6}",
    ".message{font-size:13px;line-height:1.6;margin:10px 0 0;min-height:21px;overflow-wrap:anywhere}.message[data-error=true]{color:var(--error-color,#d64444)}.message[data-error=false]{color:var(--muted)}.setup{font-size:14px;line-height:1.8;color:var(--muted);padding:30px 0}ha-icon{display:inline-flex;align-items:center;justify-content:center}",
    "@media(max-width:360px){ha-card{padding:18px}.dial{width:168px;height:168px}.time{font-size:27px}.presets{gap:5px}.preset{font-size:12px}}"
  ].join("\n");

  class LGTimerCard extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:"open"});
      this._generation=0; this._hours=2; this._busy=false; this._validated=false;
    }
    static getConfigElement() { return document.createElement(TAG+"-editor"); }
    static getStubConfig() { return {name:"LG 除濕機"}; }
    getCardSize() { return Math.ceil((this.shadowRoot?.querySelector?.('ha-card')?.getBoundingClientRect?.().height || 650) / 50); }
    getGridOptions() { return {columns:12,rows:"auto",min_columns:6}; }
    setConfig(config) {
      if (config.entity && !/^(switch|humidifier)\.[a-z0-9_]+$/.test(config.entity))
        throw new Error("請選擇官方 LG ThinQ 除濕機的 switch 或 humidifier 實體。");
      if (config.power_entity && !/^(switch|humidifier)\.[a-z0-9_]+$/.test(config.power_entity))
        throw new Error("電源實體必須是 switch 或 humidifier。");
      const changed = this._config?.entity !== config.entity;
      this._config={...config};
      if(changed) {
        this._generation++; this._observed=null; this._profile=null;
        this._readAt=null; this._pending=null; this._confirmation=null; this._validated=false; this._busy=false; this._message="";
      }
      if(!this._nodes) this._build();
      this._syncControls(); this._update();
      if(changed && this.isConnected && this._hass && config.entity) this._read();
    }
    set hass(hass) {
      this._hass=hass;
      if(!this._config) return;
      this._subscribe();
      this._update();
      if(this.isConnected && this._config.entity && !this._requested) {
        this._requested=true; this._read();
      }
    }
    connectedCallback() {
      this._subscribe();
      this._fastPoll=setInterval(()=> {
        if(document.visibilityState!=="hidden" && this._pending) this._read();
      },15000);
      this._poll=setInterval(()=> {
        if(document.visibilityState!=="hidden" && this._config?.entity) this._read();
      },300000);
      this._tick=setInterval(()=>this._renderTimer(),1000);
      if(this._hass && this._config?.entity) { this._requested=true; this._read(); }
    }
    disconnectedCallback() {
      clearInterval(this._poll); clearInterval(this._tick); clearInterval(this._fastPoll);
      this._unsubscribe?.();this._unsubscribe=null;
      this._requested=false;
      this._generation++; this._busy=false;
    }
    _subscribe() {
      if(!this.isConnected || this._unsubscribe || this._subscribing
          || !this._hass?.connection?.subscribeEvents) return;
      this._subscribing=true;
      const gen=this._generation;
      this._hass.connection.subscribeEvents(event=> {
        // Different official entities can refer to the same LG device.
        // Re-read this card's entity instead of assuming the caller's ID matches.
        if(this._config?.entity) {
          if(this._busy) this._refreshQueued=true;
          else this._read();
        }
      },DOMAIN+"_updated").then(unsubscribe=> {
        this._subscribing=false;
        if(!this.isConnected || gen!==this._generation) unsubscribe();
        else this._unsubscribe=unsubscribe;
      }).catch(()=> {this._subscribing=false;});
    }
    _applyConfirmation(confirmation) {
      this._confirmation=confirmation||null;
      this._pending=confirmation?.status==="pending" ? confirmation.operation : null;
    }
    _flushRefresh() {
      if(this._refreshQueued) {this._refreshQueued=false;this._read();}
    }
    _build() {
      const style=E("style",CSS), card=E("ha-card");
      const header=E("div",undefined,"header"), titles=E("div");
      const title=E("h2"), sub=E("p","原生關機定時 · LG ThinQ","sub");
      titles.append(title,sub);
      const power=B("",()=>this._power(),"power"); power.append(icon("mdi:power"));
      power.setAttribute("aria-label","切換除濕機電源");
      header.append(titles,power);
      const device=E("div",undefined,"device-state"), dot=E("span",undefined,"dot"), state=E("span");
      device.append(dot,state);
      const setup=E("div","請編輯卡片，從下拉選單選擇你的 LG 除濕機。","setup");
      const content=E("div"), dial=E("div",undefined,"dial");
      const time=E("div","—","time"), timerLabel=E("div","尚未讀取","dial-label");
      dial.append(icon("mdi:timer-outline"),time,timerLabel);
      const label=E("label","幾小時後關機","section-label");
      const select=E("select",undefined,"select"); select.setAttribute("aria-label","幾小時後關機");
      label.append(select);
      select.addEventListener("change",()=> {this._hours=Number(select.value);this._syncControls();});
      const presets=E("div",undefined,"presets");
      const chips=[1,2,4,8].map(h=> {
        const b=B(h+" 小時",()=> {this._hours=h;this._syncControls();},"preset");
        b.setAttribute("aria-pressed","false"); presets.append(b); return {hours:h,button:b};
      });
      const apply=B("套用定時",()=>this._action("set_timer"),"apply");
      const cancel=B("取消定時",()=>this._action("cancel_timer"),"cancel");
      const footer=E("div",undefined,"footer row"), stamp=E("div",undefined,"stamp");
      const refresh=B("重新整理",()=>this._read(),"refresh"); footer.append(stamp,refresh);
      const message=E("div",undefined,"message"); message.setAttribute("role","status");
      message.setAttribute("aria-live","polite");
      content.append(dial,label,presets,apply,cancel,footer);
      card.append(header,device,setup,content,message); this.shadowRoot.append(style,card);
      this._nodes={title,power,dot,state,setup,content,time,timerLabel,select,chips,apply,cancel,stamp,refresh,message};
    }
    _availableHours() {
      const spec=this._profile?.relativeHourToStop;
      const range=spec?.value?.w;
      return Array.from({length:12},(_,i)=>i+1).filter(h=>{
        if(Array.isArray(range)) return range.includes(h);
        if(range && typeof range==="object") {
          const step=range.step||1;
          return h>=range.min && h<=range.max && (h-range.min)%step===0
            && !(range.except||[]).includes(h);
        }
        return true;
      });
    }
    _syncControls() {
      if(!this._nodes) return;
      const n=this._nodes, hours=this._availableHours(), key=hours.join(",");
      if(this._optionKey!==key) {
        n.select.replaceChildren(...hours.map(h=>{
          const option=E("option",h+" 小時後關機"); option.value=String(h); return option;
        }));
        this._optionKey=key;
      }
      if(!hours.includes(this._hours)) this._hours=hours[0]||1;
      n.select.value=String(this._hours);
      const hourSpec=this._profile?.relativeHourToStop;
      const canSet=hourSpec?.mode?.includes("w");
      const canCancel=this._profile?.relativeStopTimer?.mode?.includes("w")
        && this._profile?.relativeStopTimer?.value?.w?.includes("UNSET");
      const powerState=this._hass?.states?.[this._config?.power_entity || this._config?.entity]?.state;
      const online=powerState && !["unknown","unavailable"].includes(powerState);
      n.select.disabled=this._busy;
      n.apply.disabled=this._busy || !this._validated || !canSet || !online || powerState==="off" || !hours.length;
      n.cancel.disabled=this._busy || !this._validated || !canCancel || this._observed?.timer_state!=="SET";
      n.power.disabled=this._busy || !this._validated || !online;
      n.refresh.disabled=this._busy || !this._hass;
      n.apply.textContent=this._busy?"處理中…":"套用定時";
      for(const {hours:h,button} of n.chips) {
        button.setAttribute("aria-pressed",String(h===this._hours));
        button.disabled=this._busy || !hours.includes(h);
      }
    }
    _update() {
      if(!this._nodes) return;
      const n=this._nodes, entity=this._config?.entity, state=this._hass?.states?.[this._config?.power_entity || entity];
      n.title.textContent=this._config?.name||state?.attributes?.friendly_name||"LG 除濕機";
      n.setup.hidden=Boolean(entity); n.content.hidden=!entity; n.power.hidden=!entity;
      const isOn=state && !["off","unknown","unavailable"].includes(state.state);
      n.power.setAttribute("data-on",String(Boolean(isOn)));
      n.dot.setAttribute("data-on",String(Boolean(isOn)));
      n.state.textContent=!entity?"尚未選擇設備":!state?"找不到所選實體":
        state.state==="unavailable"?"設備無法連線":state.state==="unknown"?"設備狀態未知":
        isOn?"運轉中":"已關機";
      n.message.textContent=this._message||"";
      n.message.setAttribute("data-error",String(Boolean(this._error)));
      n.stamp.textContent=this._readAt ?
        "更新於 "+new Date(this._readAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+" · 前景每 5 分鐘同步"
        : "從 LG 讀取原生定時";
      this._syncControls(); this._renderTimer();
    }
    _renderTimer() {
      if(!this._nodes) return;
      const n=this._nodes, obs=this._observed;
      if(this._pending) {
        n.time.textContent="等待確認";n.timerLabel.textContent="正在同步 LG 定時狀態";return;
      }
      if(this._confirmation?.status==="unconfirmed") {
        n.time.textContent="尚未確認";n.timerLabel.textContent="請在 ThinQ App 確認定時";return;
      }
      if(!obs) {n.time.textContent="—";n.timerLabel.textContent="尚未讀取";return;}
      if(obs.timer_state==="UNSET") {n.time.textContent="未設定";n.timerLabel.textContent="原生關機定時";return;}
      if(obs.timer_state==="SET" && Number.isFinite(obs.remaining_minutes)) {
        const mins=Math.max(0,Math.ceil(obs.remaining_minutes-(Date.now()-this._readAt)/60000));
        if(mins===0) {n.time.textContent="等待確認";n.timerLabel.textContent="等待 LG 更新到時狀態";return;}
        const h=Math.floor(mins/60), m=mins%60;
        n.time.textContent=h?"約 "+h+" 小時"+(m?" "+m+" 分":""):"約 "+m+" 分鐘";
        n.timerLabel.textContent="預估剩餘時間 · 以 LG 回報為準";return;
      }
      n.time.textContent=obs.timer_state==="SET"?"已設定":"—";
      n.timerLabel.textContent="尚未取得剩餘時間";
    }
    async _call(service,data) {
      const response=await this._hass.callWS({
        type:"call_service",domain:DOMAIN,service,service_data:data,return_response:true
      });
      const result=response?.response;
      if(!result || typeof result!=="object") throw new Error("未收到定時回應，請確認後端整合已更新。");
      return result;
    }
    async _read() {
      if(this._busy || !this._hass || !this._config?.entity) return;
      const gen=this._generation; this._busy=true;this._update();
      try {
        const r=await this._call("inspect_timer",{entity_id:this._config.entity});
        if(gen!==this._generation) return;
        this._profile=r.profile_sleepTimer||{};
        this._observed=r.observed;this._readAt=Date.now();this._validated=true;
        this._applyConfirmation(r.confirmation);
        this._error=false;
        this._message=this._pending?"指令已送出，正在背景同步 LG 狀態。":
          this._confirmation?.status==="unconfirmed"?"尚未確認定時結果，請在 ThinQ App 確認。":"";
      } catch(e) {
        if(gen===this._generation) {this._error=true;this._message=e.message||String(e);}
      } finally {if(gen===this._generation){this._busy=false;this._update();this._flushRefresh();}}
    }
    async _action(service) {
      if(this._busy || !this._validated) return;
      const gen=this._generation;this._confirmation=null;this._pending=service;this._busy=true;this._error=false;this._message="正在送出定時並同步 LG 狀態…";this._update();
      const data={entity_id:this._config.entity};
      if(service==="set_timer") data.minutes=this._hours*60;
      try {
        const r=await this._call(service,data);
        if(gen!==this._generation) return;
        if(r.observed) {this._observed=r.observed;this._readAt=Date.now();}
        if(r.confirmation) this._applyConfirmation(r.confirmation);
        else if(r.verified_by_readback) this._pending=null;
        this._message=r.verified_by_readback?
          (service==="set_timer"?"定時已設定，LG 狀態已確認。":"定時已取消，LG 狀態已確認。"):
          "指令已送出，尚待 LG 確認；正在自動同步。";
      } catch(e) {
        if(gen===this._generation){this._pending=null;this._error=true;this._message=e.message||String(e);}
      } finally {if(gen===this._generation){this._busy=false;this._update();this._flushRefresh();}}
    }
    async _power() {
      if(this._busy || !this._validated) return;
      const powerEntity=this._config.power_entity || this._config.entity;
      const state=this._hass.states[powerEntity]?.state;
      const gen=this._generation;this._busy=true;this._update();
      try {
        await this._hass.callService("homeassistant",state==="off"?"turn_on":"turn_off",{entity_id:powerEntity});
        if(gen===this._generation) {this._error=false;this._message="電源指令已送出，等待設備回報。";}
      } catch(e) {
        if(gen===this._generation){this._error=true;this._message=e.message||String(e);}
      } finally {if(gen===this._generation){this._busy=false;this._update();this._flushRefresh();}}
    }
  }

  class LGTimerEditor extends HTMLElement {
    constructor(){super();this.attachShadow({mode:"open"});}
    setConfig(config){this._config={...config};this._render();}
    set hass(hass){
      this._hass=hass;
      if(!this._loading && !this._registry) {
        this._loading=true;
        hass.callWS({type:"config/entity_registry/list"}).then(r=>{
          this._registry=r;this._loading=false;this._render();
        }).catch(()=>{this._registry=[];this._loading=false;this._render();});
      }
      this._render();
    }
    _change(key,value){
      this._config={...this._config,[key]:value};
      this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:true,composed:true}));
    }
    _render(){
      if(!this._config) return;
      const wrap=E("div");wrap.style.padding="12px";
      const nameLabel=E("label","卡片名稱"), name=E("input");
      name.value=this._config.name||"";name.setAttribute("aria-label","卡片名稱");
      name.style.cssText="display:block;width:100%;box-sizing:border-box;margin:8px 0 20px;padding:12px;font:inherit";
      name.addEventListener("change",()=>this._change("name",name.value));nameLabel.append(name);
      const label=E("label","定時與狀態實體"), select=E("select");
      select.setAttribute("aria-label","定時與狀態實體");
      select.style.cssText="display:block;width:100%;margin:8px 0;padding:12px;font:inherit";
      const none=E("option","請選擇官方 LG ThinQ 除濕機");none.value="";select.append(none);
      const candidates=(this._registry||[]).filter(e=>e.platform==="lg_thinq"
        && /^(switch|humidifier)\./.test(e.entity_id) && !e.disabled_by);
      for(const e of candidates) {
        const state=this._hass?.states?.[e.entity_id];
        const option=E("option",(state?.attributes?.friendly_name||e.entity_id)+" · "+e.entity_id);
        option.value=e.entity_id;select.append(option);
      }
      if (this._config.entity && !candidates.some(e=>e.entity_id===this._config.entity)) {
        const saved=E("option",this._config.entity+"（目前設定）");
        saved.value=this._config.entity;select.append(saved);
      }
      select.value=this._config.entity||"";
      select.addEventListener("change",()=>this._change("entity",select.value));
      label.append(select);
      const note=E("p",this._loading?"載入設備清單中…":
        !candidates.length?"找不到官方 LG ThinQ 實體；請先設定官方整合，或在 YAML 模式填入已測試成功的實體 ID。":
        "選擇除濕機的電源 switch 或 humidifier 實體。卡片會檢查是否為除濕機。");
      note.style.cssText="font-size:13px;line-height:1.7;color:var(--secondary-text-color)";
      const timerInputLabel=E("label","定時實體 ID（也可直接貼上）"), timerInput=E("input");
      timerInput.value=this._config.entity||"";timerInput.setAttribute("aria-label","定時實體 ID");
      timerInput.style.cssText=name.style.cssText;
      timerInput.addEventListener("change",()=>this._change("entity",timerInput.value.trim()));
      timerInputLabel.append(timerInput);
      const powerLabel=E("label","電源實體（留空時沿用定時實體）"), powerSelect=E("select");
      powerSelect.setAttribute("aria-label","電源實體");powerSelect.style.cssText=select.style.cssText;
      const same=E("option","沿用定時實體");same.value="";powerSelect.append(same);
      const powers=[...candidates];
      if(this._config.power_entity && !powers.some(e=>e.entity_id===this._config.power_entity))
        powers.push({entity_id:this._config.power_entity});
      for(const e of powers) {
        const option=E("option",(this._hass?.states?.[e.entity_id]?.attributes?.friendly_name||e.entity_id)+" · "+e.entity_id);
        option.value=e.entity_id;powerSelect.append(option);
      }
      powerSelect.value=this._config.power_entity||"";
      powerSelect.addEventListener("change",()=>this._change("power_entity",powerSelect.value));
      powerLabel.append(powerSelect);
      const powerInputLabel=E("label","電源實體 ID（也可直接貼上）"), powerInput=E("input");
      powerInput.value=this._config.power_entity||"";powerInput.style.cssText=name.style.cssText;
      powerInput.setAttribute("aria-label","電源實體 ID");
      powerInput.addEventListener("change",()=>this._change("power_entity",powerInput.value.trim()));
      powerInputLabel.append(powerInput);
      wrap.append(nameLabel,label,timerInputLabel,powerLabel,powerInputLabel,note);this.shadowRoot.replaceChildren(wrap);
    }
  }
  if(!customElements.get(TAG)) customElements.define(TAG,LGTimerCard);
  if(!customElements.get(TAG+"-editor")) customElements.define(TAG+"-editor",LGTimerEditor);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type===TAG)) window.customCards.push({
    type:TAG,name:"LG ThinQ 原生定時",description:"ThinQ 風格的除濕機原生定時選單、狀態與取消按鈕",preview:true
  });
})();

