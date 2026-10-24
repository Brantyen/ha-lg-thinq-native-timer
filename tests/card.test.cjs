const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../custom_components/lg_thinq_native_timer/frontend/lg-thinq-timer-card.js"),"utf8");
class El {
  constructor(tag=""){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.events={};this.isConnected=false;this._text="";}
  attachShadow(){this.shadowRoot=new El("shadow");return this.shadowRoot;}
  append(...els){this.children.push(...els);}
  replaceChildren(...els){this.children=els;this._text="";}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join("");}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  dispatchEvent(e){this.lastEvent=e;return true;}
}
function setup(){
  const registry=new Map(), intervals=new Map();let next=0;
  const context=vm.createContext({HTMLElement:El,
    document:{visibilityState:"visible",createElement:tag=>{
      const C=registry.get(tag);return C?new C():new El(tag);
    }},
    customElements:{get:k=>registry.get(k),define:(k,c)=>registry.set(k,c)},
    window:{},CustomEvent:class {constructor(type,data){this.type=type;Object.assign(this,data);}},
    setInterval:fn=>{intervals.set(++next,fn);return next;},
    clearInterval:id=>intervals.delete(id),Date,Number,console
  });
  vm.runInContext(source,context);
  return {Card:registry.get("lg-thinq-timer-card"),Editor:registry.get("lg-thinq-timer-card-editor"),context,intervals};
}
const entity="humidifier.test_lg";
const profile={
  relativeHourToStop:{type:"number",mode:["r","w"]},
  relativeMinuteToStop:{type:"number",mode:["r"]},
  relativeStopTimer:{type:"enum",mode:["r","w"],value:{r:["SET","UNSET"],w:["UNSET"]}}
};
function hass(handler){
  return {states:{[entity]:{state:"on",attributes:{friendly_name:"客廳除濕機"}}},
    callWS:handler|| (async()=>({response:{profile_sleepTimer:profile,observed:{timer_state:"UNSET",remaining_minutes:null}}})),
    callService:async()=>{}};
}
async function ready(env,handler){
  const card=new env.Card();card.setConfig({entity});card.hass=hass(handler);await card._read();return card;
}
test("card is registered once and empty config explains selection",()=>{
  const env=setup(),c=new env.Card();c.setConfig({});
  assert.equal(c._nodes.setup.hidden,false);
  vm.runInContext(source,env.context);
  assert.equal(env.context.window.customCards.length,1);
});
test("real ThinQ profile enables hours and leaves cancelled state explicit",async()=>{
  const c=await ready(setup());
  assert.equal(c._nodes.apply.disabled,false);
  assert.equal(c._nodes.cancel.disabled,true);
  assert.equal(c._nodes.time.textContent,"未設定");
});
test("inspect request has no minutes and set request converts dropdown hours",async()=>{
  const requests=[];const env=setup();
  const c=await ready(env,async req=>{
    requests.push(req);
    return {response:req.service==="inspect_timer"?
      {profile_sleepTimer:profile,observed:{timer_state:"UNSET"}}:
      {accepted_by_api:true,verified_by_readback:true,observed:{timer_state:"SET",remaining_minutes:120}}};
  });
  c._hours=2;await c._action("set_timer");
  assert.deepEqual(Object.keys(requests[0].service_data),["entity_id"]);
  assert.equal(requests[1].service_data.minutes,120);
  assert.equal(requests[1].return_response,true);
  assert.match(c._message,/已確認/);
});
test("cancel request never carries a stale minutes field",async()=>{
  const requests=[];const c=await ready(setup(),async req=>{
    requests.push(req);return {response:{profile_sleepTimer:profile,
      observed:{timer_state:"SET",remaining_minutes:58},verified_by_readback:true}};
  });
  await c._action("cancel_timer");
  assert.deepEqual(Object.keys(requests[1].service_data),["entity_id"]);
  assert.equal(requests[1].service,"cancel_timer");
});
test("API acceptance without verified state is not presented as success",async()=>{
  const c=await ready(setup());c._hass.callWS=async()=>({response:{accepted_by_api:true,verified_by_readback:false}});
  await c._action("set_timer");
  assert.match(c._message,/尚待 LG 確認/);assert.doesNotMatch(c._message,/已設定/);
});
test("rejected command is visible and controls recover",async()=>{
  const c=await ready(setup());c._hass.callWS=async()=>{throw new Error("LG error 2207");};
  await c._action("set_timer");
  assert.equal(c._error,true);assert.match(c._nodes.message.textContent,/2207/);
  assert.equal(c._busy,false);assert.equal(c._nodes.apply.disabled,false);
});
test("profile range limits dropdown and presets",async()=>{
  const c=await ready(setup());
  c._profile={relativeHourToStop:{mode:["w"],value:{w:{min:1,max:3,step:1}}}};
  c._syncControls();
  assert.deepEqual(Array.from(c._availableHours()),[1,2,3]);
  assert.equal(c._nodes.chips.find(x=>x.hours===8).button.disabled,true);
});
test("late previous-device response cannot overwrite selected device",async()=>{
  const env=setup();let resolve;
  const c=new env.Card();c.setConfig({entity});c.hass=hass(()=>new Promise(r=>resolve=r));
  const pending=c._read();c.setConfig({entity:"humidifier.other_lg"});
  resolve({response:{profile_sleepTimer:profile,observed:{timer_state:"SET",remaining_minutes:58}}});
  await pending;assert.equal(c._observed,null);assert.equal(c._validated,false);
});
test("off and unavailable disable timer apply; disconnect clears polling",async()=>{
  const env=setup(),c=await ready(env);
  for(const state of ["off","unavailable","unknown"]){
    c._hass.states[entity].state=state;c._update();assert.equal(c._nodes.apply.disabled,true);
  }
  c.connectedCallback();assert.equal(env.intervals.size,2);
  c.disconnectedCallback();assert.equal(env.intervals.size,0);
});
test("power uses selected entity and does not send a timer action",async()=>{
  const c=await ready(setup());const calls=[];
  c._hass.callService=async(...args)=>calls.push(args);
  await c._power();assert.equal(calls[0][0],"homeassistant");assert.equal(calls[0][1],"turn_off");
  assert.equal(calls[0][2].entity_id,entity);
});
test("title is text, configuration rejects non-power entities",()=>{
  const {Card}=setup(),c=new Card();
  c.setConfig({name:"<img src=x onerror=alert(1)>"});
  assert.equal(c._nodes.title.textContent,"<img src=x onerror=alert(1)>");
  assert.throws(()=>c.setConfig({entity:"sensor.humidity"}));
});
test("graphical editor preserves config when selecting an entity",()=>{
  const {Editor}=setup(),e=new Editor();e.setConfig({type:"custom:lg-thinq-timer-card",name:"客廳"});
  e._change("entity",entity);
  assert.equal(e.lastEvent.type,"config-changed");
  assert.equal(e.lastEvent.detail.config.entity,entity);
  assert.equal(e.lastEvent.detail.config.name,"客廳");
});
