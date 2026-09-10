(()=>{
"use strict";

const canvas=document.getElementById("world"),ctx=canvas.getContext("2d",{alpha:false});
const popEl=document.getElementById("pop"),dayEl=document.getElementById("day"),eraEl=document.getElementById("era");
const history=document.getElementById("history"),historyList=document.getElementById("historyList");
const civPanel=document.getElementById("civilization"),civBody=document.getElementById("civBody"),settlementNameEl=document.getElementById("settlementName"),settlementEraEl=document.getElementById("settlementEra");
const citizen=document.getElementById("citizen"),citizenName=document.getElementById("citizenName"),citizenSub=document.getElementById("citizenSub"),citizenBody=document.getElementById("citizenBody");
const brushPanel=document.getElementById("brushPanel"),brushBtn=document.getElementById("brushBtn"),brushLabel=document.getElementById("brushLabel");
const status=document.getElementById("status"),pauseBtn=document.getElementById("pauseBtn"),speedBtn=document.getElementById("speedBtn"),toast=document.getElementById("toast");
const gameMenu=document.getElementById("gameMenu"),menuTitle=document.getElementById("menuTitle"),menuSubtitle=document.getElementById("menuSubtitle"),menuBody=document.getElementById("menuBody"),menuSegments=document.getElementById("menuSegments");
const inspectBtn=document.getElementById("inspectBtn"),toolIcon=document.getElementById("toolIcon"),toolName=document.getElementById("toolName"),toolHint=document.getElementById("toolHint");
const layerBtn=document.getElementById("layerBtn"),layerIcon=document.getElementById("layerIcon"),layerLabel=document.getElementById("layerLabel");
const miniMap=document.getElementById("miniMap"),miniMapMode=document.getElementById("miniMapMode"),mmctx=miniMap.getContext("2d",{alpha:false}),miniMapPanel=document.getElementById("miniMapPanel"),miniMapToggle=document.getElementById("miniMapToggle"),uiToggleBtn=document.getElementById("uiToggleBtn"),appEl=document.getElementById("app");

let WORLD_W=200,WORLD_H=200,N=WORLD_W*WORLD_H;
const T={DEEP:0,WATER:1,SAND:2,GRASS:3,FOREST:4,MOUNTAIN:5,SNOW:6,LAVA:7};
let terrain,height,moisture,food,trees,rocks,iron,gold,wet,scar,burn,trail,shoreDistance;
const U={CAVE:0,DIRT:1,STONE:2,DEEP:3,WATER:4,MAGMA:5};
let underground,uStone,uIron,uGold,uCoal,uCrystal,uGlow;
let TEX=2;
const terrainCanvas=document.createElement("canvas"),tctx=terrainCanvas.getContext("2d");
const undergroundCanvas=document.createElement("canvas"),uctx=undergroundCanvas.getContext("2d");
function allocateWorld(size=200){
  const allowed=[100,150,200,300,500];
  const s=allowed.includes(Number(size))?Number(size):200;
  WORLD_W=s;WORLD_H=s;N=s*s;
  TEX=textureScaleForWorld(s);
  terrain=new Uint8Array(N);height=new Float32Array(N);moisture=new Float32Array(N);
  food=new Uint8Array(N);trees=new Uint8Array(N);rocks=new Uint8Array(N);
  iron=new Uint8Array(N);gold=new Uint8Array(N);wet=new Uint8Array(N);
  scar=new Uint8Array(N);burn=new Uint8Array(N);trail=new Uint8Array(N);shoreDistance=new Float32Array(N);
  underground=new Uint8Array(N);uStone=new Uint8Array(N);uIron=new Uint8Array(N);
  uGold=new Uint8Array(N);uCoal=new Uint8Array(N);uCrystal=new Uint8Array(N);
  uGlow=new Uint8Array(N);
  terrainCanvas.width=WORLD_W*TEX;terrainCanvas.height=WORLD_H*TEX;
  undergroundCanvas.width=WORLD_W*TEX;undergroundCanvas.height=WORLD_H*TEX
}
allocateWorld(200);
const names=["Mara","Dren","Tala","Korin","Nia","Rook","Sela","Bram","Ira","Eren","Veya","Lio","Asha","Toren","Mira","Kael","Rin","Orin","Nora","Vale","Edda","Jori","Lena","Oren","Tavi","Sora","Dara","Milo"];
const nameStart=["Ael","Ar","Ash","Bel","Bra","Cal","Cor","Da","Del","El","Eri","Fa","Fen","Gal","Hal","Ily","Jar","Ka","Kel","Kor","La","Len","Ma","Mer","Na","Ner","O","Or","Ra","Ren","Sa","Sel","Ta","Tor","Va","Vel","Wen","Yor","Zel"];
const nameMiddle=["","a","e","i","o","u","an","en","in","or","ar","el","ir","al","on","eth","is","ra","ri","lo","va","na"];
const nameEnd=["","a","an","ar","as","en","er","eth","ia","ian","in","ir","is","o","on","or","os","ra","ren","ric","rin","sa","ta","us","yn"];
const familyStart=["Oak","River","Stone","Green","Ash","Moon","Dawn","Vale","Hill","Pine","Wolf","Fox","Red","Grey","Bright","Deep","North","South","High","Low","Wild","Mist","Sun","Star"];
const familyEnd=["born","brook","crest","field","ford","grove","hall","hart","mere","ridge","root","run","stead","stone","vale","ward","wood","fall","reach","song"];
const usedNames=new Set(),usedFirstNames=new Set();
const techNames=["Shelter","Storage","Agriculture","Stoneworking","Mining","Village Planning","Granaries","Roads"];
const settlementNameA=["Oak","River","Stone","Green","Dawn","Vale","High","Low","Bright","North","South","Mist","Sun","Star","Pine","Grey","Wild","Red","Moon","Ash","Iron","Gold"];
const settlementNameB=["haven","ford","mere","fall","reach","stead","watch","brook","vale","crest","field","grove","rest","wick","gate","hold","run","ridge","harbor","hearth"];
const kingdomWords=["Crown","Realm","Kingdom","Union","Dominion","League","Confederacy"];
const civIdentities=["Agrarian","Mercantile","Expansionist","Peaceful","Traditional","Scholarly","Militaristic","Explorer"];
const polityColors=["#d96b5f","#6c9dd8","#d6b25d","#73b26b","#a678cf","#d482b4","#65b6ae","#c98255","#91a95e","#8b9ee6"];
const cultureColors=["#d88b5b","#65a77f","#6f93d6","#bf74a8","#d5b45d","#7f72c9","#69b6bb","#c96f67","#89a95e","#b38b62"];
const cultureValuePool=["Family","Honor","Trade","Learning","Courage","Hospitality","Tradition","Freedom","Craft","Nature","Faith","Exploration","Discipline","Community"];
const customPool=["Shared evening meals","Ancestor stories","Seasonal feasts","Coming-of-age walks","Market-day songs","River blessings","Harvest dances","Memorial fires","Guest-gifting","Story circles","Name-day celebrations","Craft marks"];
const faithWordA=["Path","Way","Covenant","Light","Voice","Children","Witness","Flame","Breath","Song","Circle","Order"];
const faithWordB=["Sky","Creator","Rain","Dawn","Mercy","Storm","Earth","Flame","Stars","Silence","Living World","First Light"];
const currencyRoots=["crown","mark","sun","leaf","river","star","stone","talon","ember","grain","ring","vale"];
const divinePositive=new Set(["rain","heal","bless","food","trees","land","grass","forest","creation"]);
const divineFearful=new Set(["lightning","fire","lava","drought","water","mountain"]);

let people=[],buildings=[],events=[],particles=[],clouds=[],constructionQueue=[],critters=[],visualEffects=[],settlements=[],kingdoms=[],wars=[],tradeRoutes=[],cultures=[],religions=[],holySites=[],divineChronicle=[];
let settlement=null,day=1,tick=0,paused=false,speed=1,tool="inspect",brush=12,selected=null,dirty=true,worldSeed=1,visualTime=0,selectedSettlementId=1,nextSettlementId=1,nextKingdomId=1,nextWarId=1,nextCultureId=1,nextReligionId=1,nextHolySiteId=1,atlasMode="political";
let camX=WORLD_W/2,camY=WORLD_H/2,zoom=4,displayScale=1,pointers=new Map(),dragging=false,last={x:0,y:0},pinchStart=null,paintStamp=0,lastSim=0,toastTimer=null,nextPersonId=1,nextBuildingId=1,nextCritterId=1;
let mainTab="world",worldSection="overview",newWorldArmed=false,resetWorldArmed=false;
let activeLayer="surface",resourceLayer="surface",undergroundDirty=true;
const defaultWorldConfig={seed:"random",worldSize:200,landmass:50,water:50,forest:52,mountains:42,wildlife:50,startPopulation:6,startingFood:18,startingWood:8};
let worldConfig=Object.assign({},defaultWorldConfig);
let lastGeneratedConfig=Object.assign({},defaultWorldConfig);
let settings={labels:true,trails:true,dayNight:true,effects:true,autoPerformance:true};try{settings=Object.assign(settings,JSON.parse(localStorage.getItem("tinyWorldSettings")||"{}"))}catch(e){}try{worldConfig=Object.assign(worldConfig,JSON.parse(localStorage.getItem("tinyWorldConfig")||"{}"))}catch(e){}


const EMPTY_LIST=[];
let worldIndexDirty=true,buildingOrderDirty=true;
let personIndex=new Map(),buildingIndex=new Map(),alivePeopleCache=[];
let allPeopleBySettlement=new Map(),alivePeopleBySettlement=new Map(),allBuildingsBySettlement=new Map(),completeBuildingsBySettlement=new Map();
let sortedBuildingsCache=[],lastUiRefreshMs=-9999,lastMiniMapRefreshMs=-9999;
const perfState={avgMs:16.7,lastFrameMs:0,detail:1,quality:"Full",slowFrames:0,fastFrames:0};

function invalidateWorldIndex(){worldIndexDirty=true}
function invalidateBuildingOrder(){buildingOrderDirty=true}
function rebuildWorldIndex(){
  personIndex=new Map();buildingIndex=new Map();alivePeopleCache=[];
  allPeopleBySettlement=new Map();alivePeopleBySettlement=new Map();
  allBuildingsBySettlement=new Map();completeBuildingsBySettlement=new Map();
  for(const s of settlements){
    allPeopleBySettlement.set(s.id,[]);alivePeopleBySettlement.set(s.id,[]);
    allBuildingsBySettlement.set(s.id,[]);completeBuildingsBySettlement.set(s.id,[])
  }
  for(const p of people){
    personIndex.set(p.id,p);
    if(!allPeopleBySettlement.has(p.settlementId))allPeopleBySettlement.set(p.settlementId,[]);
    allPeopleBySettlement.get(p.settlementId).push(p);
    if(p.alive){
      alivePeopleCache.push(p);
      if(!alivePeopleBySettlement.has(p.settlementId))alivePeopleBySettlement.set(p.settlementId,[]);
      alivePeopleBySettlement.get(p.settlementId).push(p)
    }
  }
  for(const b of buildings){
    buildingIndex.set(b.id,b);
    if(!allBuildingsBySettlement.has(b.settlementId))allBuildingsBySettlement.set(b.settlementId,[]);
    allBuildingsBySettlement.get(b.settlementId).push(b);
    if(b.complete){
      if(!completeBuildingsBySettlement.has(b.settlementId))completeBuildingsBySettlement.set(b.settlementId,[]);
      completeBuildingsBySettlement.get(b.settlementId).push(b)
    }
  }
  worldIndexDirty=false
}
function ensureWorldIndex(){if(worldIndexDirty)rebuildWorldIndex()}
function personById(id){ensureWorldIndex();return personIndex.get(Number(id))||null}
function buildingById(id){ensureWorldIndex();return buildingIndex.get(Number(id))||null}
function alivePeople(){ensureWorldIndex();return alivePeopleCache}
function alivePopulation(){ensureWorldIndex();return alivePeopleCache.length}
function getSortedBuildings(){
  if(buildingOrderDirty){sortedBuildingsCache=[...buildings].sort((a,b)=>a.y-b.y);buildingOrderDirty=false}
  return sortedBuildingsCache
}
function adaptiveStep(bounds,base=1,target=18000){
  const area=Math.max(1,(bounds.r-bounds.l)*(bounds.b-bounds.t));
  const pressure=settings.autoPerformance?perfState.detail:1;
  const areaStep=Math.ceil(Math.sqrt(area/Math.max(2600,target/pressure)));
  return clamp(Math.max(base,areaStep),1,7)
}
function updatePerformanceClock(now){
  if(!perfState.lastFrameMs){perfState.lastFrameMs=now;return}
  const dt=clamp(now-perfState.lastFrameMs,4,120);perfState.lastFrameMs=now;
  perfState.avgMs=lerp(perfState.avgMs,dt,.055);
  if(!settings.autoPerformance){perfState.detail=1;perfState.quality="Full";return}
  if(perfState.avgMs>30){
    perfState.slowFrames++;perfState.fastFrames=0;
    if(perfState.slowFrames>18){perfState.detail=clamp(perfState.detail+.18,1,2.8);perfState.slowFrames=0}
  }else if(perfState.avgMs<20.5){
    perfState.fastFrames++;perfState.slowFrames=0;
    if(perfState.fastFrames>80){perfState.detail=clamp(perfState.detail-.10,1,2.8);perfState.fastFrames=0}
  }else{
    perfState.slowFrames=Math.max(0,perfState.slowFrames-1);
    perfState.fastFrames=Math.max(0,perfState.fastFrames-1)
  }
  perfState.quality=perfState.detail<1.18?"Full":perfState.detail<1.65?"Balanced":"Performance"
}
function performanceLabel(){return `${perfState.quality} · ${Math.round(1000/Math.max(1,perfState.avgMs))} fps est.`}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),idx=(x,y)=>y*WORLD_W+x,rnd=(a,b)=>a+Math.random()*(b-a),rndi=(a,b)=>Math.floor(rnd(a,b+1)),lerp=(a,b,t)=>a+(b-a)*t;
function mixColor(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
function textureScaleForWorld(size){return size<=100?7:size<=150?7:size<=200?6:size<=300?4:3}
function shorelineVector(x,y,wantWater){let ox=0,oy=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;const nt=terrain[idx(nx,ny)];if(wantWater?isWaterTile(nt):isLandTile(nt)){ox+=dx;oy+=dy;c++}}return c?{x:ox/c,y:oy/c,count:c}:{x:0,y:0,count:0}}
function isWaterTile(t){return t===T.WATER||t===T.DEEP}
function isLandTile(t){return !isWaterTile(t)}
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}
function fieldSample(arr,x,y){
  x=clamp(x,0,WORLD_W-1);y=clamp(y,0,WORLD_H-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(WORLD_W-1,x0+1),y1=Math.min(WORLD_H-1,y0+1);
  const tx=x-x0,ty=y-y0;
  const a=arr[idx(x0,y0)],b=arr[idx(x1,y0)],c=arr[idx(x0,y1)],d=arr[idx(x1,y1)];
  return lerp(lerp(a,b,tx),lerp(c,d,tx),ty)
}
function typeWeight(x,y,type){
  x=clamp(x,0,WORLD_W-1);y=clamp(y,0,WORLD_H-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(WORLD_W-1,x0+1),y1=Math.min(WORLD_H-1,y0+1);
  const tx=x-x0,ty=y-y0;
  const a=terrain[idx(x0,y0)]===type?1:0,b=terrain[idx(x1,y0)]===type?1:0,c=terrain[idx(x0,y1)]===type?1:0,d=terrain[idx(x1,y1)]===type?1:0;
  return lerp(lerp(a,b,tx),lerp(c,d,tx),ty)
}
function rebuildShoreDistance(){
  const INF=9999,diag=1.41421356;
  for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){
    shoreDistance[idx(x,y)]=isLandTile(terrain[idx(x,y)])?0:INF
  }
  // Fast two-pass chamfer distance transform. This creates a smooth,
  // naturally varying shallow-water shelf around every coastline.
  for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){
    const i=idx(x,y);let d=shoreDistance[i];
    if(x>0)d=Math.min(d,shoreDistance[idx(x-1,y)]+1);
    if(y>0)d=Math.min(d,shoreDistance[idx(x,y-1)]+1);
    if(x>0&&y>0)d=Math.min(d,shoreDistance[idx(x-1,y-1)]+diag);
    if(x<WORLD_W-1&&y>0)d=Math.min(d,shoreDistance[idx(x+1,y-1)]+diag);
    shoreDistance[i]=d
  }
  for(let y=WORLD_H-1;y>=0;y--)for(let x=WORLD_W-1;x>=0;x--){
    const i=idx(x,y);let d=shoreDistance[i];
    if(x<WORLD_W-1)d=Math.min(d,shoreDistance[idx(x+1,y)]+1);
    if(y<WORLD_H-1)d=Math.min(d,shoreDistance[idx(x,y+1)]+1);
    if(x<WORLD_W-1&&y<WORLD_H-1)d=Math.min(d,shoreDistance[idx(x+1,y+1)]+diag);
    if(x>0&&y<WORLD_H-1)d=Math.min(d,shoreDistance[idx(x-1,y+1)]+diag);
    shoreDistance[i]=d
  }
}
function coastDistanceAt(x,y){return fieldSample(shoreDistance,x,y)}
function normalizedShoreVector(x,y){
  const v=shorelineVector(x,y,false),len=Math.hypot(v.x,v.y)||1;
  return {x:v.x/len,y:v.y/len,count:v.count}
}
function paintedVisualSample(wx,wy,px,py){
  let h=fieldSample(height,wx,wy),m=fieldSample(moisture,wx,wy);
  const forest=typeWeight(wx,wy,T.FOREST),grass=typeWeight(wx,wy,T.GRASS),sand=typeWeight(wx,wy,T.SAND);
  const mountain=typeWeight(wx,wy,T.MOUNTAIN),snow=typeWeight(wx,wy,T.SNOW),lava=typeWeight(wx,wy,T.LAVA);
  const landWeight=clamp(forest+grass+sand+mountain+snow+lava,0,1);
  const land=smoothstep(.10,.90,landWeight);
  const organic=(Math.sin(wx*.43+wy*.17+worldSeed*.013)+Math.sin(wx*.19-wy*.51+worldSeed*.021)+Math.cos(wx*.73+wy*.29))*0.0032;
  h=clamp(h+organic,0,1);m=clamp(m+forest*.20-grass*.025,0,1);

  // Deep ocean foundation.
  const depthTone=clamp((h-.05)/.31,0,1);
  let c=mixColor([7,53,88],[16,82,124],depthTone*.68);

  // Natural shallow-water shelf generated from actual distance to land.
  // Noise gently changes shelf width so it does not form a perfect ring.
  const coastDist=coastDistanceAt(wx,wy);
  const shelfNoise=.5+.5*Math.sin(wx*.23+wy*.17+worldSeed*.011)*Math.cos(wx*.11-wy*.29);
  const shelfWidth=4.2+shelfNoise*2.3;
  const shelf=(1-land)*(1-smoothstep(1.0,shelfWidth,coastDist));
  const inner=(1-land)*(1-smoothstep(.7,2.25,coastDist));
  c=mixColor(c,[31,119,151],shelf*.72);
  c=mixColor(c,[67,169,190],inner*.58);

  const sandC=mixColor([207,184,120],[238,219,164],clamp(.28+m*.12,0,1));
  const grassC=mixColor([91,151,75],[132,187,101],clamp(m*.52+.20,0,1));
  const forestC=mixColor([44,100,55],[72,139,72],clamp(m*.62+.08,0,1));
  const mountainC=mixColor([101,106,107],[150,151,146],clamp((h-.60)*2.3,0,1));
  const snowC=[232,239,240];
  const lavaC=mixColor([113,36,21],[230,103,31],.50+.50*Math.sin(wx*.8+wy*.4));

  c=mixColor(c,sandC,clamp(sand,0,1));
  c=mixColor(c,grassC,clamp(grass,0,1));
  c=mixColor(c,forestC,clamp(forest,0,1));
  c=mixColor(c,mountainC,clamp(mountain,0,1));
  c=mixColor(c,snowC,clamp(snow,0,1));
  c=mixColor(c,lavaC,clamp(lava,0,1));

  const grain=(hash(px>>1,py>>1,worldSeed+444)-.5)*6.0;
  const broad=(Math.sin(wx*.28+wy*.11)+Math.cos(wx*.15-wy*.23))*1.45;
  let [r,g,b]=c;
  r+=grain+broad;g+=grain*.70+broad*1.05;b+=grain*.45+broad*.34;
  return [clamp(r,0,255),clamp(g,0,255),clamp(b,0,255),land]
}


function hash(x,y,s=0){let n=(x*374761393+y*668265263+s*1442695041)|0;n=(n^(n>>13))*1274126177;return((n^(n>>16))>>>0)/4294967295}
function fade(t){return t*t*(3-2*t)}
function valueNoise(x,y,scale,seed){const fx=x/scale,fy=y/scale,x0=Math.floor(fx),y0=Math.floor(fy),sx=fade(fx-x0),sy=fade(fy-y0),a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);return lerp(lerp(a,b,sx),lerp(c,d,sx),sy)}
function fbm(x,y,s){return valueNoise(x,y,108,s)*.42+valueNoise(x,y,54,s+1)*.27+valueNoise(x,y,26,s+2)*.18+valueNoise(x,y,12,s+3)*.09+valueNoise(x,y,6,s+4)*.04}
function classify(i){
  const h=height[i],m=moisture[i];
  const waterShift=(configValue("water")-50)*.0019-(configValue("landmass")-50)*.0018;
  const deep=.255+waterShift,waterLine=.345+waterShift,sandLine=.398+waterShift;
  const mountainShift=(50-configValue("mountains"))*.0017;
  const snowLine=.855+mountainShift,mountainLine=.735+mountainShift;
  const forestThreshold=.72-configValue("forest")*.0024;
  terrain[i]=h<deep?T.DEEP:h<waterLine?T.WATER:h<sandLine?T.SAND:h>snowLine?T.SNOW:h>mountainLine?T.MOUNTAIN:m>forestThreshold?T.FOREST:T.GRASS
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function saveWorldConfig(){try{localStorage.setItem("tinyWorldConfig",JSON.stringify(worldConfig))}catch(e){}}
function configValue(key){return Number(worldConfig[key]??defaultWorldConfig[key])}
function seedFromInput(v){
  const s=String(v??"random").trim();
  if(!s||s.toLowerCase()==="random")return rndi(1,999999999);
  if(/^\d+$/.test(s))return Math.max(1,Number(s)%2147483647);
  let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return Math.max(1,h>>>0)
}
function normalizeWorldConfig(cfg){
  const c=Object.assign({},defaultWorldConfig,cfg||{});
  const sizes=[100,150,200,300,500];
  c.worldSize=sizes.includes(Number(c.worldSize))?Number(c.worldSize):200;
  c.landmass=clamp(Number(c.landmass)||50,10,90);
  c.water=clamp(Number(c.water)||50,10,90);
  c.forest=clamp(Number(c.forest)||50,0,100);
  c.mountains=clamp(Number(c.mountains)||40,0,100);
  c.wildlife=clamp(Number(c.wildlife)||50,0,100);
  c.startPopulation=clamp(Math.round(Number(c.startPopulation)||6),2,20);
  c.startingFood=clamp(Math.round(Number(c.startingFood)||12),0,60);
  c.startingWood=clamp(Math.round(Number(c.startingWood)||4),0,40);
  c.seed=String(c.seed??"random");
  return c
}
function populationCapForWorld(){
  const s=configValue("worldSize");
  return s<=100?80:s<=150?120:s<=200?180:s<=300?300:450
}
function worldAreaLabel(){return `${WORLD_W}×${WORLD_H}`}
function resetCurrentWorld(){
  worldConfig=Object.assign({},lastGeneratedConfig);
  generate(true);
}
function showToast(text){clearTimeout(toastTimer);toast.textContent=text;toast.classList.remove("hidden");toastTimer=setTimeout(()=>toast.classList.add("hidden"),1350)}
function addEvent(text,kind="world"){events.unshift({day:Math.floor(day),text,kind});events=events.slice(0,160);renderHistory()}
function renderHistory(){historyList.innerHTML=events.map(e=>`<div class="event"><div class="eday">DAY ${e.day}</div><div class="etext">${escapeHtml(e.text)}</div></div>`).join("")}
function discover(name,text,s=settlement){
  if(!s||s.tech.has(name))return;s.tech.add(name);
  addEvent(text||`${s.name} discovered ${name}.`,"discovery");
  if(s===settlement)showToast(`Discovery: ${name}`)
}
function hasTech(name,s=settlement){return !!s&&s.tech.has(name)}



function cultureById(id){return cultures.find(c=>c.id===Number(id))||null}
function religionById(id){return religions.find(r=>r.id===Number(id))||null}
function cultureColor(c,alpha=1){
  const hex=cultureColors[(c?.colorIndex||0)%cultureColors.length];
  if(alpha>=1)return hex;
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${alpha})`
}
function religionColor(r,alpha=1){
  const hex=polityColors[(r?.colorIndex||0)%polityColors.length];
  if(alpha>=1)return hex;
  const n=parseInt(hex.slice(1),16),rr=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${rr},${g},${b},${alpha})`
}
function cultureNameFor(s,founders=[]){
  const root=founders[0]?surnameOf(founders[0]):s.name;
  return `${root} ${["folk","kin","ways","tradition","people","custom"][rndi(0,5)]}`
}
function cultureValuesFor(s,founders=[]){
  const values=[],add=v=>{if(v&&!values.includes(v))values.push(v)};
  const map={Agrarian:"Nature",Mercantile:"Trade",Expansionist:"Courage",Peaceful:"Hospitality",Traditional:"Tradition",Scholarly:"Learning",Militaristic:"Honor",Explorer:"Exploration"};
  add(map[s.identity]);
  if(founders.length){
    const avg=k=>founders.reduce((n,p)=>n+(p.traits?.[k]||.5),0)/founders.length;
    if(avg("kindness")>.62)add("Community");if(avg("social")>.65)add("Hospitality");
    if(avg("work")>.66)add("Craft");if(avg("bravery")>.66)add("Courage");if(avg("curiosity")>.66)add("Learning")
  }
  while(values.length<3)add(cultureValuePool[rndi(0,cultureValuePool.length-1)]);
  return values.slice(0,3)
}
function createCulture(s,founders=[],parentCulture=null){
  const c={id:nextCultureId++,name:cultureNameFor(s,founders),originSettlementId:s.id,foundedDay:Math.floor(day),parentId:parentCulture?.id||null,
    values:cultureValuesFor(s,founders),customs:[customPool[rndi(0,customPool.length-1)],customPool[rndi(0,customPool.length-1)]],
    festival:`${settlementNameA[rndi(0,settlementNameA.length-1)]} ${["Feast","Day","Gathering","Festival"][rndi(0,3)]}`,
    heroes:[],colorIndex:(nextCultureId-2)%cultureColors.length,prestige:10};
  if(parentCulture){
    c.values=[parentCulture.values[0],parentCulture.values[1],c.values.find(v=>!parentCulture.values.includes(v))||c.values[2]];
    c.customs=[parentCulture.customs[0],c.customs[1]];c.name=`${s.name} tradition`
  }
  cultures.push(c);return c
}
function settlementCulture(s){return cultureById(s?.cultureId)}
function cultureAffinity(a,b){
  if(!a||!b)return 0;if(a.cultureId&&a.cultureId===b.cultureId)return .28;
  const ca=settlementCulture(a),cb=settlementCulture(b);if(!ca||!cb)return 0;
  return ca.values.filter(v=>cb.values.includes(v)).length*.045-.035
}
function maybeCultureBranch(s){
  const parent=settlementById(s.parentId);if(!parent||s.cultureId!==parent.cultureId)return;
  if(day-s.foundedDay<34||relationScore(s,parent)>12||Math.hypot(s.x-parent.x,s.y-parent.y)<26||Math.random()>.055)return;
  const old=settlementCulture(s),branch=createCulture(s,settlementPeople(s,true).slice(0,4),old);s.cultureId=branch.id;s.culture=branch.name;
  for(const p of settlementPeople(s,true))if(Math.random()<.72)p.cultureId=branch.id;
  addEvent(`${s.name} developed the distinct ${branch.name}, branching from ${old?.name||"its parent culture"}.`,"culture")
}
function updateCultures(){
  for(const s of settlements){
    const c=settlementCulture(s);if(!c)continue;
    c.prestige=clamp((c.prestige||10)+(s.prosperity-50)*.004+settlementPopulation(s)*.003,0,100);
    const leader=settlementLeader(s);
    if(leader&&(leader.reputation||0)>48&&!c.heroes.includes(leader.id)&&Math.random()<.035){
      c.heroes.push(leader.id);c.heroes=c.heroes.slice(-8);
      addEvent(`${leader.name} entered ${c.name}'s stories as a celebrated figure.`,"culture")
    }
    for(const p of settlementPeople(s,true)){
      if(!p.cultureId)p.cultureId=s.cultureId;
      else if(p.cultureId!==s.cultureId&&Math.random()<.018*(p.age<18?2:1))p.cultureId=s.cultureId
    }
    maybeCultureBranch(s)
  }
}
function faithStance(p){const b=p?.belief||0;return b>=82?"Devout":b>=62?"Believer":b>=42?"Questioning":b>=24?"Doubtful":"Skeptic"}
function divineThemeLabel(type){
  return ({rain:"Rain",heal:"Mercy",bless:"Blessing",food:"Providence",trees:"Growth",land:"Creation",grass:"Growth",forest:"Nature",creation:"Creation",
    lightning:"Storm",fire:"Flame",lava:"Fire",drought:"Judgment",water:"Sea",mountain:"Earth",silence:"Silence"})[type]||"Mystery"
}
function creatorPerception(s){
  const mercy=s.creatorMercy||0,fear=s.creatorFear||0,age=day-(s.lastDivineDay??-999);
  if(age>55&&(s.divineAttention||0)>0)return "Distant";
  if(fear>mercy*1.7&&fear>8)return "Wrathful";if(mercy>fear*1.8&&mercy>10)return "Protective";
  if(fear>10&&mercy>7)return "Powerful";if((s.divineAttention||0)>18)return "Revered";
  if((s.divineAttention||0)>5)return "Mysterious";return "Unknown"
}
function dominantDivineTheme(s){return Object.entries(s.divineImpressions||{}).sort((a,b)=>b[1]-a[1])[0]?.[0]||"silence"}
function religionNameFor(s,theme){
  const c=settlementCulture(s),first=faithWordA[rndi(0,faithWordA.length-1)];
  let second=Math.random()<.58?divineThemeLabel(theme):faithWordB[rndi(0,faithWordB.length-1)];
  if(Math.random()<.24&&c)second=c.name.split(" ")[0];return `${first} of ${second}`
}
function doctrineFor(theme){
  return ({rain:"The Creator gives life through water and renewal.",heal:"Mercy is the highest sign of the Creator.",bless:"Blessings are gifts meant to be shared.",
    food:"Abundance carries a duty to feed others.",trees:"Living things are sacred signs of growth.",creation:"The world itself is the Creator's first teaching.",
    lightning:"Power must be respected, for judgment can arrive without warning.",fire:"Destruction and rebirth are bound together.",
    lava:"The deep earth reveals terrible divine power.",drought:"Hardship is a test of endurance and humility.",
    silence:"The Creator is unseen, and meaning must be sought through the world."})[theme]||"The Creator is known through signs, memory and the living world."
}
function prophetCandidate(s){
  return settlementPeople(s,true).filter(p=>p.age>=16).sort((a,b)=>((b.belief||0)+(b.traits?.social||.5)*25+(b.traits?.curiosity||.5)*15+(b.reputation||0)*.3)-((a.belief||0)+(a.traits?.social||.5)*25+(a.traits?.curiosity||.5)*15+(a.reputation||0)*.3))[0]||null
}
function createReligion(s,theme="silence",parentReligion=null){
  const prophet=prophetCandidate(s),r={id:nextReligionId++,name:religionNameFor(s,theme),theme,doctrine:doctrineFor(theme),originSettlementId:s.id,
    foundedDay:Math.floor(day),prophetId:prophet?.id||null,parentId:parentReligion?.id||null,holySiteIds:[],colorIndex:(nextReligionId+2)%polityColors.length,followers:0,prestige:10};
  if(parentReligion){r.name=`${s.name} ${["Reform","Way","Covenant"][rndi(0,2)]}`;r.doctrine=`A new interpretation of ${parentReligion.name}: ${doctrineFor(theme)}`}
  religions.push(r);s.religionId=r.id;
  for(const p of settlementPeople(s,true)){
    if((p.belief||0)>=34||Math.random()<.65)p.religionId=r.id;
    if(p.religionId===r.id)p.belief=clamp((p.belief||45)+rnd(4,14),0,100)
  }
  if(prophet){prophet.religionId=r.id;prophet.religiousRole="Prophet";prophet.belief=Math.max(prophet.belief||0,86);memoryAdd(prophet,`Founded ${r.name}`)}
  for(const h of holySites.filter(h=>h.settlementId===s.id&&!h.religionId)){h.religionId=r.id;r.holySiteIds.push(h.id)}
  addEvent(`${r.name} emerged in ${s.name}${prophet?` through ${prophet.name}`:""}, teaching: ${r.doctrine}`,"religion");return r
}
function settlementReligion(s){return religionById(s?.religionId)}
function religionFollowers(r){return people.filter(p=>p.alive&&p.religionId===r.id).length}
function makeHolySite(s,type,x,y){
  if(holySites.some(h=>h.settlementId===s.id&&Math.hypot(h.x-x,h.y-y)<5))return null;
  const h={id:nextHolySiteId++,settlementId:s.id,religionId:s.religionId||null,x:Math.round(x),y:Math.round(y),event:type,createdDay:Math.floor(day),name:`${divineThemeLabel(type)} Site`};
  holySites.push(h);const r=settlementReligion(s);if(r&&!r.holySiteIds.includes(h.id))r.holySiteIds.push(h.id);
  addEvent(`${s.name} began remembering the ${h.name} as a sacred place.`,"religion");return h
}
function recordDivineEvent(type,x,y,radius=8){
  const weight=divinePositive.has(type)?2:divineFearful.has(type)?2.4:1;
  divineChronicle.unshift({day:Math.floor(day),type,x:Math.round(x),y:Math.round(y)});divineChronicle=divineChronicle.slice(0,80);
  for(const s of settlements){
    const dist=Math.hypot(s.x-x,s.y-y),reach=radius+settlementRadius(s)*.75;if(dist>reach)continue;
    s.divineImpressions=s.divineImpressions||{};s.divineImpressions[type]=(s.divineImpressions[type]||0)+weight*Math.max(.35,1-dist/Math.max(1,reach));
    s.divineAttention=(s.divineAttention||0)+weight;s.lastDivineDay=day;
    if(divinePositive.has(type))s.creatorMercy=(s.creatorMercy||0)+weight;if(divineFearful.has(type))s.creatorFear=(s.creatorFear||0)+weight;
    for(const p of settlementPeople(s,true)){
      const pd=Math.hypot(p.x-x,p.y-y);if(pd>radius*1.35+3)continue;
      p.witnessedDivine=(p.witnessedDivine||0)+1;p.belief=clamp((p.belief||35)+(divinePositive.has(type)?rnd(3,8):divineFearful.has(type)?rnd(5,11):rnd(1,5)),0,100);
      p.faithStance=faithStance(p);if(Math.random()<.24)memoryAdd(p,`Witnessed divine ${divineThemeLabel(type).toLowerCase()}`)
    }
    if((type==="lightning"||type==="bless"||type==="heal"||type==="fire")&&Math.random()<.22)makeHolySite(s,type,x,y)
  }
}
function maybeReligiousSchism(s){
  const r=settlementReligion(s),origin=settlementById(r?.originSettlementId);if(!r||!origin||origin.id===s.id)return;
  if(day-r.foundedDay<35||relationScore(s,origin)>-5)return;
  const avg=settlementPeople(s,true).reduce((n,p)=>n+(p.belief||0),0)/Math.max(1,settlementPopulation(s));
  if(avg<58||Math.random()>.04)return;const branch=createReligion(s,dominantDivineTheme(s),r);addEvent(`${s.name} broke from ${r.name} and formed ${branch.name}.`,"religion")
}
function updateReligions(){
  for(const s of settlements){
    const residents=settlementPeople(s,true);if(!residents.length)continue;
    const avgBelief=residents.reduce((n,p)=>n+(p.belief||0),0)/residents.length;let r=settlementReligion(s);
    if(!r&&((s.divineAttention||0)>=8||(day-s.foundedDay>30&&avgBelief>50)))r=createReligion(s,dominantDivineTheme(s));
    if(r){
      r.followers=religionFollowers(r);r.prestige=clamp((r.prestige||10)+r.followers*.004+(s.prosperity-50)*.002,0,100);
      for(const p of residents){if(!p.religionId&&p.belief>58&&Math.random()<.04)p.religionId=r.id;else if(p.religionId!==r.id&&p.belief<45&&Math.random()<.015)p.religionId=r.id;p.faithStance=faithStance(p)}
      const clergy=residents.filter(p=>p.religionId===r.id&&p.age>=18).sort((a,b)=>(b.belief||0)-(a.belief||0)),desired=Math.max(1,Math.ceil(r.followers/18));
      for(const p of residents)if(p.religiousRole==="Priest")p.religiousRole=null;
      for(const p of clergy.slice(0,desired))if(p.religiousRole!=="Prophet")p.religiousRole="Priest";
      maybeReligiousSchism(s)
    }else for(const p of residents)p.faithStance=faithStance(p)
  }
  for(const route of tradeRoutes){
    const a=settlementById(route.aId),b=settlementById(route.bId);if(!a||!b)continue;const ra=settlementReligion(a),rb=settlementReligion(b);
    if(ra&&!rb&&relationScore(a,b)>25&&Math.random()<.035){b.religionId=ra.id;addEvent(`${ra.name} spread along the trade route into ${b.name}.`,"religion")}
    else if(rb&&!ra&&relationScore(a,b)>25&&Math.random()<.035){a.religionId=rb.id;addEvent(`${rb.name} spread along the trade route into ${a.name}.`,"religion")}
  }
}
function generatedCurrencyName(s){const c=settlementCulture(s),root=(c?.name.split(" ")[0]||s.name).toLowerCase();return `${root} ${currencyRoots[rndi(0,currencyRoots.length-1)]}${Math.random()<.45?"s":""}`}
function ensureMarket(s){
  if(!s.market)s.market={stage:"Barter",currency:null,prices:{food:1,wood:1.2,stone:1.5,iron:3,gold:7},avgWealth:0,transactions:0,lastUpdate:day};
  return s.market
}
function marketPrice(s,good){return Number(ensureMarket(s).prices[good]||1)}
function updateSocialClass(p,s){
  if(s.leaderId===p.id||kingdomRuler(settlementKingdom(s))?.id===p.id)p.socialClass="Ruling";
  else if(p.religiousRole)p.socialClass="Clergy";else if(p.economicRole==="Merchant")p.socialClass="Merchant";
  else if((p.wealth||0)>32)p.socialClass="Wealthy";else if((p.wealth||0)<2&&p.age>=18)p.socialClass="Poor";
  else if(p.job==="Builder"||p.job==="Miner")p.socialClass="Artisan";else if(p.job==="Farmer")p.socialClass="Farmer";else p.socialClass="Commoner"
}
function updateMarket(s){
  const m=ensureMarket(s),pop=Math.max(1,settlementPopulation(s));
  const price=(base,stock,target)=>clamp(base*(target/Math.max(target*.22,stock+2)),base*.42,base*4.8);
  m.prices.food=price(1,s.food,pop*2.5);m.prices.wood=price(1.2,s.wood,pop*.75);m.prices.stone=price(1.5,s.stone,pop*.42);m.prices.iron=price(3,s.iron,pop*.20);m.prices.gold=price(7,s.gold,pop*.08);
  const residents=settlementPeople(s,true),wealth=residents.reduce((n,p)=>n+(p.wealth||0),0);m.avgWealth=wealth/Math.max(1,residents.length);m.lastUpdate=day;
  const hasMarket=buildingsOf("market",true,s.id).length>0,hasTrade=tradeRoutes.some(r=>r.aId===s.id||r.bId===s.id);
  if(m.stage==="Barter"&&hasMarket&&hasTrade&&pop>=10&&(s.gold||0)>=2){m.stage="Coinage";m.currency=generatedCurrencyName(s);s.gold=Math.max(0,s.gold-1);addEvent(`${s.name} began minting ${m.currency}, replacing simple barter in its market.`,"economy")}
  for(const p of residents)updateSocialClass(p,s)
}
function routeForMerchant(s){
  return tradeRoutes.filter(r=>r.aId===s.id||r.bId===s.id).map(r=>({r,other:settlementById(r.aId===s.id?r.bId:r.aId)})).filter(x=>x.other&&relationScore(s,x.other)>0).sort((a,b)=>relationScore(s,b.other)-relationScore(s,a.other))[0]||null
}
function routeLandAccessible(a,b){for(let n=1;n<16;n++){const t=n/16,x=Math.round(lerp(a.x,b.x,t)),y=Math.round(lerp(a.y,b.y,t));if(!passable(x,y))return false}return true}
function assignMerchants(){
  for(const s of settlements){
    const residents=settlementPeople(s,true);for(const p of residents)if(p.economicRole==="Merchant")p.economicRole=null;
    const route=routeForMerchant(s);if(!route)continue;
    const candidates=residents.filter(p=>p.age>=18&&p.age<66&&p.layer!=="underground"&&p.id!==s.leaderId).sort((a,b)=>((b.traits?.social||.5)*40+(b.wealth||0)+(b.education||0)*.2)-((a.traits?.social||.5)*40+(a.wealth||0)+(a.education||0)*.2));
    for(const p of candidates.slice(0,Math.max(1,Math.min(3,Math.ceil(residents.length/16))))){
      p.economicRole="Merchant";if(!p.tradeMission&&routeLandAccessible(s,route.other)&&Math.random()<.55)p.tradeMission={homeId:s.id,destId:route.other.id,state:"outbound",startedDay:day,cargo:["food","wood","stone","iron"][rndi(0,3)]}
    }
  }
}
function merchantTravel(p){
  const m=p.tradeMission;if(!m||p.economicRole!=="Merchant")return false;
  const home=settlementById(m.homeId),dest=settlementById(m.destId);if(!home||!dest){p.tradeMission=null;return false}
  const target=m.state==="outbound"?dest:home;
  if(Math.hypot(p.x-target.x,p.y-target.y)>3){p.goal=m.state==="outbound"?`Carry goods to ${dest.name}`:`Return to ${home.name}`;p.mood="Traveling";moveToward(p,target);return true}
  if(m.state==="outbound"){
    const good=m.cargo,available=Number(home[good]||0),amount=Math.min(2,Math.max(0,Math.floor(available*.12)));if(amount){home[good]-=amount;dest[good]=(dest[good]||0)+amount}
    p.wealth=clamp((p.wealth||0)+.6+marketPrice(dest,good)*.12,0,999);ensureMarket(home).transactions++;ensureMarket(dest).transactions++;
    p.goal=`Trade in ${dest.name}`;m.state="return";memoryAdd(p,`Traded ${good} in ${dest.name}`);return true
  }
  p.tradeMission=null;p.goal=`Returned from ${dest.name}`;if(Math.random()<.25)memoryAdd(p,`Completed a trade journey to ${dest.name}`);return true
}
function updateEconomy(){
  for(const s of settlements){updateMarket(s);const pop=settlementPopulation(s),route=routeForMerchant(s);if(pop>=7&&!buildings.some(b=>b.settlementId===s.id&&b.type==="market")&&(route||day-s.foundedDay>20))queueBuilding("market",10,2,s)}
  assignMerchants()
}
function updateV10Systems(){updateCultures();updateReligions();updateEconomy()}
function settlementById(id){return settlements.find(s=>s.id===Number(id))||null}
function kingdomById(id){return kingdoms.find(k=>k.id===Number(id))||null}
function citizenSettlement(p){return settlementById(p?.settlementId)||settlement}
function settlementPeople(s,aliveOnly=true){
  if(!s)return EMPTY_LIST;ensureWorldIndex();
  return (aliveOnly?alivePeopleBySettlement:allPeopleBySettlement).get(s.id)||EMPTY_LIST
}
function settlementBuildings(s,completeOnly=false){
  if(!s)return EMPTY_LIST;ensureWorldIndex();
  return (completeOnly?completeBuildingsBySettlement:allBuildingsBySettlement).get(s.id)||EMPTY_LIST
}
function settlementPopulation(s){return settlementPeople(s,true).length}
function settlementRadius(s){
  const pop=settlementPopulation(s),built=settlementBuildings(s,true).length;
  s.territoryRadius=clamp(7+Math.sqrt(Math.max(1,pop))*2.4+built*.42,8,32);
  return s.territoryRadius
}
function uniqueSettlementName(){
  const used=new Set(settlements.map(s=>s.name));
  for(let n=0;n<80;n++){
    const name=settlementNameA[rndi(0,settlementNameA.length-1)]+settlementNameB[rndi(0,settlementNameB.length-1)];
    if(!used.has(name))return name
  }
  return `Hearth ${settlements.length+1}`
}
function settlementIdentity(founders=[]){
  if(!founders.length)return civIdentities[rndi(0,civIdentities.length-1)];
  const avg=k=>founders.reduce((a,p)=>a+(p.traits?.[k]||.5),0)/founders.length;
  if(avg("bravery")>.69)return "Militaristic";
  if(avg("curiosity")>.70)return "Explorer";
  if(avg("work")>.71)return "Agrarian";
  if(avg("social")>.70)return "Mercantile";
  if(avg("kindness")>.72)return "Peaceful";
  return civIdentities[rndi(0,civIdentities.length-1)]
}
function createSettlement(name,x,y,founders=[],parentId=null){
  const parent=parentId?settlementById(parentId):null;
  const s={id:nextSettlementId++,name:name||uniqueSettlementName(),x:Math.round(x),y:Math.round(y),food:Math.max(8,founders.length*4),wood:8,stone:0,iron:0,gold:0,coal:0,
    tech:new Set(parent?.tech||[]),births:0,deaths:0,foundedDay:Math.floor(day),parentId,leaderId:null,kingdomId:null,identity:settlementIdentity(founders),culture:"developing",
    cultureId:null,religionId:parent?.religionId||null,colorIndex:(nextSettlementId-2)%polityColors.length,territoryRadius:9,relations:{},lastExpansionDay:day,lastTradeDay:day,lastElectionDay:day,
    prosperity:50,warWeariness:0,divineImpressions:{},divineAttention:parent?(parent.divineAttention||0)*.25:0,creatorMercy:parent?(parent.creatorMercy||0)*.20:0,
    creatorFear:parent?(parent.creatorFear||0)*.20:0,lastDivineDay:-999,market:null};
  settlements.push(s);
  s.cultureId=parent?.cultureId||createCulture(s,founders,null).id;s.culture=settlementCulture(s)?.name||"developing";ensureMarket(s);
  for(const p of founders){
    const old=citizenSettlement(p);p.citizenshipHistory=p.citizenshipHistory||[];
    if(old&&old.id!==s.id)p.citizenshipHistory.unshift(`${old.name} → ${s.name}`);
    p.settlementId=s.id;p.homeId=null;p.refugee=false;if(!p.cultureId)p.cultureId=s.cultureId;if(!p.religionId&&s.religionId)p.religionId=s.religionId
  }
  invalidateWorldIndex();chooseLeader(s,true);return s
}
function leaderScore(p){
  return (p.reputation||0)*1.4+(p.traits?.social||.5)*25+(p.traits?.bravery||.5)*18+(p.education||0)*.22+Math.min(p.age,60)*.18+(p.wealth||0)*.08
}
function chooseLeader(s,silent=false){
  const candidates=settlementPeople(s,true).filter(p=>p.age>=18&&p.layer!=="underground").sort((a,b)=>leaderScore(b)-leaderScore(a));
  const old=s.leaderId,newLeader=candidates[0]||null;
  s.leaderId=newLeader?.id||null;s.lastElectionDay=day;
  if(newLeader){
    newLeader.reputation=clamp((newLeader.reputation||0)+4,0,100);
    newLeader.militaryRole=null;
    if(!silent&&old!==newLeader.id){
      const oldP=people.find(p=>p.id===old);
      addEvent(`${newLeader.name} became leader of ${s.name}${oldP?`, succeeding ${oldP.name}`:""}.`,"politics");
      memoryAdd(newLeader,`Became leader of ${s.name}`)
    }
  }
  return newLeader
}
function settlementLeader(s){return s?people.find(p=>p.id===s.leaderId&&p.alive)||null:null}
function relationScore(a,b){return Number(a?.relations?.[b?.id]??0)}
function setRelation(a,b,v){
  if(!a||!b||a.id===b.id)return;
  a.relations[b.id]=clamp(v,-100,100);b.relations[a.id]=clamp(v,-100,100)
}
function changeDiplomacy(a,b,v){setRelation(a,b,relationScore(a,b)+v)}
function relationLabel(v){
  return v>=65?"Allied":v>=30?"Friendly":v>=8?"Cordial":v>-18?"Neutral":v>-45?"Tense":"Hostile"
}
function kingdomNameFor(s){
  const leader=settlementLeader(s),root=leader?surnameOf(leader):s.name;
  return `${root} ${kingdomWords[rndi(0,kingdomWords.length-1)]}`
}
function createKingdom(capital,members=[capital]){
  const k={
    id:nextKingdomId++,name:kingdomNameFor(capital),capitalId:capital.id,
    foundedDay:Math.floor(day),memberIds:[],rulerId:capital.leaderId,
    treasury:Math.floor(capital.gold||0),colorIndex:capital.colorIndex,
    laws:["Protect settlements","Honor trade"],warsWon:0,warsLost:0
  };
  kingdoms.push(k);
  for(const s of members){s.kingdomId=k.id;if(!k.memberIds.includes(s.id))k.memberIds.push(s.id)}
  const ruler=settlementLeader(capital);
  if(ruler)memoryAdd(ruler,`Founded ${k.name}`);
  addEvent(`${capital.name} proclaimed the ${k.name}${ruler?` under ${ruler.name}`:""}.`,"kingdom");
  return k
}
function settlementKingdom(s){return s?.kingdomId?kingdomById(s.kingdomId):null}
function kingdomRuler(k){const p=personById(k?.rulerId);return p?.alive?p:settlementLeader(settlementById(k?.capitalId))}
function militaryStrength(s){
  const adults=settlementPeople(s,true).filter(p=>p.age>=16&&p.age<70);
  const courage=adults.reduce((a,p)=>a+(p.traits?.bravery||.5),0);
  return Math.round(adults.length*2.2+courage*1.4+(s.iron||0)*.9+(s.gold||0)*.08)
}
function armyMembers(s){
  const atWar=wars.some(w=>w.status==="active"&&(w.aId===s.id||w.bId===s.id));
  const adults=settlementPeople(s,true).filter(p=>p.age>=17&&p.age<65&&p.layer!=="underground")
    .sort((a,b)=>(b.traits?.bravery||0)-(a.traits?.bravery||0));
  const n=atWar?Math.max(1,Math.ceil(adults.length*.34)):Math.max(0,Math.floor(adults.length*.10));
  const army=adults.slice(0,n);
  for(const p of adults)p.militaryRole=army.includes(p)?"Militia":null;
  return army
}
function maxSettlements(){
  const n=configValue("worldSize");
  return n<=100?3:n<=150?4:n<=200?6:n<=300?10:16
}
function validSettlementSite(x,y,origin){
  if(!passable(x,y))return false;
  if(terrain[idx(x,y)]===T.SAND)return false;
  for(const s of settlements)if(Math.hypot(s.x-x,s.y-y)<Math.max(20,(settlementRadius(s)+10)))return false;
  let land=0,water=0;
  for(let yy=-7;yy<=7;yy+=2)for(let xx=-7;xx<=7;xx+=2){
    const nx=x+xx,ny=y+yy;if(nx<1||ny<1||nx>=WORLD_W-1||ny>=WORLD_H-1)continue;
    const t=terrain[idx(nx,ny)];if(passable(nx,ny))land++;if(isWaterTile(t))water++
  }
  return land>=26&&(origin?Math.hypot(origin.x-x,origin.y-y)>18:true)
}
function findExpansionSite(origin){
  for(let n=0;n<500;n++){
    const r=rnd(24,Math.min(75,Math.max(30,WORLD_W*.34))),a=rnd(0,Math.PI*2);
    const x=clamp(Math.round(origin.x+Math.cos(a)*r),8,WORLD_W-9),y=clamp(Math.round(origin.y+Math.sin(a)*r),8,WORLD_H-9);
    if(validSettlementSite(x,y,origin))return{x,y}
  }
  return null
}
function familyMigrationGroup(founder,s){
  const ids=new Set([founder.id]);
  if(founder.partner){
    const p=people.find(q=>q.id===founder.partner&&q.alive&&q.settlementId===s.id);
    if(p)ids.add(p.id)
  }
  for(const id of founder.children||[]){
    const c=people.find(q=>q.id===id&&q.alive&&q.settlementId===s.id&&q.age<18);
    if(c)ids.add(c.id)
  }
  return [...ids].map(id=>people.find(p=>p.id===id)).filter(Boolean).slice(0,5)
}
function attemptExpansion(){
  if(settlements.length>=maxSettlements())return;
  const candidates=settlements.filter(s=>settlementPopulation(s)>=8&&day-(s.lastExpansionDay||0)>18)
    .sort((a,b)=>settlementPopulation(b)-settlementPopulation(a));
  for(const s of candidates){
    const adults=settlementPeople(s,true).filter(p=>p.age>=18&&p.age<55&&p.layer!=="underground")
      .sort((a,b)=>((b.traits?.curiosity||.5)+(b.traits?.bravery||.5))-((a.traits?.curiosity||.5)+(a.traits?.bravery||.5)));
    if(!adults.length)continue;
    const founder=adults[0],group=familyMigrationGroup(founder,s);
    if(group.length<2&&settlementPopulation(s)<12)continue;
    const site=findExpansionSite(s);if(!site)continue;
    s.lastExpansionDay=day;
    const ns=createSettlement(uniqueSettlementName(),site.x,site.y,group,s.id);
    ns.food=Math.max(10,group.length*4);ns.wood=10;
    setRelation(s,ns,42+rndi(0,18));
    for(const p of group){
      p.x=site.x+rndi(-2,2);p.y=site.y+rndi(-2,2);p.px=p.x;p.py=p.y;p.goal=`Found ${ns.name}`;
      memoryAdd(p,`Migrated from ${s.name} to found ${ns.name}`)
    }
    addBuilding("firepit",site.x,site.y,true,ns.id);
    addBuilding("hut",site.x+2,site.y,true,ns.id);
    addEvent(`${founder.name} led ${group.length} settlers from ${s.name} and founded ${ns.name}.`,"migration");
    showToast(`${ns.name} founded`);
    assignHomes();assignJobs();
    break
  }
}
function tradeRouteBetween(a,b){return tradeRoutes.find(r=>(r.aId===a.id&&r.bId===b.id)||(r.aId===b.id&&r.bId===a.id))}
function updateTrade(){
  for(let i=0;i<settlements.length;i++)for(let j=i+1;j<settlements.length;j++){
    const a=settlements[i],b=settlements[j],rel=relationScore(a,b),dist=Math.hypot(a.x-b.x,a.y-b.y);
    let route=tradeRouteBetween(a,b);
    if(rel>20&&dist<Math.min(150,WORLD_W*.65)&&!route){
      route={aId:a.id,bId:b.id,createdDay:Math.floor(day),volume:1,lastTradeDay:day};tradeRoutes.push(route);
      addEvent(`${a.name} and ${b.name} opened a trade route.`,"trade")
    }
    if(route&&rel<-30){tradeRoutes=tradeRoutes.filter(r=>r!==route);addEvent(`Trade between ${a.name} and ${b.name} collapsed.`,"trade");continue}
    if(route&&day-route.lastTradeDay>4){
      route.lastTradeDay=day;route.volume=clamp(route.volume+.15,1,20);
      const rich=a.food>b.food?a:b,poor=rich===a?b:a;
      const foodMove=Math.min(3,Math.max(0,Math.floor((rich.food-poor.food)/5)));
      if(foodMove){rich.food-=foodMove;poor.food+=foodMove}
      if((rich.wood||0)>(poor.wood||0)+5){rich.wood--;poor.wood++}
      rich.gold=(rich.gold||0)+.08;poor.gold=Math.max(0,(poor.gold||0)-.02);
      changeDiplomacy(a,b,.35)
    }
  }
}
function bordersOverlap(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<(settlementRadius(a)+settlementRadius(b))*.92}
function updateDiplomacy(){
  for(let i=0;i<settlements.length;i++)for(let j=i+1;j<settlements.length;j++){
    const a=settlements[i],b=settlements[j];let delta=(Math.random()-.5)*1.10;
    if(a.parentId===b.id||b.parentId===a.id)delta+=.18;if(a.kingdomId&&a.kingdomId===b.kingdomId)delta+=.38;if(tradeRouteBetween(a,b))delta+=.22;
    if(bordersOverlap(a,b))delta-=.52;if(a.identity==="Militaristic"||b.identity==="Militaristic")delta-=.10;if(a.identity==="Peaceful"||b.identity==="Peaceful")delta+=.08;
    delta+=cultureAffinity(a,b);if(a.religionId&&a.religionId===b.religionId)delta+=.13;else if(a.religionId&&b.religionId)delta-=.035;changeDiplomacy(a,b,delta)
  }
}
function maybeFormKingdoms(){
  if(settlements.length<2)return;
  // Existing kingdoms can peacefully absorb very close allies.
  for(const k of kingdoms){
    const capital=settlementById(k.capitalId);if(!capital)continue;
    for(const s of settlements){
      if(s.kingdomId||s.id===capital.id)continue;
      if(relationScore(capital,s)>67&&Math.random()<.12){
        s.kingdomId=k.id;k.memberIds.push(s.id);
        addEvent(`${s.name} joined the ${k.name}.`,"kingdom")
      }
    }
    const ruler=kingdomRuler(k);if(ruler)k.rulerId=ruler.id
  }
  if(kingdoms.length>=Math.max(1,Math.floor(settlements.length/2)))return;
  const free=settlements.filter(s=>!s.kingdomId&&settlementPopulation(s)>=7);
  for(const a of free){
    const ally=free.find(b=>b.id!==a.id&&relationScore(a,b)>55);
    if(ally&&Math.random()<.18){createKingdom(a,[a,ally]);break}
  }
}
function activeWarBetween(a,b){return wars.find(w=>w.status==="active"&&((w.aId===a.id&&w.bId===b.id)||(w.aId===b.id&&w.bId===a.id)))}
function startWar(a,b,cause="a border dispute"){
  if(!a||!b||activeWarBetween(a,b))return null;
  const w={id:nextWarId++,aId:a.id,bId:b.id,startDay:Math.floor(day),status:"active",cause,casualtiesA:0,casualtiesB:0,lastBattleDay:day,battles:0,winnerId:null};
  wars.push(w);setRelation(a,b,-75);
  a.warWeariness=0;b.warWeariness=0;
  addEvent(`${a.name} and ${b.name} went to war over ${cause}.`,"war");
  showToast(`${a.name} ⚔ ${b.name}`);
  return w
}
function endWar(w,winner=null,reason="a negotiated peace"){
  if(!w||w.status!=="active")return;
  const a=settlementById(w.aId),b=settlementById(w.bId);
  w.status="ended";w.endDay=Math.floor(day);w.winnerId=winner?.id||null;
  if(a&&b)setRelation(a,b,-8+rndi(0,16));
  if(winner){
    const loser=winner.id===w.aId?b:a;
    const wk=settlementKingdom(winner);
    if(wk&&loser&&!loser.kingdomId&&Math.random()<.42){
      loser.kingdomId=wk.id;if(!wk.memberIds.includes(loser.id))wk.memberIds.push(loser.id);
      addEvent(`${loser.name} entered the ${wk.name} after defeat.`,"kingdom")
    }
    if(wk)wk.warsWon++;
  }
  addEvent(`${a?.name||"A settlement"} and ${b?.name||"another settlement"} ended their war${winner?`; ${winner.name} prevailed`:""} through ${reason}.`,"war")
}
function battleCasualty(s,w,side){
  const army=armyMembers(s);if(!army.length)return false;
  const p=army[rndi(0,army.length-1)];
  handleDeath(p,`battle in the war between ${settlementById(w.aId)?.name||"rivals"} and ${settlementById(w.bId)?.name||"rivals"}`);
  if(side==="a")w.casualtiesA++;else w.casualtiesB++;
  return true
}
function updateWars(){
  // New wars can emerge from prolonged hostility and border pressure.
  for(let i=0;i<settlements.length;i++)for(let j=i+1;j<settlements.length;j++){
    const a=settlements[i],b=settlements[j];
    if(activeWarBetween(a,b)||(a.kingdomId&&a.kingdomId===b.kingdomId))continue;
    if(relationScore(a,b)<-48&&settlementPopulation(a)>=4&&settlementPopulation(b)>=4&&Math.random()<.035){
      startWar(a,b,bordersOverlap(a,b)?"disputed border land":"deepening rivalry")
    }
  }
  for(const w of wars.filter(w=>w.status==="active")){
    const a=settlementById(w.aId),b=settlementById(w.bId);if(!a||!b){w.status="ended";continue}
    a.warWeariness=clamp((a.warWeariness||0)+.25,0,100);b.warWeariness=clamp((b.warWeariness||0)+.25,0,100);
    if(day-w.lastBattleDay>3){
      w.lastBattleDay=day;w.battles++;
      const sa=militaryStrength(a)*rnd(.72,1.26),sb=militaryStrength(b)*rnd(.72,1.26);
      if(sa>sb*1.12){battleCasualty(b,w,"b");changeDiplomacy(a,b,-2)}
      else if(sb>sa*1.12){battleCasualty(a,w,"a");changeDiplomacy(a,b,-2)}
      else if(Math.random()<.45){battleCasualty(Math.random()<.5?a:b,w,Math.random()<.5?"a":"b")}
      addEvent(`A battle was fought between ${a.name} and ${b.name}.`,"battle")
    }
    const age=day-w.startDay,pa=settlementPopulation(a),pb=settlementPopulation(b);
    if(pa<2||pb<2||age>55||(age>18&&Math.random()<.04)){
      const sa=militaryStrength(a),sb=militaryStrength(b);
      const winner=sa>sb*1.28?a:sb>sa*1.28?b:null;
      endWar(w,winner,winner?"military victory":"a peace settlement")
    }
  }
}
function safeSettlementFor(s){
  return settlements.filter(d=>d.id!==s.id&&relationScore(s,d)>10&&!wars.some(w=>w.status==="active"&&(w.aId===d.id||w.bId===d.id)))
    .sort((a,b)=>relationScore(s,b)-relationScore(s,a))[0]||null
}
function updateRefugees(){
  for(const s of settlements){
    const war=wars.some(w=>w.status==="active"&&(w.aId===s.id||w.bId===s.id));
    const famine=s.food<Math.max(2,settlementPopulation(s)*.30);
    if((!war&&!famine)||settlementPopulation(s)<5||Math.random()>.12)continue;
    const dest=safeSettlementFor(s);if(!dest)continue;
    const candidate=settlementPeople(s,true).filter(p=>p.age>=14&&p.layer!=="underground").sort((a,b)=>(b.stress||0)-(a.stress||0))[0];
    if(!candidate)continue;
    const group=familyMigrationGroup(candidate,s).slice(0,4);
    for(const p of group){
      p.citizenshipHistory=p.citizenshipHistory||[];p.citizenshipHistory.unshift(`${s.name} → ${dest.name}`);
      p.settlementId=dest.id;p.homeId=null;p.refugee=true;
      p.x=dest.x+rndi(-3,3);p.y=dest.y+rndi(-3,3);p.px=p.x;p.py=p.y;
      memoryAdd(p,`Fled ${s.name} for ${dest.name}`)
    }
    invalidateWorldIndex();addEvent(`${group.length} people fled ${s.name} and sought refuge in ${dest.name}.`,"refugees");
    assignHomes()
  }
}
function updatePoliticalWorld(){
  ensureWorldIndex();
  for(const s of settlements){
    settlementRadius(s);if(!settlementLeader(s)||day-(s.lastElectionDay||0)>28)chooseLeader(s);
    const pop=settlementPopulation(s);s.prosperity=clamp(45+(s.food-pop)*1.1+(s.wood||0)*.25+(s.gold||0)*.8-(s.warWeariness||0)*.35,0,100)
  }
  updateTrade();updateDiplomacy();maybeFormKingdoms();updateWars();updateRefugees()
}
function colorFor(t,x,y,i){
  const h=height[i],m=moisture[i],shore=shorelineFactor(x,y);
  const jitter=(hash(x,y,31)-.5)*10,detail=(hash(x,y,47)-.5)*8;
  let c=[98,154,84];
  if(t===T.DEEP)c=mixColor([9,53,84],[22,74,116],clamp(h/.32,0,1));
  else if(t===T.WATER)c=mixColor([34,118,158],[78,168,201],clamp(shore*.65+h*.55,0,1));
  else if(t===T.SAND)c=mixColor([198,174,112],[223,203,143],clamp(shore*.72+(hash(x,y,52)*.18),0,1));
  else if(t===T.GRASS)c=mixColor([84,146,79],[122,180,108],clamp(m*.45+(h-.40)*.55,0,1));
  else if(t===T.FOREST)c=mixColor([43,95,55],[76,131,72],clamp(m*.42+(hash(x,y,58)*.18),0,1));
  else if(t===T.MOUNTAIN)c=mixColor([92,96,98],[126,130,132],clamp((h-.70)*2.0,0,1));
  else if(t===T.SNOW)c=mixColor([212,220,224],[240,246,248],clamp((h-.82)*4.0,0,1));
  else if(t===T.LAVA)c=mixColor([129,43,20],[198,92,28],clamp(hash(x,y,66),0,1));
  let [r,g,b]=c;
  if(t===T.GRASS||t===T.FOREST){g+=4+shore*5;b+=m*2}
  if(t===T.WATER||t===T.DEEP){b+=8+shore*12;g+=shore*5}
  if(t===T.SAND){r+=shore*8;g+=shore*7}
  if(scar[i]){r=60;g=51;b=42}
  if(burn[i]&&t!==T.LAVA){r=clamp(r+burn[i]*.20,0,255);g=clamp(g-burn[i]*.12,0,255);b=clamp(b-burn[i]*.16,0,255)}
  return[clamp(r+jitter+detail*.22,0,255),clamp(g+jitter+detail*.18,0,255),clamp(b+jitter+detail*.12,0,255)]
}
function nearType(x,y,type){for(let yy=Math.max(0,y-1);yy<=Math.min(WORLD_H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(WORLD_W-1,x+1);xx++)if(terrain[idx(xx,yy)]===type)return true;return false}
function shorelineFactor(x,y){const t=terrain[idx(x,y)];if(t!==T.WATER&&t!==T.SAND)return 0;let land=0,total=0;for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){const nx=x+xx,ny=y+yy;if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;total++;const nt=terrain[idx(nx,ny)];if(nt>=T.SAND)land++}return land/Math.max(1,total)}
function rebuildTerrain(){
  rebuildShoreDistance();
  const W=terrainCanvas.width,H=terrainCanvas.height,im=tctx.createImageData(W,H),d=im.data;
  for(let py=0;py<H;py++){
    const wy=(py+.5)/TEX-.5;
    for(let px=0;px<W;px++){
      const wx=(px+.5)/TEX-.5;
      const [r,g,b,land]=paintedVisualSample(wx,wy,px,py);
      const p=(py*W+px)*4;
      d[p]=r;d[p+1]=g;d[p+2]=b;d[p+3]=255
    }
  }
  tctx.putImageData(im,0,0);

  // Painterly broad strokes over the continuous raster.
  tctx.save();
  tctx.globalCompositeOperation="soft-light";
  for(let y=1;y<WORLD_H-1;y+=2)for(let x=1;x<WORLD_W-1;x+=2){
    const i=idx(x,y),t=terrain[i];
    if(isWaterTile(t))continue;
    const h=hash(x,y,worldSeed+910);
    tctx.globalAlpha=.05+h*.05;
    tctx.fillStyle=t===T.FOREST?"#2f7040":t===T.SAND?"#efd999":t===T.MOUNTAIN?"#a6aaa7":t===T.SNOW?"#ffffff":"#8fc276";
    tctx.beginPath();
    tctx.ellipse((x+.5)*TEX,(y+.5)*TEX,TEX*(1.2+h*.9),TEX*(.35+h*.45),h*Math.PI,0,Math.PI*2);
    tctx.fill()
  }
  tctx.restore();
  dirty=false
}

function undergroundColor(t,x,y){
  const jitter=(hash(x,y,worldSeed+813)-.5)*12;
  const c={[U.CAVE]:[31,27,26],[U.DIRT]:[82,61,43],[U.STONE]:[74,72,70],[U.DEEP]:[49,48,49],[U.WATER]:[27,72,91],[U.MAGMA]:[127,45,22]};
  let [r,g,b]=c[t]||c[U.STONE];return[clamp(r+jitter,0,255),clamp(g+jitter,0,255),clamp(b+jitter,0,255)]
}
function generateUnderground(){
  for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){
    const i=idx(x,y),a=fbm(x+900,y-700,worldSeed+900),b=fbm(x-650,y+880,worldSeed+1000),c=fbm(x+270,y+330,worldSeed+1100);
    let t=a>.67?U.DEEP:a<.32?U.DIRT:U.STONE;
    const caveBand=Math.abs(b-.50);
    if(caveBand<.055)t=U.CAVE;
    if(t===U.CAVE&&c>.82)t=U.WATER;
    if((t===U.DEEP||t===U.STONE)&&c>.91&&a>.58)t=U.MAGMA;
    underground[i]=t;uGlow[i]=0;
    const solid=t===U.STONE||t===U.DEEP||t===U.DIRT;
    uStone[i]=solid&&hash(x,y,worldSeed+1201)>.54?rndi(1,3):0;
    const ironNoise=fbm(x+120,y-340,worldSeed+1210);
    const coalNoise=fbm(x-720,y+210,worldSeed+1220);
    const goldNoise=fbm(x+510,y+730,worldSeed+1230);
    const crystalNoise=fbm(x-180,y-910,worldSeed+1240);
    uIron[i]=solid&&ironNoise>.705?rndi(1,4):0;
    uCoal[i]=solid&&coalNoise>.735?rndi(1,4):0;
    uGold[i]=solid&&goldNoise>.855?rndi(1,3):0;
    uCrystal[i]=solid&&crystalNoise>.905?rndi(1,2):0;
  }
  // Safe cavern beneath the founding settlement.
  const sx=Math.round(settlement.x),sy=Math.round(settlement.y);
  for(let y=sy-6;y<=sy+6;y++)for(let x=sx-6;x<=sx+6;x++){
    if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)continue;
    if(Math.hypot(x-sx,y-sy)<6.2){const i=idx(x,y);underground[i]=U.CAVE;uStone[i]=uIron[i]=uGold[i]=uCoal[i]=uCrystal[i]=0}
  }
  undergroundDirty=true
}
function rebuildUnderground(){
  const im=uctx.createImageData(undergroundCanvas.width,undergroundCanvas.height),d=im.data;
  for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){
    const i=idx(x,y),t=underground[i],[r0,g0,b0]=undergroundColor(t,x,y);
    for(let sy=0;sy<TEX;sy++)for(let sx=0;sx<TEX;sx++){
      const micro=(hash(x*TEX+sx,y*TEX+sy,worldSeed+1331)-.5)*8;
      let r=r0+micro,g=g0+micro,b=b0+micro;
      if(t===U.MAGMA){r+=30;g+=10}
      const p=((y*TEX+sy)*undergroundCanvas.width+(x*TEX+sx))*4;d[p]=r;d[p+1]=g;d[p+2]=b;d[p+3]=255
    }
  }
  uctx.putImageData(im,0,0);undergroundDirty=false
}
function ugPassable(x,y){if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)return false;const t=underground[idx(x,y)];return t!==U.WATER&&t!==U.MAGMA}
function carveUnderground(x,y){
  if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)return false;const i=idx(x,y),t=underground[i];
  if(t===U.WATER||t===U.MAGMA)return false;
  if(t!==U.CAVE){underground[i]=U.CAVE;uStone[i]=Math.max(0,uStone[i]-1);undergroundDirty=true}
  return true
}
function moveUnderground(p,nx,ny){if(carveUnderground(nx,ny)){p.dir=nx>=p.x?1:-1;p.x=nx;p.y=ny;return true}return false}
function moveUndergroundToward(p,t){
  if(!t)return;
  const dx=Math.sign(t.x-p.x),dy=Math.sign(t.y-p.y),opts=[];
  if(dx&&dy)opts.push([p.x+dx,p.y+dy]);if(dx)opts.push([p.x+dx,p.y]);if(dy)opts.push([p.x,p.y+dy]);
  for(const q of opts)if(ugPassable(q[0],q[1])){moveUnderground(p,q[0],q[1]);return}
}
function nearestUndergroundTile(p,fn,max=55){
  let best=null,bd=1e9;
  for(let y=Math.max(1,p.y-max);y<=Math.min(WORLD_H-2,p.y+max);y+=2)for(let x=Math.max(1,p.x-max);x<=Math.min(WORLD_W-2,p.x+max);x+=2){
    const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d<bd&&fn(idx(x,y),x,y)){bd=d;best={x,y}}
  }
  return best
}
function openMineShaft(b){
  const cx=Math.round(b.x),cy=Math.round(b.y);
  for(let y=cy-4;y<=cy+4;y++)for(let x=cx-4;x<=cx+4;x++){
    if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)continue;
    if(Math.hypot(x-cx,y-cy)<4.2){const i=idx(x,y);underground[i]=U.CAVE;uGlow[i]=Math.max(uGlow[i],140)}
  }
  undergroundDirty=true
}
function paintUnderground(cx,cy,r,type,record=true){
  for(let y=Math.max(1,Math.floor(cy-r-3));y<=Math.min(WORLD_H-2,Math.ceil(cy+r+3));y++)for(let x=Math.max(1,Math.floor(cx-r-3));x<=Math.min(WORLD_W-2,Math.ceil(cx+r+3));x++){
    const n=brushNoise(x,y,cx,cy,r);if(n>1)continue;const i=idx(x,y),p=Math.max(0,1-n);
    if(type==="cave"){underground[i]=U.CAVE;uStone[i]=Math.max(0,uStone[i]-1)}
    else if(type==="ustone"){underground[i]=hash(x,y,31)>.35?U.STONE:U.DEEP;uStone[i]=clamp(uStone[i]+1,0,6)}
    else if(type==="uwater"){underground[i]=U.WATER;uStone[i]=uIron[i]=uGold[i]=uCoal[i]=uCrystal[i]=0}
    else if(type==="magma"){underground[i]=U.MAGMA;uStone[i]=uIron[i]=uGold[i]=uCoal[i]=uCrystal[i]=0}
    else if(type==="uiron"&&underground[i]!==U.WATER&&underground[i]!==U.MAGMA){if(Math.random()<.18+.58*p){underground[i]=underground[i]===U.CAVE?U.STONE:underground[i];uIron[i]=clamp(uIron[i]+1,0,6)}}
    else if(type==="ugold"&&underground[i]!==U.WATER&&underground[i]!==U.MAGMA){if(Math.random()<.08+.32*p){underground[i]=underground[i]===U.CAVE?U.STONE:underground[i];uGold[i]=clamp(uGold[i]+1,0,5)}}
    else if(type==="ucoal"&&underground[i]!==U.WATER&&underground[i]!==U.MAGMA){if(Math.random()<.17+.48*p){underground[i]=underground[i]===U.CAVE?U.STONE:underground[i];uCoal[i]=clamp(uCoal[i]+1,0,6)}}
    else if(type==="crystal"&&underground[i]!==U.WATER&&underground[i]!==U.MAGMA){if(Math.random()<.04+.20*p){underground[i]=U.DEEP;uCrystal[i]=clamp(uCrystal[i]+1,0,4)}}
    else if(type==="reveal"){uGlow[i]=255}
  }
  undergroundDirty=true;
  if(record){const m={cave:"The Creator opened a cavern beneath the world.",ustone:"Stone filled the underground.",uwater:"An underground lake formed.",magma:"Magma surged through the deep earth.",uiron:"A rich iron vein formed underground.",ugold:"A gold vein formed underground.",ucoal:"Coal seams formed underground.",crystal:"Rare crystals formed in the deep.",reveal:"Hidden underground deposits were revealed."};if(m[type])addEvent(m[type],"divine")}
}
function undergroundCount(arr){let n=0;for(let i=0;i<N;i++)n+=arr[i];return n}
function layerName(){return activeLayer==="surface"?"Surface":"Underground"}
function cameraScale(){return zoom*displayScale}
function worldToScreen(x,y){const s=cameraScale();return{x:(x-camX)*s+canvas.width/2,y:(y-camY)*s+canvas.height/2}}
function screenToWorld(x,y){const s=cameraScale();return{x:(x-canvas.width/2)/s+camX,y:(y-canvas.height/2)/s+camY}}
function viewportWorldSize(){const s=cameraScale();return{w:canvas.width/s,h:canvas.height/s}}
function clampCamera(){const v=viewportWorldSize();camX=v.w>=WORLD_W?WORLD_W/2:clamp(camX,v.w/2,WORLD_W-v.w/2);camY=v.h>=WORLD_H?WORLD_H/2:clamp(camY,v.h/2,WORLD_H-v.h/2)}
function visibleBounds(pad=6){const v=viewportWorldSize();return{l:camX-v.w/2-pad,r:camX+v.w/2+pad,t:camY-v.h/2-pad,b:camY+v.h/2+pad}}

function brushNoise(x,y,cx,cy,r){return Math.hypot(x-cx,y-cy)/r+(hash(x,y,(tick>>3)%37)-.5)*.38}
function spawnCloud(x,y,r){clouds.push({x,y,r:Math.max(8,r*.9),life:330,phase:rnd(0,Math.PI*2)})}
function spawnParticles(type,x,y,count=10){
  const maxParticles=settings.autoPerformance?(perfState.detail>1.65?180:perfState.detail>1.2?280:420):500;
  if(particles.length>=maxParticles)return;
  const allowed=Math.min(count,maxParticles-particles.length);
  for(let i=0;i<allowed;i++)particles.push({type,x:x+rnd(-1.3,1.3),y:y+rnd(-1.2,1.2),vx:rnd(-.08,.08),vy:rnd(-.18,.03),life:rndi(10,30)})
}
function spawnLightningStrike(x,y){
  visualEffects.push({type:"lightning",x,y,start:visualTime,duration:.42,seed:Math.random()*10000})
}
function spawnFireBurst(x,y,r){
  visualEffects.push({type:"fireBurst",x,y,r:Math.max(2,r*.28),start:visualTime,duration:.70,seed:Math.random()*10000})
}
function paint(cx,cy,r,type,record=true){
  for(let y=Math.max(0,Math.floor(cy-r-4));y<=Math.min(WORLD_H-1,Math.ceil(cy+r+4));y++)for(let x=Math.max(0,Math.floor(cx-r-4));x<=Math.min(WORLD_W-1,Math.ceil(cx+r+4));x++){
    const n=brushNoise(x,y,cx,cy,r);if(n>1)continue;
    const i=idx(x,y),p=Math.max(0,1-n);
    if(type==="land"){height[i]=clamp(height[i]+.14+p*.19,.405,.82);classify(i);if(terrain[i]===T.SAND&&p>.43)terrain[i]=T.GRASS}
    else if(type==="water"){height[i]=clamp(height[i]-.15-p*.23,.05,.38);classify(i);food[i]=trees[i]=rocks[i]=iron[i]=gold[i]=burn[i]=0}
    else if(type==="grass"){height[i]=clamp(Math.max(height[i],.43),.43,.67);moisture[i]=.43;terrain[i]=T.GRASS;burn[i]=0}
    else if(type==="forest"){height[i]=clamp(Math.max(height[i],.45),.45,.70);terrain[i]=T.FOREST;moisture[i]=clamp(moisture[i]+.22,0,1);if(Math.random()<.72)trees[i]=clamp(trees[i]+1,0,6);burn[i]=0}
    else if(type==="sand"){height[i]=.40;terrain[i]=T.SAND;trees[i]=food[i]=burn[i]=0}
    else if(type==="snow"){height[i]=.88;terrain[i]=T.SNOW;trees[i]=food[i]=burn[i]=0}
    else if(type==="mountain"){height[i]=.78;terrain[i]=T.MOUNTAIN;if(Math.random()<.18)rocks[i]=clamp(rocks[i]+1,0,5);burn[i]=0}
    else if(type==="food"&&(terrain[i]===T.GRASS||terrain[i]===T.FOREST)){if(Math.random()<.12+.45*p)food[i]=clamp(food[i]+1,0,7)}
    else if(type==="trees"&&(terrain[i]===T.GRASS||terrain[i]===T.FOREST)){terrain[i]=T.FOREST;trees[i]=clamp(trees[i]+(Math.random()<.55?2:1),0,7)}
    else if(type==="stone"&&terrain[i]>=T.SAND&&terrain[i]!==T.LAVA){if(Math.random()<.15+.5*p)rocks[i]=clamp(rocks[i]+1,0,6)}
    else if(type==="iron"&&terrain[i]>=T.SAND&&terrain[i]!==T.LAVA){if(Math.random()<.10+.35*p)iron[i]=clamp(iron[i]+1,0,5)}
    else if(type==="gold"&&terrain[i]>=T.SAND&&terrain[i]!==T.LAVA){if(Math.random()<.05+.20*p)gold[i]=clamp(gold[i]+1,0,4)}
    else if(type==="rain"){wet[i]=255;if((terrain[i]===T.GRASS||terrain[i]===T.FOREST)&&Math.random()<.08)food[i]=clamp(food[i]+1,0,7);if(burn[i])burn[i]=Math.max(0,burn[i]-90)}
    else if(type==="drought"){wet[i]=0;if(food[i]&&Math.random()<.20)food[i]--;if(trees[i]&&Math.random()<.035)trees[i]--}
    else if(type==="fire"&&terrain[i]>=T.SAND&&terrain[i]!==T.SNOW&&terrain[i]!==T.LAVA&&Math.random()<.08+.34*p){burn[i]=Math.max(burn[i],rndi(195,255));scar[i]=Math.max(scar[i],rndi(120,185));if(trees[i]&&Math.random()<.42)trees[i]--;if(food[i]&&Math.random()<.80)food[i]=0}
    else if(type==="lava"){terrain[i]=T.LAVA;height[i]=.55;trees[i]=food[i]=rocks[i]=iron[i]=gold[i]=0;burn[i]=255;scar[i]=255}
    else if(type==="lightning"&&terrain[i]>=T.SAND&&terrain[i]!==T.SNOW&&terrain[i]!==T.LAVA&&n<.20&&hash(x,y,worldSeed+tick+991)>.79){trees[i]=Math.max(0,trees[i]-2);food[i]=0;scar[i]=Math.max(scar[i],190);burn[i]=Math.max(burn[i],rndi(105,165))}
  }
  dirty=true;
  if(type==="rain")spawnCloud(cx,cy,r);
  if(type==="fire"){spawnParticles("fire",cx,cy,14);spawnFireBurst(cx,cy,r)}
  if(type==="lava")spawnParticles("fire",cx,cy,22);
  if(type==="lightning"){spawnParticles("spark",cx,cy,16);spawnLightningStrike(cx+rnd(-r*.10,r*.10),cy+rnd(-r*.10,r*.10))}
  if(record){
    const m={land:"The Creator raised new land.",water:"The Creator reshaped the sea.",grass:"Grassland spread across the world.",forest:"A forest spread by divine will.",sand:"The land was turned to desert.",snow:"A frozen biome formed.",mountain:"Mountains rose from the earth.",rain:"The Creator summoned rain.",drought:"A divine drought swept the land.",fire:"Divine fire was unleashed.",lava:"Lava erupted from the ground.",lightning:"Lightning tore through the land.",stone:"Stone deposits appeared.",iron:"Iron deposits appeared.",gold:"Gold deposits appeared.",trees:"Trees erupted from the soil.",food:"Food resources appeared."};
    if(m[type])addEvent(m[type],"divine")
  }
}


function proceduralFirstName(){
  for(let tries=0;tries<100;tries++){
    const raw=nameStart[rndi(0,nameStart.length-1)]+nameMiddle[rndi(0,nameMiddle.length-1)]+nameEnd[rndi(0,nameEnd.length-1)];
    const n=raw.charAt(0).toUpperCase()+raw.slice(1).toLowerCase();
    if(n.length>=3&&n.length<=10&&!usedFirstNames.has(n))return n
  }
  for(let tries=0;tries<100;tries++){
    const n=names[rndi(0,names.length-1)]+String.fromCharCode(97+rndi(0,25));
    if(!usedFirstNames.has(n))return n
  }
  return `Person${nextPersonId}`
}
function proceduralSurname(){
  return familyStart[rndi(0,familyStart.length-1)]+familyEnd[rndi(0,familyEnd.length-1)]
}
function generateUniqueName(preferredFirst=null,surname=null){
  for(let tries=0;tries<250;tries++){
    let first=preferredFirst&&tries===0?preferredFirst:proceduralFirstName();
    if(usedFirstNames.has(first)){preferredFirst=null;continue}
    const last=surname||proceduralSurname();
    const full=`${first} ${last}`;
    if(!usedNames.has(full))return full
  }
  return `Citizen ${nextPersonId}`
}
function registerPersonName(full){
  usedNames.add(full);
  const first=String(full).split(" ")[0];
  if(first)usedFirstNames.add(first)
}
function inheritedSurname(a,b){
  const sa=a?.name?.split(" ").slice(-1)[0],sb=b?.name?.split(" ").slice(-1)[0];
  return sa&&sb?(Math.random()<.5?sa:sb):(sa||sb||proceduralSurname())
}

function memoryAdd(p,text){
  if(!p||!text)return;
  p.memory=p.memory||[];
  if(p.memory[0]!==text)p.memory.unshift(text);
  p.memory=p.memory.slice(0,10)
}
function relationValue(p,id){return Number((p?.relations&&p.relations[id])||0)}
function changeRelation(a,b,amount){
  if(!a||!b||a.id===b.id)return;
  a.relations=a.relations||{};b.relations=b.relations||{};
  a.relations[b.id]=clamp(relationValue(a,b.id)+amount,-100,100);
  b.relations[a.id]=clamp(relationValue(b,a.id)+amount,-100,100)
}
function surnameOf(p){return p?.name?.split(" ").slice(-1)[0]||proceduralSurname()}
function firstNameOf(p){return p?.name?.split(" ")[0]||"Citizen"}
function renamePersonSurname(p,newSurname,reason=""){
  if(!p||!newSurname)return;
  const old=p.name,first=firstNameOf(p),next=`${first} ${newSurname}`;
  if(old===next)return;
  usedNames.delete(old);
  p.name=next;
  usedNames.add(next);
  p.nameHistory=p.nameHistory||[];
  p.nameHistory.unshift(old);p.nameHistory=p.nameHistory.slice(0,8);
  if(reason)memoryAdd(p,`${reason}: ${old} → ${next}`)
}
function chooseMarriageSurname(a,b){
  const sa=surnameOf(a),sb=surnameOf(b);
  if(sa===sb)return sa;
  const aAttachment=(a.surnameAttachment||.5)+((a.traits?.kindness||.5)*-.08)+((a.traits?.work||.5)*.08);
  const bAttachment=(b.surnameAttachment||.5)+((b.traits?.kindness||.5)*-.08)+((b.traits?.work||.5)*.08);
  return Math.random()<aAttachment/(aAttachment+bAttachment)?sa:sb
}
function chooseUnmarriedChildSurname(a,b){
  const sa=surnameOf(a),sb=surnameOf(b);
  if(sa===sb)return{surname:sa,chooser:a};
  const scoreA=(a.surnameAttachment||.5)*.65+(a.traits?.kindness||.5)*.12+clamp(relationValue(a,b.id),-100,100)/500+.25;
  const scoreB=(b.surnameAttachment||.5)*.65+(b.traits?.kindness||.5)*.12+clamp(relationValue(b,a.id),-100,100)/500+.25;
  const chooser=Math.random()<scoreA/(scoreA+scoreB)?a:b;
  return{surname:surnameOf(chooser),chooser}
}
function inheritedSurname(a,b){
  if(a?.relationshipStage==="married"&&b?.relationshipStage==="married"&&a.partner===b.id&&b.partner===a.id&&surnameOf(a)===surnameOf(b))return surnameOf(a);
  return chooseUnmarriedChildSurname(a,b).surname
}
function compatibilityScore(a,b){
  if(!a||!b)return 0;
  const ta=a.traits||{},tb=b.traits||{};
  const ageFit=clamp(1-Math.abs(a.age-b.age)/22,0,1);
  const kindness=((ta.kindness||.5)+(tb.kindness||.5))/2;
  const socialFit=1-Math.abs((ta.social||.5)-(tb.social||.5));
  const workFit=1-Math.abs((ta.work||.5)-(tb.work||.5));
  const curiosityFit=1-Math.abs((ta.curiosity||.5)-(tb.curiosity||.5));
  return clamp(ageFit*.22+kindness*.24+socialFit*.20+workFit*.16+curiosityFit*.18,0,1)
}
function relationshipBond(a,b){return a&&b?(relationValue(a,b.id)+relationValue(b,a.id))/2:0}
function isCloseKin(a,b){
  if(!a||!b)return true;
  if((a.parents||[]).includes(b.id)||(b.parents||[]).includes(a.id))return true;
  if((a.children||[]).includes(b.id)||(b.children||[]).includes(a.id))return true;
  const ap=a.parents||[],bp=b.parents||[];
  return ap.some(id=>bp.includes(id))
}
function marryCouple(a,b){
  if(!a||!b||a.partner!==b.id||b.partner!==a.id)return;
  const oldA=a.name,oldB=b.name,familyName=chooseMarriageSurname(a,b);
  renamePersonSurname(a,familyName,"Married name");
  renamePersonSurname(b,familyName,"Married name");
  a.relationshipStage=b.relationshipStage="married";
  a.marriageDay=b.marriageDay=Math.floor(day);
  a.familySurname=b.familySurname=familyName;
  changeRelation(a,b,12);
  a.stress=clamp((a.stress||0)-10,0,100);b.stress=clamp((b.stress||0)-10,0,100);
  memoryAdd(a,`Married ${b.name} on day ${Math.floor(day)}`);
  memoryAdd(b,`Married ${a.name} on day ${Math.floor(day)}`);
  addEvent(`${oldA} and ${oldB} married and became the ${familyName} family.`,"marriage");
  showToast(`${firstNameOf(a)} & ${firstNameOf(b)} married`)
}
function splitCouple(a,b,why="grew apart"){
  if(!a||!b)return;
  const wasMarried=a.relationshipStage==="married"||b.relationshipStage==="married";
  a.partner=null;b.partner=null;
  a.relationshipStage=b.relationshipStage="single";
  a.relationshipSince=b.relationshipSince=0;
  a.marriageDay=b.marriageDay=null;
  a.familySurname=b.familySurname=null;
  a.lastBreakupDay=b.lastBreakupDay=Math.floor(day);
  a.breakups=(a.breakups||0)+1;b.breakups=(b.breakups||0)+1;
  if(wasMarried){
    if(a.birthSurname)renamePersonSurname(a,a.birthSurname,"Returned to birth name");
    if(b.birthSurname)renamePersonSurname(b,b.birthSurname,"Returned to birth name")
  }
  memoryAdd(a,`${wasMarried?"Marriage":"Relationship"} with ${b.name} ended`);
  memoryAdd(b,`${wasMarried?"Marriage":"Relationship"} with ${a.name} ended`);
  addEvent(`${a.name} and ${b.name} ${wasMarried?"ended their marriage":"split up"} because they ${why}.`,"relationship")
}

const skillJobs=["Gatherer","Woodcutter","Builder","Farmer","Miner","Hauler"];

function lifeStageFor(age){
  return age<6?"Young Child":age<14?"Child":age<18?"Teen":age<55?"Adult":age<70?"Older Adult":"Elder"
}
function skillLevel(p,job=p.job){
  return Math.round((p.skills&&p.skills[job])||0)
}
function skillTitle(v){
  return v>=85?"Master":v>=65?"Expert":v>=42?"Skilled":v>=20?"Practiced":"Novice"
}
function gainSkill(p,job,amount=.12){
  if(!p||!skillJobs.includes(job))return;
  p.skills=p.skills||{};
  const before=p.skills[job]||0;
  p.skills[job]=clamp(before+amount,0,100);
  if(before<20&&p.skills[job]>=20)memoryAdd(p,`Became practiced at ${job.toLowerCase()} work`);
  if(before<42&&p.skills[job]>=42)memoryAdd(p,`Became skilled at ${job.toLowerCase()} work`);
  if(before<65&&p.skills[job]>=65){memoryAdd(p,`Became an expert ${job.toLowerCase()}`);addEvent(`${p.name} became an expert ${job.toLowerCase()}.`,"citizen")}
  if(before<85&&p.skills[job]>=85){memoryAdd(p,`Mastered ${job.toLowerCase()} work`);addEvent(`${p.name} became a master ${job.toLowerCase()}.`,"citizen")}
}
function workEfficiency(p,job=p.job){
  return 1+skillLevel(p,job)/100*.72+(p.traits?.work||.5)*.14
}
function rewardWork(p,amount=.08){
  const s=citizenSettlement(p),market=s?ensureMarket(s):null,wage=amount*(market?.stage==="Coinage"?1.35:1)*(1+(s?.prosperity||50)/220);
  p.wealth=clamp((p.wealth||0)+wage,0,999);p.reputation=clamp((p.reputation||0)+amount*.22,0,100);if(market)market.transactions+=.04;
  if(skillLevel(p)>32&&Math.random()<.0025&&p.possessions.tools<3){p.possessions.tools++;memoryAdd(p,"Acquired a better work tool")}
}
function bestRelationFor(p,positive=true){
  let best=null,bestValue=positive?-999:999;
  for(const [id,v0] of Object.entries(p.relations||{})){
    const q=personById(id);if(!q||!q.alive)continue;
    const v=Number(v0)||0;
    if((positive&&v>bestValue)||(!positive&&v<bestValue)){best=q;bestValue=v}
  }
  return best?{person:best,value:Math.round(bestValue)}:null
}
function householdMembers(p){
  if(!p.homeId)return [];
  return people.filter(q=>q.alive&&q.homeId===p.homeId)
}
function homeFor(p){return p.homeId?buildingById(p.homeId):null}
function assignHomes(){
  for(const s of settlements.length?settlements:[settlement]){
    if(!s)continue;
    const residents=settlementPeople(s,true),huts=buildingsOf("hut",true,s.id);
    const capacity=new Map(huts.map(h=>[h.id,4]));
    for(const p of residents)if(p.homeId&&!capacity.has(p.homeId))p.homeId=null;
    for(const p of residents.filter(x=>x.homeId)){
      if((capacity.get(p.homeId)||0)>0)capacity.set(p.homeId,capacity.get(p.homeId)-1);else p.homeId=null
    }
    for(const p of residents.filter(x=>!x.homeId)){
      const partner=p.partner?people.find(q=>q.id===p.partner&&q.alive&&q.settlementId===s.id):null;
      const family=[p,...(partner?[partner]:[]),...residents.filter(q=>q.age<18&&(q.parents||[]).includes(p.id))].filter((q,i,a)=>a.findIndex(x=>x.id===q.id)===i&&!q.homeId);
      const h=huts.find(q=>(capacity.get(q.id)||0)>0);if(!h)break;
      for(const q of family){
        if((capacity.get(h.id)||0)<=0)break;
        q.homeId=h.id;capacity.set(h.id,capacity.get(h.id)-1)
      }
    }
  }
}
function jobAffinity(p,job){
  const t=p.traits||{},skill=skillLevel(p,job)/100;
  const trait={
    Gatherer:(t.curiosity||.5)*.42+(t.bravery||.5)*.18+(t.work||.5)*.22,
    Woodcutter:(t.work||.5)*.50+(t.bravery||.5)*.22,
    Builder:(t.work||.5)*.56+(t.kindness||.5)*.14,
    Farmer:(t.work||.5)*.38+(t.kindness||.5)*.31,
    Miner:(t.bravery||.5)*.43+(t.work||.5)*.43,
    Hauler:(t.work||.5)*.31+(t.social||.5)*.26+(t.kindness||.5)*.20
  }[job]||.5;
  return trait+skill*.55+(p.preferredJob===job?.18:0)+(p.job===job?.14:0)
}
function setCareer(p,job,reason="Village need"){
  if(!p||p.job===job)return;
  const old=p.job;
  p.job=job;p.jobSince=day;p.careerChanges=(p.careerChanges||0)+1;
  p.preferredJob=p.preferredJob||job;
  memoryAdd(p,`Changed work from ${old} to ${job}`);
  p.decisionReason=reason
}
function choosePersonalGoal(p){
  if(p.age<6)return "Stay close to family";
  if(p.age<14)return p.education<55?"Learn from adults":"Explore childhood interests";
  if(p.age<18)return `Prepare for ${p.preferredJob||"adult work"}`;
  if((p.grief||0)>45)return "Recover from loss";
  if(!p.partner&&(p.traits?.social||0)>.65)return "Build a close relationship";
  if(p.partner&&p.children.length===0&&(p.traits?.kindness||0)>.65)return "Build a family";
  if((p.wealth||0)<10&&(p.traits?.work||0)>.62)return "Build personal security";
  if((p.traits?.curiosity||0)>.74)return "Explore and understand the world";
  if(skillLevel(p,p.job)<65&&(p.traits?.work||0)>.58)return `Master ${p.job.toLowerCase()} work`;
  return `Help ${citizenSettlement(p)?.name||"the settlement"} prosper`
}
function updateLifeStage(p){
  const stage=lifeStageFor(p.age);
  if(p.lifeStage!==stage){
    const old=p.lifeStage;p.lifeStage=stage;
    if(old){
      memoryAdd(p,`Entered the ${stage.toLowerCase()} stage of life`);
      if(stage==="Teen"){addEvent(`${p.name} entered adolescence.`,"life");p.education=Math.max(p.education,25)}
      if(stage==="Adult"){
        p.preferredJob=p.preferredJob||skillJobs.slice().sort((a,b)=>jobAffinity(p,b)-jobAffinity(p,a))[0];
        memoryAdd(p,`Became an adult with an interest in ${p.preferredJob}`);
        addEvent(`${p.name} became an adult.`,"life")
      }
      if(stage==="Elder"){memoryAdd(p,"Became an elder of First Hearth");addEvent(`${p.name} became an elder.`,"life")}
    }
  }
}
function teachChild(p){
  if(!p.alive||p.age<5||p.age>=18||p.layer==="underground")return false;
  let mentor=null,best=-1;
  const parentIds=p.parents||[];
  for(const q of people){
    if(!q.alive||q.age<18||q.layer==="underground")continue;
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d>8)continue;
    const bonus=parentIds.includes(q.id)?18:0;
    const mastery=Math.max(...skillJobs.map(j=>skillLevel(q,j)));
    const score=mastery+bonus-d*2;
    if(score>best){best=score;mentor=q}
  }
  if(!mentor)return false;
  p.mentorId=mentor.id;
  p.education=clamp(p.education+.018*(1+(mentor.traits?.kindness||.5)),0,100);
  if(p.age>=10&&Math.random()<.018){
    const job=skillJobs.slice().sort((a,b)=>skillLevel(mentor,b)-skillLevel(mentor,a))[0];
    p.skills[job]=clamp((p.skills[job]||0)+.08,0,100);
    p.preferredJob=p.preferredJob||job
  }
  return true
}
function updateEmotionalLife(p){
  const home=homeFor(p),partner=p.partner?personById(p.partner):null;
  const best=bestRelationFor(p,true),rival=bestRelationFor(p,false);
  p.bestFriendId=best&&best.value>=25?best.person.id:null;
  p.rivalId=rival&&rival.value<=-18?rival.person.id:null;
  p.grief=clamp((p.grief||0)-.004,0,100);
  let happiness=68-(p.stress||0)*.42-p.hunger*.12-p.thirst*.13+(p.energy-50)*.10-(p.grief||0)*.25;
  if(home)happiness+=6;
  if(partner)happiness+=clamp(relationshipBond(p,partner),-60,80)*.07;
  if(best&&best.value>30)happiness+=4;
  if(p.rivalId)happiness-=3;
  if(p.wealth>18)happiness+=2;
  p.happiness=clamp(happiness,0,100);
  if(p.happiness>78)p.mood="Content";
  else if(p.happiness<25)p.mood="Miserable";
  else if(p.grief>45)p.mood="Grieving";
  p.longGoal=choosePersonalGoal(p)
}
function handleDeath(p,cause="natural causes"){
  if(!p||!p.alive)return;
  p.alive=false;p.causeOfDeath=cause;p.deathDay=Math.floor(day);invalidateWorldIndex();
  const deathSettlement=citizenSettlement(p);if(deathSettlement)deathSettlement.deaths++;
  const age=Math.floor(p.age);
  const partner=p.partner?people.find(q=>q.id===p.partner&&q.alive):null;
  if(partner){
    partner.partner=null;partner.relationshipStage="widowed";
    partner.grief=clamp((partner.grief||0)+55,0,100);partner.stress=clamp((partner.stress||0)+28,0,100);
    memoryAdd(partner,`Lost ${p.name}`);
    p.partner=null
  }
  for(const q of people){
    if(!q.alive||q.id===p.id)continue;
    const closeFamily=(q.parents||[]).includes(p.id)||(p.parents||[]).includes(q.id);
    const rel=relationValue(q,p.id);
    if(closeFamily||rel>35){
      q.grief=clamp((q.grief||0)+(closeFamily?42:20),0,100);
      q.stress=clamp((q.stress||0)+(closeFamily?18:8),0,100);
      memoryAdd(q,`${p.name} died`)
    }
  }
  const faith=religionById(p.religionId),culture=cultureById(p.cultureId);
  if(faith&&faith.prophetId===p.id)addEvent(`${faith.name} lost its founding prophet, ${p.name}.`,"religion");
  if(culture&&(p.reputation||0)>55&&!culture.heroes.includes(p.id))culture.heroes.push(p.id);
  addEvent(`${p.name} died at age ${age} from ${cause}.`,"death")
}
function updateAging(p){
  updateLifeStage(p);
  if(p.age>p.lifespan){
    const excess=p.age-p.lifespan;
    if(Math.random()<.000005*(1+excess*.42)){handleDeath(p,"old age");return false}
  }
  return p.alive
}
function livingCivUpdate(){
  assignHomes();ensureWorldIndex();
  const phase=Math.floor(tick/160)%4;
  for(const p of alivePeopleCache)if((p.id&3)===phase)updateEmotionalLife(p)
}

function makePerson(name,x,y,sex,age,parents=[]){
  const finalName=(!name||usedNames.has(name)||usedFirstNames.has(String(name).split(" ")[0]))?generateUniqueName(name?String(name).split(" ")[0]:null):name;
  registerPersonName(finalName);
  const p={
    id:nextPersonId++,name:finalName,x,y,px:x,py:y,sex,age,parents:[...parents],
    health:100,hunger:rnd(6,16),thirst:rnd(6,14),energy:rnd(80,100),
    job:age<14?"Child":"Gatherer",goal:"Explore",mood:"Curious",
    partner:null,children:[],memory:[parents.length?"Born in the settlement":"Entered the Tiny World"],
    alive:true,dir:1,phase:rnd(0,6.28),skin:rndi(0,3),shirt:rndi(0,5),hair:rndi(0,4),
    carryType:null,carryAmount:0,lastBirthDay:-999,workTimer:0,layer:"surface",
    traits:{bravery:rnd(.25,.9),work:rnd(.25,.9),social:rnd(.25,.9),curiosity:rnd(.25,.9),kindness:rnd(.25,.9)},
    socialNeed:rnd(5,25),stress:rnd(0,6),longGoal:"Build a stable life",
    decisionReason:"Learning the world",lastDecision:0,relations:{},
    relationshipStage:"single",relationshipSince:0,marriageDay:null,
    familySurname:null,birthSurname:String(finalName).split(" ").slice(-1)[0],
    birthName:finalName,nameHistory:[],surnameAttachment:rnd(.25,.95),
    breakups:0,lastBreakupDay:-999,
    lifeStage:lifeStageFor(age),lifespan:rnd(68,91),deathDay:null,causeOfDeath:null,
    happiness:rnd(55,75),grief:0,education:age>=18?rnd(24,58):age>=8?rnd(4,20):0,
    mentorId:null,homeId:null,wealth:rnd(0,3),reputation:0,
    possessions:{tools:0,keepsakes:parents.length?1:0},
    skills:{Gatherer:rnd(0,age>=18?15:3),Woodcutter:rnd(0,age>=18?8:2),Builder:rnd(0,age>=18?8:2),Farmer:rnd(0,age>=18?7:2),Miner:rnd(0,age>=18?5:1),Hauler:rnd(0,age>=18?8:2)},
    preferredJob:null,jobSince:day,careerChanges:0,bestFriendId:null,rivalId:null,
    settlementId:settlement?.id||1,originSettlementId:settlement?.id||1,citizenshipHistory:[],refugee:false,militaryRole:null,
    cultureId:settlement?.cultureId||null,religionId:settlement?.religionId||null,belief:rnd(18,68),faithStance:"Questioning",religiousRole:null,witnessedDivine:0,
    economicRole:null,socialClass:"Commoner",tradeMission:null
  };
  p.faithStance=faithStance(p);
  p.preferredJob=age>=14?skillJobs.slice().sort((a,b)=>jobAffinity(p,b)-jobAffinity(p,a))[0]:null;
  p.longGoal=choosePersonalGoal(p);
  return p
}
function makeCritter(type,x,y){
  const c={id:nextCritterId++,type,x,y,px:x,py:y,dir:1,phase:rnd(0,6.28),alive:true};
  critters.push(c);return c
}
function spawnCritter(type,x,y,count=1){
  let made=0;
  for(let n=0;n<count;n++){
    for(let tries=0;tries<20;tries++){
      const nx=Math.round(x+rnd(-3,3)),ny=Math.round(y+rnd(-3,3));
      if(passable(nx,ny)){makeCritter(type,nx,ny);made++;break}
    }
  }
  if(made)addEvent(`${made} ${type}${made>1?"s":""} appeared in the world.`,"life");
}
function updateCritters(){
  for(const c of critters){
    if(!c.alive)continue;
    c.px+=(c.x-c.px)*.2;c.py+=(c.y-c.py)*.2;c.phase+=.16;
    if(c.type==="wolf"){
      const prey=critters.filter(q=>q.alive&&(q.type==="deer"||q.type==="sheep")).sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];
      if(prey&&Math.hypot(prey.x-c.x,prey.y-c.y)<12){
        if(Math.hypot(prey.x-c.x,prey.y-c.y)<1.4&&Math.random()<.04){prey.alive=false;spawnParticles("dust",prey.x,prey.y,6);continue}
        moveCritterToward(c,prey);continue
      }
    }
    if(Math.random()<.055)wanderCritter(c)
  }
  critters=critters.filter(c=>c.alive)
}
function wanderCritter(c){
  const d=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]][rndi(0,8)];
  const nx=c.x+d[0],ny=c.y+d[1];if(passable(nx,ny)){c.dir=nx>=c.x?1:-1;c.x=nx;c.y=ny}
}
function moveCritterToward(c,t){
  const dx=Math.sign(t.x-c.x),dy=Math.sign(t.y-c.y),opts=[[c.x+dx,c.y+dy],[c.x+dx,c.y],[c.x,c.y+dy]];
  for(const q of opts)if(passable(q[0],q[1])){c.dir=q[0]>=c.x?1:-1;c.x=q[0];c.y=q[1];return}
}

function addBuilding(type,x,y,complete=true,settlementId=null){
  const sid=settlementId??settlement?.id??1;
  const b={id:nextBuildingId++,type,x,y,complete,progress:complete?100:0,age:0,smoke:rnd(0,6.28),crop:0,harvest:0,settlementId:sid};
  buildings.push(b);invalidateWorldIndex();invalidateBuildingOrder();return b
}
function buildingsOf(type,completeOnly=true,sid=null){
  return buildings.filter(b=>b.type===type&&(!completeOnly||b.complete)&&(sid==null||b.settlementId===sid))
}
function nearestBuilding(p,type=null,completeOnly=true){
  let best=null,bd=1e9;
  for(const b of buildings){
    if(type&&b.type!==type)continue;if(completeOnly&&!b.complete)continue;
    if(p?.settlementId&&b.settlementId!==p.settlementId)continue;
    const d=Math.abs(p.x-b.x)+Math.abs(p.y-b.y);
    if(d<bd){bd=d;best=b}
  }
  return best
}
function dropoff(p){return nearestBuilding(p,"stockpile")||nearestBuilding(p,"firepit")||nearestBuilding(p,"hut")}
function buildingAt(x,y,r=3){return buildings.some(b=>Math.hypot(b.x-x,b.y-y)<r)}
function passable(x,y){if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)return false;const t=terrain[idx(x,y)];return t!==T.DEEP&&t!==T.WATER&&t!==T.MOUNTAIN&&t!==T.SNOW&&t!==T.LAVA}
function recordTrail(x,y){if(x<0||y<0||x>=WORLD_W||y>=WORLD_H)return;const i=idx(x,y);if(passable(x,y))trail[i]=clamp(trail[i]+1,0,255)}
function moveTo(p,nx,ny){if(passable(nx,ny)){p.dir=nx>=p.x?1:-1;p.x=nx;p.y=ny;recordTrail(nx,ny);return true}return false}
function wander(p){const d=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]][rndi(0,8)];moveTo(p,p.x+d[0],p.y+d[1])}
function cachedNearestTile(p,key,fn,max=42,ttl=32){
  p._tileTargets=p._tileTargets||{};
  const c=p._tileTargets[key];
  if(c&&tick<=c.until&&c.x>=0&&c.y>=0&&c.x<WORLD_W&&c.y<WORLD_H&&fn(idx(c.x,c.y),c.x,c.y))return c;
  const target=nearestTile(p,fn,max);
  if(target)p._tileTargets[key]={x:target.x,y:target.y,until:tick+ttl};
  else delete p._tileTargets[key];
  return target
}
function clearCachedTile(p,key){if(p._tileTargets)delete p._tileTargets[key]}
function nearestTile(p,fn,max=42){let best=null,bd=1e9;for(let y=Math.max(0,p.y-max);y<=Math.min(WORLD_H-1,p.y+max);y+=2)for(let x=Math.max(0,p.x-max);x<=Math.min(WORLD_W-1,p.x+max);x+=2){const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d<bd&&fn(idx(x,y),x,y)){bd=d;best={x,y}}}return best}
function moveToward(p,t){if(!t){wander(p);return}const dx=Math.sign(t.x-p.x),dy=Math.sign(t.y-p.y),opts=[];if(dx&&passable(p.x+dx,p.y))opts.push([p.x+dx,p.y]);if(dy&&passable(p.x,p.y+dy))opts.push([p.x,p.y+dy]);if(dx&&dy&&passable(p.x+dx,p.y+dy))opts.push([p.x+dx,p.y+dy]);if(opts.length){const q=opts[rndi(0,opts.length-1)];moveTo(p,q[0],q[1])}else wander(p)}
function nearWater(p){for(let y=p.y-2;y<=p.y+2;y++)for(let x=p.x-2;x<=p.x+2;x++){if(x<0||y<0||x>=WORLD_W||y>=WORLD_H)continue;const t=terrain[idx(x,y)];if(t===T.WATER||t===T.DEEP)return true}return false}
function atTarget(p,t,r=1.4){return t&&Math.hypot(p.x-t.x,p.y-t.y)<=r}


function aiTraitLabel(p){
  if(!p.traits)return "Balanced";
  const pairs=[["Brave",p.traits.bravery],["Diligent",p.traits.work],["Social",p.traits.social],["Curious",p.traits.curiosity],["Caring",p.traits.kindness]].sort((a,b)=>b[1]-a[1]);
  return pairs[0][1]>.70?pairs[0][0]:"Balanced"
}
function aiChooseLongGoal(p){
  if(p.age<14)return "Grow up safely";
  const t=p.traits||{};
  if((t.curiosity||0)>.72)return "Explore the world";
  if((t.work||0)>.72)return "Master a useful trade";
  if((t.social||0)>.72)return "Build strong relationships";
  if((t.kindness||0)>.72)return "Care for family and neighbors";
  return `Help ${citizenSettlement(p)?.name||"the settlement"} prosper`
}
function aiDangerNear(p){
  if(p._dangerUntil&&tick<p._dangerUntil)return p._dangerCache||0;
  let danger=0;
  const pi=idx(clamp(Math.round(p.x),0,WORLD_W-1),clamp(Math.round(p.y),0,WORLD_H-1));
  if(p.layer!=="underground"&&(terrain[pi]===T.LAVA||burn[pi]>100))danger+=3;
  if(p.layer==="underground"&&underground[pi]===U.MAGMA)danger+=4;
  for(const c of critters){
    if(!c.alive||c.type!=="wolf")continue;
    const dx=c.x-p.x,dy=c.y-p.y;
    if(Math.abs(dx)<6&&Math.abs(dy)<6&&Math.hypot(dx,dy)<5)danger+=1
  }
  p._dangerCache=danger;p._dangerUntil=tick+8+(p.id%5);return danger
}
function aiUpdateMind(p){
  if(!p.alive)return;
  p.socialNeed=clamp((p.socialNeed||0)+.006,0,100);
  p.stress=clamp((p.stress||0)+(p.hunger>70?.012:0)+(p.thirst>70?.014:0)+(p.health<55?.018:0)+(p.grief||0)*.0007-.003,0,100);
  if((tick+p.id*17)%640===0)updateEmotionalLife(p);
  if(!p.longGoal||tick-p.lastDecision>900){p.longGoal=choosePersonalGoal(p)}
  const danger=aiDangerNear(p);
  if(danger>0){p.mood="Alarmed";p.decisionReason="Avoiding nearby danger";p.stress=clamp(p.stress+.18,0,100)}
  else if(p.hunger>70){p.decisionReason="Food is becoming urgent"}
  else if(p.thirst>70){p.decisionReason="Water is becoming urgent"}
  else if(p.energy<28){p.decisionReason="Needs rest"}
  else if(p.socialNeed>72&&(p.traits?.social||0)>.55){p.decisionReason="Wants company"}
  else{p.decisionReason=`Working toward: ${p.longGoal}`}
  if(tick-p.lastDecision>240){p.lastDecision=tick}
}
function aiSocialize(p){
  if(p.age<10||p.socialNeed<72||p.layer==="underground")return false;
  let friend=null,bd=8;
  const romantic=p.partner?personById(p.partner):null;
  if(romantic?.alive&&romantic.layer!=="underground"&&Math.hypot(romantic.x-p.x,romantic.y-p.y)<10){
    friend=romantic;bd=Math.hypot(romantic.x-p.x,romantic.y-p.y)
  }else{
    const local=settlementPeople(citizenSettlement(p),true);
    for(const q of local){
      if(q.id===p.id||q.layer==="underground")continue;
      const dx=q.x-p.x,dy=q.y-p.y;
      if(Math.abs(dx)>8||Math.abs(dy)>8)continue;
      const d=Math.hypot(dx,dy);if(d<bd){bd=d;friend=q}
    }
  }
  if(!friend)return false;
  p.goal=`Talk with ${friend.name}`;
  if(bd>1.6){moveToward(p,friend);return true}
  p.socialNeed=clamp(p.socialNeed-32,0,100);friend.socialNeed=clamp((friend.socialNeed||0)-18,0,100);
  const partnerGain=p.partner===friend.id?(p.relationshipStage==="married"?1.7:1.4):1;
  const conflictChance=((p.stress||0)+(friend.stress||0))/240*(1-((p.traits?.kindness||.5)+(friend.traits?.kindness||.5))/2)*.16;
  if(Math.random()<conflictChance){
    p.relations[friend.id]=clamp(Number(p.relations[friend.id]||0)-rnd(2,5),-100,100);
    friend.relations=friend.relations||{};friend.relations[p.id]=clamp(Number(friend.relations[p.id]||0)-rnd(2,5),-100,100);
    p.mood="Irritated";friend.mood="Irritated";memoryAdd(p,`Argued with ${friend.name}`);memoryAdd(friend,`Argued with ${p.name}`)
  }else{
    p.relations[friend.id]=clamp(Number(p.relations[friend.id]||0)+partnerGain,-100,100);
    friend.relations=friend.relations||{};friend.relations[p.id]=clamp(Number(friend.relations[p.id]||0)+partnerGain,-100,100);
    p.mood="Connected";if(Math.random()<.025)memoryAdd(p,`Shared time with ${friend.name}`)
  }
  return true
}
function aiFlee(p){
  if(!aiDangerNear(p))return false;
  const home=nearestBuilding(p,"hut")||nearestBuilding(p,"firepit");
  p.goal="Escape danger";p.mood="Alarmed";
  if(home&&Math.hypot(p.x-home.x,p.y-home.y)>2){moveToward(p,home)}
  else wander(p);
  return true
}

function assignJobs(){
  const groups=settlements.length?settlements:[settlement];
  for(const s of groups){
    if(!s)continue;
    const adults=settlementPeople(s,true).filter(p=>p.age>=14&&p.layer!=="underground");if(!adults.length)continue;
    const localBuildings=settlementBuildings(s,false),pending=localBuildings.filter(b=>!b.complete),farms=localBuildings.filter(b=>b.complete&&b.type==="farm");
    const desired={
      Builder:pending.length?Math.max(1,Math.ceil(adults.length*.14)):0,
      Farmer:hasTech("Agriculture",s)?Math.max(0,Math.min(farms.length*2,Math.ceil(adults.length*.25))):0,
      Miner:hasTech("Stoneworking",s)&&((s.stone||0)<14||(s.iron||0)<8)?Math.max(1,Math.ceil(adults.length*.14)):0,
      Woodcutter:(s.wood||0)<18?Math.max(1,Math.ceil(adults.length*.20)):Math.max(0,Math.ceil(adults.length*.10)),
      Gatherer:(s.food||0)<20?Math.max(1,Math.ceil(adults.length*.26)):Math.max(1,Math.ceil(adults.length*.14)),
      Hauler:Math.max(0,Math.ceil(adults.length*.10))
    };
    const remaining={...desired};let total=Object.values(remaining).reduce((a,b)=>a+b,0);
    while(total<adults.length){remaining[Math.random()<.55?"Gatherer":"Hauler"]++;total++}
    const jobs=Object.keys(remaining);
    const ranked=adults.map(p=>{
      const choices=jobs.map(job=>{
        let score=jobAffinity(p,job);
        if(day-(p.jobSince||0)<6&&p.job===job)score+=.18;
        if(p.militaryRole)score-=.10;
        return {job,score}
      }).sort((a,b)=>b.score-a.score);
      return {p,choices,best:choices[0]?.score||0}
    }).sort((a,b)=>b.best-a.best);
    for(const entry of ranked){
      const choice=entry.choices.find(c=>(remaining[c.job]||0)>0);
      const pick=choice?.job||"Gatherer";
      remaining[pick]=Math.max(0,(remaining[pick]||0)-1);
      if(entry.p.job!==pick)setCareer(entry.p,pick,`Best fit for ${pick.toLowerCase()} work`)
    }
  }
}
function deliver(p){
  if(p.layer==="underground")return false;
  const s=citizenSettlement(p),d=dropoff(p);if(!s||!d)return false;
  if(!atTarget(p,d,1.8)){p.goal=`Deliver ${p.carryType}`;moveToward(p,d);return true}
  if(p.carryType==="food")s.food+=p.carryAmount;if(p.carryType==="wood")s.wood+=p.carryAmount;
  if(p.carryType==="stone")s.stone+=p.carryAmount;if(p.carryType==="iron")s.iron+=p.carryAmount;
  if(p.carryType==="gold")s.gold+=p.carryAmount;if(p.carryType==="coal")s.coal=(s.coal||0)+p.carryAmount;
  p.carryType=null;p.carryAmount=0;p.goal="Work";return true
}
function findFarmWork(p){
  const farms=buildingsOf("farm",true,p.settlementId);if(!farms.length)return null;
  let best=null,bd=1e9;for(const f of farms){const d=Math.abs(p.x-f.x)+Math.abs(p.y-f.y);if(d<bd&&(f.crop>=100||f.crop<15)){bd=d;best=f}}
  return best||farms[rndi(0,farms.length-1)]
}
function workMinerUnderground(p){
  const mine=buildingsOf("mine",true,p.settlementId)[0];
  if(!mine)return false;
  if(p.layer!=="underground"){
    if(p.carryAmount>0&&p.carryType)return deliver(p);
    p.goal="Enter mine";
    if(!atTarget(p,mine,1.7)){moveToward(p,mine);return true}
    p.layer="underground";p.x=Math.round(mine.x);p.y=Math.round(mine.y);p.px=p.x;p.py=p.y;p.goal="Descend mine";return true
  }
  // Miners return to the surface when exhausted or carrying ore.
  if(p.carryAmount>0||p.hunger>70||p.thirst>72||p.energy<28){
    p.goal=p.carryAmount?`Haul ${p.carryType} to surface`:"Return to surface";
    if(Math.hypot(p.x-mine.x,p.y-mine.y)>1.5){moveUndergroundToward(p,mine);return true}
    p.layer="surface";p.x=Math.round(mine.x);p.y=Math.round(mine.y);p.px=p.x;p.py=p.y;return true
  }
  const target=nearestUndergroundTile(p,i=>uGold[i]>0||uIron[i]>0||uCoal[i]>0||uStone[i]>0,60);
  if(!target){p.goal="Extend mine tunnels";const a=rnd(0,Math.PI*2);moveUnderground(p,p.x+Math.sign(Math.cos(a)),p.y+Math.sign(Math.sin(a)));return true}
  p.goal="Mine underground";
  if(Math.hypot(p.x-target.x,p.y-target.y)>1.25){moveUndergroundToward(p,target);return true}
  const i=idx(target.x,target.y);
  if(uGold[i]>0){uGold[i]--;p.carryType="gold"}
  else if(uIron[i]>0){uIron[i]--;p.carryType="iron"}
  else if(uCoal[i]>0){uCoal[i]--;p.carryType="coal"}
  else{uStone[i]=Math.max(0,uStone[i]-1);p.carryType="stone"}
  p.carryAmount=1+(Math.random()<skillLevel(p,"Miner")/170?1:0);gainSkill(p,"Miner",.15);rewardWork(p,.07);underground[i]=U.CAVE;undergroundDirty=true;spawnParticles("stone",p.x,p.y,5);return true
}
function workPerson(p){const s=citizenSettlement(p);if(!s)return false;if(p.job==="Miner"&&buildingsOf("mine",true,p.settlementId).length)return workMinerUnderground(p);if(p.carryAmount>0&&p.carryType)return deliver(p);
  if(p.job==="Builder"){const site=buildings.find(b=>!b.complete&&b.settlementId===p.settlementId);if(site){p.goal=`Build ${site.type}`;if(!atTarget(p,site,1.6)){moveToward(p,site);return true}site.progress+=1.35*workEfficiency(p,"Builder");gainSkill(p,"Builder",.10);rewardWork(p,.035);spawnParticles("dust",site.x,site.y,2);if(site.progress>=100){site.progress=100;site.complete=true;invalidateWorldIndex();addEvent(`${p.name} completed the ${site.type}.`,"building");if(site.type==="hut"){discover("Shelter",`${s.name} mastered permanent shelter.`,s);assignHomes()}if(site.type==="stockpile")discover("Storage",`${s.name} established shared storage.`,s);if(site.type==="farm")discover("Agriculture",`${s.name} prepared its first permanent fields.`,s);if(site.type==="granary")discover("Granaries",`${s.name} completed a granary to protect its harvest.`,s);if(site.type==="mine"){discover("Mining",`${s.name} opened its first mine shaft.`,s);openMineShaft(site)}}return true}}
  if(p.job==="Farmer"){const f=findFarmWork(p);if(f){p.goal="Tend fields";if(!atTarget(p,f,2)){moveToward(p,f);return true}if(f.crop>=100){p.carryType="food";p.carryAmount=5+Math.floor(skillLevel(p,"Farmer")/35);f.crop=8;gainSkill(p,"Farmer",.18);rewardWork(p,.06);spawnParticles("grain",f.x,f.y,8);return true}if(f.crop<15)f.crop=18;gainSkill(p,"Farmer",.035);return true}}
  if(p.job==="Miner"){const target=cachedNearestTile(p,"surfaceMine",(i)=>rocks[i]>0||iron[i]>0||gold[i]>0,34,30);if(target){p.goal="Mine minerals";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);if(gold[i]>0){gold[i]--;p.carryType="gold"}else if(iron[i]>0){iron[i]--;p.carryType="iron"}else{rocks[i]--;p.carryType="stone"}p.carryAmount=1+(Math.random()<skillLevel(p,"Miner")/180?1:0);clearCachedTile(p,"surfaceMine");gainSkill(p,"Miner",.14);rewardWork(p,.06);spawnParticles("stone",p.x,p.y,5);return true}}
  if(p.job==="Woodcutter"){const target=cachedNearestTile(p,"wood",(i)=>trees[i]>0,34,36);if(target){p.goal="Cut wood";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);trees[i]--;clearCachedTile(p,"wood");p.carryType="wood";p.carryAmount=1+(Math.random()<skillLevel(p,"Woodcutter")/150?1:0);gainSkill(p,"Woodcutter",.13);rewardWork(p,.045);spawnParticles("leaf",p.x,p.y,6);return true}}
  if(p.job==="Hauler"){const f=buildingsOf("farm",true,p.settlementId).find(f=>f.crop>=100);if(f){p.goal="Collect harvest";if(!atTarget(p,f,2)){moveToward(p,f);return true}p.carryType="food";p.carryAmount=4+Math.floor(skillLevel(p,"Hauler")/45);f.crop=12;gainSkill(p,"Hauler",.10);rewardWork(p,.04);return true}}
  const target=cachedNearestTile(p,"food",(i)=>food[i]>0,34,34);if(target){p.goal="Gather food";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);food[i]--;clearCachedTile(p,"food");p.carryType="food";p.carryAmount=2+(Math.random()<skillLevel(p,"Gatherer")/160?1:0);gainSkill(p,"Gatherer",.11);rewardWork(p,.035);return true}
  wander(p);return true;
}
function homeCapacity(s=settlement){return s?buildingsOf("hut",true,s.id).length*4+2:2}
function matchPartners(){
  for(const s of settlements){
    const singles=settlementPeople(s,true).filter(p=>p.age>=18&&!p.partner&&p.layer!=="underground"&&day-(p.lastBreakupDay||-999)>7);
    if(singles.length<2)continue;
    for(const p of singles){
      if(p.partner)continue;
      let best=null,bestScore=.55;
      for(const q of singles){
        if(q===p||q.partner||q.sex===p.sex||Math.abs(q.age-p.age)>18||isCloseKin(p,q))continue;
        const dx=q.x-p.x,dy=q.y-p.y;
        if(Math.abs(dx)>22||Math.abs(dy)>22)continue;
        const dist=Math.hypot(dx,dy),score=compatibilityScore(p,q)+relationValue(p,q.id)/220+relationValue(q,p.id)/220-dist/170;
        if(score>bestScore){bestScore=score;best=q}
      }
      if(best&&Math.random()<.16){
        p.partner=best.id;best.partner=p.id;p.relationshipStage=best.relationshipStage="dating";p.relationshipSince=best.relationshipSince=Math.floor(day);
        const initial=Math.round(16+compatibilityScore(p,best)*24);
        p.relations[best.id]=Math.max(relationValue(p,best.id),initial);best.relations[p.id]=Math.max(relationValue(best,p.id),initial);
        memoryAdd(p,`Started dating ${best.name}`);memoryAdd(best,`Started dating ${p.name}`);addEvent(`${p.name} and ${best.name} began dating.`,"relationship")
      }
    }
  }
}
function updateRelationships(){
  const done=new Set();
  for(const p of people){
    if(!p.alive||!p.partner||done.has(p.id))continue;
    const q=personById(p.partner);
    if(!q||!q.alive){
      p.partner=null;p.relationshipStage="single";p.familySurname=null;p.marriageDay=null;
      memoryAdd(p,"Lost their partner");
      continue
    }
    if(q.partner!==p.id){p.partner=null;p.relationshipStage="single";continue}
    done.add(p.id);done.add(q.id);

    const comp=compatibilityScore(p,q),dist=Math.hypot(p.x-q.x,p.y-q.y);
    let emotional=(comp-.56)*1.5;
    if(dist<4)emotional+=.20;
    if(dist>18)emotional-=.10;
    if((p.stress||0)>68)emotional-=.20;
    if((q.stress||0)>68)emotional-=.20;
    if(p.hunger>82||p.thirst>82)emotional-=.08;
    if(q.hunger>82||q.thirst>82)emotional-=.08;
    if(p.mood==="Connected"||q.mood==="Connected")emotional+=.10;

    // Occasional emotional moments create real relationship variation.
    if(Math.random()<.035){
      const kindness=((p.traits?.kindness||.5)+(q.traits?.kindness||.5))/2;
      if((p.stress||0)+(q.stress||0)>125&&kindness<.58)emotional-=rnd(2,5);
      else emotional+=rnd(1,3)
    }
    changeRelation(p,q,emotional);

    const bond=relationshipBond(p,q);
    const together=day-Math.min(p.relationshipSince||day,q.relationshipSince||day);

    if(p.relationshipStage==="dating"){
      if(together>8&&bond>48&&comp>.54&&Math.random()<.020){marryCouple(p,q);continue}
      if(together>4&&bond<2&&Math.random()<.055){splitCouple(p,q,"stopped feeling close");continue}
      if(together>10&&bond<18&&((p.stress||0)>78||(q.stress||0)>78)&&Math.random()<.025){splitCouple(p,q,"could not handle the strain");continue}
    }else if(p.relationshipStage==="married"){
      if(together>15&&bond<-26&&Math.random()<.018){splitCouple(p,q,"grew deeply unhappy");continue}
      if(bond>62&&dist<5&&Math.random()<.01){
        p.stress=clamp((p.stress||0)-2,0,100);
        q.stress=clamp((q.stress||0)-2,0,100)
      }
    }
  }
}
function tryBirths(){
  if(people.filter(p=>p.alive).length>=populationCapForWorld())return;
  for(const mother of people){
    if(!mother.alive||mother.sex!=="F"||mother.age<18||mother.age>42||!mother.partner||day-mother.lastBirthDay<22)continue;
    const s=citizenSettlement(mother);if(!s||homeCapacity(s)<=settlementPopulation(s)||s.food<12)continue;
    const father=personById(mother.partner);
    if(!father||!father.alive||father.settlementId!==mother.settlementId||father.partner!==mother.id)continue;
    const bond=relationshipBond(mother,father),baseChance=mother.relationshipStage==="married"?.011:.0065;
    if(Math.random()>baseChance*clamp((bond+100)/150,.30,1.35))continue;
    let childSurname,chosenBy=null;
    if(mother.relationshipStage==="married"&&father.relationshipStage==="married"&&surnameOf(mother)===surnameOf(father))childSurname=surnameOf(mother);
    else{const choice=chooseUnmarriedChildSurname(mother,father);childSurname=choice.surname;chosenBy=choice.chooser}
    const sex=Math.random()<.5?"F":"M",name=generateUniqueName(null,childSurname);
    const baby=makePerson(name,mother.x,mother.y,sex,0,[mother.id,father.id]);baby.settlementId=s.id;baby.originSettlementId=s.id;
    baby.cultureId=mother.cultureId||father.cultureId||s.cultureId;
    baby.religionId=mother.religionId===father.religionId?mother.religionId:(mother.belief>=father.belief?mother.religionId:father.religionId)||s.religionId;
    baby.belief=clamp(((mother.belief||40)+(father.belief||40))/2+rnd(-14,14),5,95);baby.faithStance=faithStance(baby);
    for(const k of ["bravery","work","social","curiosity","kindness"])baby.traits[k]=clamp(((mother.traits?.[k]||.5)+(father.traits?.[k]||.5))/2+rnd(-.13,.13),.12,.95);
    baby.lifespan=clamp((mother.lifespan+father.lifespan)/2+rnd(-8,8),62,98);baby.education=0;baby.longGoal="Grow up safely";
    mother.children.push(baby.id);father.children.push(baby.id);mother.lastBirthDay=day;s.food=Math.max(0,s.food-6);people.push(baby);invalidateWorldIndex();s.births++;
    memoryAdd(mother,`Gave birth to ${name} in ${s.name}`);memoryAdd(father,`Became parent of ${name}`);
    if(chosenBy)memoryAdd(chosenBy,`Chose the ${childSurname} surname for ${firstNameOf(baby)}`);
    addEvent(`${name} was born in ${s.name} to ${mother.name} and ${father.name}.`,"family");break
  }
}
function eatFromStores(p){
  if(p.hunger<58)return false;const s=citizenSettlement(p);if(!s||s.food<=0)return false;
  const m=ensureMarket(s),cost=m.stage==="Coinage"?Math.max(.05,marketPrice(s,"food")*.06):0;if(cost&&p.wealth>cost)p.wealth-=cost;
  s.food--;p.hunger=clamp(p.hunger-36,0,100);p.goal=m.stage==="Coinage"?"Buy food":"Eat";return true
}
function think(p){if(!p.alive)return;p.px+=(p.x-p.px)*.23;p.py+=(p.y-p.py)*.23;p.phase+=.22;p.hunger+=p.age<6?.020:.030;p.thirst+=.043;p.energy-=p.age<6?.010:.016;p.age+=.00011;if(!updateAging(p))return;aiUpdateMind(p);
  const pi=idx(clamp(Math.round(p.x),0,WORLD_W-1),clamp(Math.round(p.y),0,WORLD_H-1));if(p.layer!=="underground"){if(terrain[pi]===T.LAVA)p.health-=1.6;else if(burn[pi]>110)p.health-=.30}else if(underground[pi]===U.MAGMA)p.health-=1.8;if(p.hunger>92||p.thirst>94)p.health-=.09;else if(p.health<100&&p.hunger<55&&p.thirst<55)p.health+=.014;if(p.health<=0){const cause=p.hunger>92?"starvation":p.thirst>94?"dehydration":terrain[pi]===T.LAVA||underground[pi]===U.MAGMA?"burns":"injury";handleDeath(p,cause);return}
  if(aiFlee(p))return;
  if(p.layer==="underground"&&p.job==="Miner"){p.mood="Working below";workMinerUnderground(p);return}
  if(p.thirst>60){p.goal="Find water";p.mood="Thirsty";if(nearWater(p))p.thirst=clamp(p.thirst-20,0,100);else moveToward(p,cachedNearestTile(p,"water",(i)=>terrain[i]===T.WATER||terrain[i]===T.DEEP,36,90));return}
  if(eatFromStores(p))return;
  if(p.energy<22){p.goal="Rest";p.mood="Tired";const home=nearestBuilding(p,"hut")||nearestBuilding(p,"firepit");if(home&&!atTarget(p,home,2))moveToward(p,home);else p.energy=clamp(p.energy+.8,0,100);return}
  if(p.age<14){p.job="Child";teachChild(p);const home=homeFor(p)||nearestBuilding(p,"hut")||nearestBuilding(p,"firepit");p.goal=p.education<55?"Learn and stay near home":"Explore near home";if(home&&Math.hypot(p.x-home.x,p.y-home.y)>7)moveToward(p,home);else if(Math.random()<.08+(p.traits?.curiosity||.5)*.03)wander(p);return}
  if(p.age<18){teachChild(p);if(p.job==="Child")p.job=p.preferredJob||"Gatherer"}
  if(merchantTravel(p))return;
  if(aiSocialize(p))return;
  p.mood=p.stress>65?"Stressed":"Focused";workPerson(p);
}

function findBuildSite(type,s=settlement){
  if(!s)return null;const cx=s.x,cy=s.y;
  for(let r=4;r<25;r+=2)for(let n=0;n<26;n++){
    const a=(n/26)*Math.PI*2+rnd(-.08,.08),x=Math.round(cx+Math.cos(a)*r),y=Math.round(cy+Math.sin(a)*r);
    if(!passable(x,y)||buildingAt(x,y,type==="farm"?5:4))continue;
    const t=terrain[idx(x,y)];if(type==="farm"&&(t!==T.GRASS&&t!==T.FOREST))continue;if(type!=="farm"&&t===T.SAND)continue;
    return{x,y}
  }
  return null
}
function queueBuilding(type,wood,stone=0,s=settlement){
  if(!s||buildings.some(b=>b.settlementId===s.id&&b.type===type&&!b.complete))return false;
  if((s.wood||0)<wood||(s.stone||0)<stone)return false;
  const site=findBuildSite(type,s);if(!site)return false;
  s.wood-=wood;s.stone-=stone;addBuilding(type,site.x,site.y,false,s.id);
  addEvent(`${s.name} began construction of a ${type}.`,"building");return true
}
function planVillage(s=settlement){
  if(!s)return;const pop=settlementPopulation(s),local=settlementBuildings(s,false),huts=local.filter(b=>b.complete&&b.type==="hut").length,farms=local.filter(b=>b.complete&&b.type==="farm").length;
  if(huts<Math.ceil(Math.max(2,pop)/4))queueBuilding("hut",8,0,s);
  if(day-s.foundedDay>2&&!local.some(b=>b.type==="stockpile"))queueBuilding("stockpile",10,0,s);
  if(hasTech("Storage",s)&&day-s.foundedDay>6&&!hasTech("Agriculture",s)&&s.food>=10)discover("Agriculture",`${s.name} began saving seed for permanent fields.`,s);
  if(hasTech("Agriculture",s)&&farms<Math.max(1,Math.ceil(pop/6)))queueBuilding("farm",6,0,s);
  if(pop>=6&&!hasTech("Village Planning",s))discover("Village Planning",`${s.name} began organizing itself as a true village.`,s);
  if(day-s.foundedDay>12&&s.wood>=15&&!hasTech("Stoneworking",s))discover("Stoneworking",`${s.name} learned to shape stone.`,s);
  if(hasTech("Stoneworking",s)&&pop>=5&&!local.some(b=>b.type==="mine"))queueBuilding("mine",10,2,s);
  if(hasTech("Stoneworking",s)&&pop>=7&&!local.some(b=>b.type==="workshop"))queueBuilding("workshop",12,5,s);
  if(pop>=8&&hasTech("Agriculture",s)&&!local.some(b=>b.type==="granary"))queueBuilding("granary",14,2,s);
  const route=tradeRoutes.some(r=>r.aId===s.id||r.bId===s.id);
  if(pop>=7&&!local.some(b=>b.type==="market")&&(route||day-s.foundedDay>20))queueBuilding("market",10,2,s);
  const rel=settlementReligion(s),followers=rel?religionFollowers(rel):0;
  if(rel&&followers>=4&&!local.some(b=>b.type==="shrine"))queueBuilding("shrine",8,2,s);
  if(rel&&followers>=12&&rel.prestige>=18&&!local.some(b=>b.type==="temple"))queueBuilding("temple",18,8,s);
  if(!hasTech("Roads",s)){let found=false;for(let n=0;n<250;n++){const i=rndi(0,N-1);if(trail[i]>90){found=true;break}}if(found)discover("Roads",`${s.name}'s repeated foot traffic hardened into permanent paths.`,s)}
}
function updateFarms(){for(const f of buildingsOf("farm")){const i=idx(clamp(Math.round(f.x),0,WORLD_W-1),clamp(Math.round(f.y),0,WORLD_H-1));const rain=wet[i]>0?1.7:1;f.crop=clamp(f.crop+.045*rain,0,100)}}
function consumeSettlement(){
  if(tick%420!==0)return;
  for(const s of settlements.length?settlements:[settlement]){
    if(!s)continue;const alive=settlementPopulation(s);
    if(alive>0)s.food=Math.max(0,s.food-Math.max(1,Math.floor(alive/4)))
  }
}
function simulate(){
  if(paused)return;ensureWorldIndex();
  const loops=speed===1?1:speed===2?2:5;
  for(let l=0;l<loops;l++){
    tick++;day+=.008;
    for(const p of people)think(p);
    updateCritters();for(const b of buildings)b.age++;updateFarms();consumeSettlement();

    // Expensive systems intentionally land on different frames.
    if(tick%95===11)updateRelationships();
    if(tick%120===37)assignJobs();
    if(tick%160===71)livingCivUpdate();
    if(tick%190===109){for(const s of settlements)planVillage(s);matchPartners();tryBirths()}
    if(tick%620===211)attemptExpansion();
    if(tick%760===337)updatePoliticalWorld();

    // Culture / faith / economy no longer execute as one giant spike.
    if(tick%380===69)updateCultures();
    if(tick%380===169)updateReligions();
    if(tick%380===269)updateEconomy();

    if(tick%280===143){
      for(let n=0;n<280;n++){
        const x=rndi(0,WORLD_W-1),y=rndi(0,WORLD_H-1),i=idx(x,y);
        if(terrain[i]===T.GRASS&&food[i]<4&&Math.random()<.15)food[i]++;
        if(terrain[i]===T.FOREST&&trees[i]<4&&Math.random()<.18)trees[i]++;
        if(wet[i])wet[i]--;if(scar[i])scar[i]--;if(burn[i])burn[i]=Math.max(0,burn[i]-2)
      }
      // IMPORTANT: no dirty=true here. Food/tree regrowth does not require
      // rebuilding the multi-million-pixel terrain backing canvas.
    }
  }
  for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.life--;p.vy+=p.type==="leaf"?.006:0}
  particles=particles.filter(p=>p.life>0);
  for(const c of clouds){c.life--;c.phase+=.015;c.x+=.015}
  clouds=clouds.filter(c=>c.life>0);
  updateUI(false)
}

function generate(useExistingSeed=false){
  if(useExistingSeed){worldConfig=normalizeWorldConfig(lastGeneratedConfig)}
  else{worldConfig=normalizeWorldConfig(worldConfig)}
  saveWorldConfig();
  allocateWorld(configValue("worldSize"));
  if(useExistingSeed){
    worldSeed=seedFromInput(lastGeneratedConfig.seed);
    worldConfig=Object.assign({},lastGeneratedConfig)
  }else{
    worldSeed=seedFromInput(worldConfig.seed);
    lastGeneratedConfig=Object.assign({},worldConfig,{seed:String(worldSeed)})
  }

  const landBias=(configValue("landmass")-50)*.0018-(configValue("water")-50)*.0016;
  const mountainBias=(configValue("mountains")-50)*.0011;
  const wildlifeScale=configValue("wildlife")/50;

  for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){
    const i=idx(x,y),nx=(x-WORLD_W/2)/(WORLD_W/2),ny=(y-WORLD_H/2)/(WORLD_H/2),edge=Math.pow(Math.sqrt(nx*nx+ny*ny),1.18),macro=fbm(x,y,worldSeed),detail=fbm(x+410,y-270,worldSeed+73);
    height[i]=clamp(macro*.98+detail*.18-edge*.185+landBias+mountainBias*.22,.04,.98);
    moisture[i]=clamp(fbm(x-340,y+570,worldSeed+141)+(configValue("forest")-50)*.0016,0,1);
    classify(i);
    food[i]=terrain[i]===T.GRASS&&hash(x,y,worldSeed+9)>(.965-configValue("forest")*.0005)?rndi(1,4):0;
    trees[i]=terrain[i]===T.FOREST?rndi(1,Math.max(1,Math.round(2+configValue("forest")/25))):0;
    rocks[i]=(terrain[i]===T.MOUNTAIN||nearType(x,y,T.MOUNTAIN))&&hash(x,y,worldSeed+21)>(.90-configValue("mountains")*.0012)?rndi(1,3):0;
    iron[i]=rocks[i]&&hash(x,y,worldSeed+22)>.84?rndi(1,2):0;
    gold[i]=rocks[i]&&hash(x,y,worldSeed+23)>.965?1:0;
    wet[i]=scar[i]=burn[i]=trail[i]=0
  }

  let sx=WORLD_W>>1,sy=WORLD_H>>1,best=null,bestScore=-999;
  const searchX=Math.max(24,Math.round(WORLD_W*.38)),searchY=Math.max(24,Math.round(WORLD_H*.38));
  const siteTries=Math.round(450+WORLD_W*1.25);
  for(let n=0;n<siteTries;n++){
    const x=clamp((WORLD_W>>1)+rndi(-searchX,searchX),8,WORLD_W-9),y=clamp((WORLD_H>>1)+rndi(-searchY,searchY),8,WORLD_H-9),t=terrain[idx(x,y)];
    if(t!==T.GRASS&&t!==T.FOREST)continue;
    let score=0;
    for(let yy=-12;yy<=12;yy+=3)for(let xx=-12;xx<=12;xx+=3){
      const nx=x+xx,ny=y+yy;if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
      const tt=terrain[idx(nx,ny)];
      if(tt===T.GRASS||tt===T.FOREST)score++;
      if(tt===T.WATER)score+=.25
    }
    if(score>bestScore){bestScore=score;best={x,y}}
  }
  if(best){sx=best.x;sy=best.y}
  paint(sx,sy,Math.max(11,Math.min(25,Math.round(WORLD_W*.10))),"land",false);

  nextPersonId=1;nextBuildingId=1;nextCritterId=1;nextSettlementId=1;nextKingdomId=1;nextWarId=1;nextCultureId=1;nextReligionId=1;nextHolySiteId=1;
  usedNames.clear();usedFirstNames.clear();
  people=[];settlements=[];kingdoms=[];wars=[];tradeRoutes=[];cultures=[];religions=[];holySites=[];divineChronicle=[];settlement=null;atlasMode="political";worldIndexDirty=true;buildingOrderDirty=true;

  const startPop=configValue("startPopulation");
  for(let n=0;n<startPop;n++){
    const sex=n%2===0?"F":"M";
    const name=generateUniqueName(n===0?"Mara":n===1?"Dren":null);
    people.push(makePerson(name,sx+rndi(-3,3),sy+rndi(-2,2),sex,rndi(19,30)))
  }
  invalidateWorldIndex();
  if(people.length>=2){
    people[0].partner=people[1].id;people[1].partner=people[0].id;
    people[0].relationshipStage=people[1].relationshipStage="dating";
    people[0].relationshipSince=people[1].relationshipSince=1;
    people[0].relations[people[1].id]=36;people[1].relations[people[0].id]=36
  }

  buildings=[];events=[];particles=[];clouds=[];critters=[];visualEffects=[];
  day=1;tick=0;camX=sx;camY=sy;zoom=4;dirty=true;undergroundDirty=true;selected=null;
  activeLayer="surface";resourceLayer="surface";
  settlement=createSettlement("First Hearth",sx,sy,people,null);selectedSettlementId=settlement.id;
  settlement.food=configValue("startingFood");settlement.wood=configValue("startingWood");settlement.stone=0;settlement.iron=0;settlement.gold=0;settlement.coal=0;
  for(const p of people){p.settlementId=settlement.id;p.originSettlementId=settlement.id}
  generateUnderground();
  addBuilding("firepit",sx,sy,true,settlement.id);

  const sizeScale=clamp(configValue("worldSize")/200,.5,2.5);
  const deerCount=Math.round((2+6*wildlifeScale)*sizeScale),sheepCount=Math.round(3*wildlifeScale*sizeScale),wolfCount=Math.round(1.5*wildlifeScale*sizeScale);
  for(let n=0;n<deerCount;n++)spawnCritter("deer",sx+rndi(-28,28),sy+rndi(-22,22),1);
  for(let n=0;n<sheepCount;n++)spawnCritter("sheep",sx+rndi(-30,30),sy+rndi(-24,24),1);
  for(let n=0;n<wolfCount;n++)spawnCritter("wolf",sx+rndi(-42,42),sy+rndi(-32,32),1);

  addEvent(`${people.map(p=>p.name).slice(0,2).join(" and ")} founded First Hearth in a ${WORLD_W}×${WORLD_H} world, seed ${worldSeed}.`,"founding");
  assignJobs();assignHomes();for(const p of people)updateEmotionalLife(p);clampCamera();updateUI();
  showToast(useExistingSeed?"World reset":"New customized world created")
}

function drawTrails(){const b=visibleBounds(2),step=adaptiveStep(b,zoom<3?3:zoom<4?2:1,19000);ctx.save();ctx.lineCap="round";for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){const v=trail[idx(x,y)];if(v<12)continue;const s=worldToScreen(x+.5,y+.5),z=cameraScale();ctx.fillStyle=v>80?"rgba(118,88,55,.52)":`rgba(135,103,67,${Math.min(.38,v/230)})`;ctx.beginPath();ctx.ellipse(s.x,s.y,Math.max(1.4,z*.48),Math.max(1,z*.22),hash(x,y,9)*Math.PI,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawOrganicLandOverlay(){
  const b=visibleBounds(4),z=cameraScale(),step=adaptiveStep(b,zoom<2.8?3:2,17000);
  ctx.save();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),t=terrain[i];if(isWaterTile(t)||t===T.LAVA)continue;
    const h=hash(x,y,worldSeed+1200),s=worldToScreen(x+.5+(h-.5)*.38,y+.5+(hash(x,y,worldSeed+1201)-.5)*.28);
    let col=t===T.FOREST?"rgba(54,119,63,.065)":t===T.SAND?"rgba(244,226,174,.055)":t===T.MOUNTAIN?"rgba(187,190,185,.045)":"rgba(167,210,125,.050)";
    ctx.fillStyle=col;
    ctx.beginPath();
    ctx.ellipse(s.x,s.y,z*(.72+h*.30),z*(.22+h*.15),h*Math.PI,0,Math.PI*2);
    ctx.fill()
  }
  ctx.restore()
}
function drawCoastalBlend(){
  const b=visibleBounds(4),z=cameraScale(),t=visualTime,step=adaptiveStep(b,1,22000);
  ctx.save();ctx.lineCap="round";
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y),tt=terrain[i];
      if(!isWaterTile(tt)||shoreDistance[i]>1.5)continue;
      const normal=normalizedShoreVector(x,y);if(!normal.count)continue;
      const nx=normal.x,ny=normal.y,tx=-ny,ty=nx;
      const h=hash(x,y,worldSeed+530);if(h<.45)continue;
      const pulse=.5+.5*Math.sin(t*1.15+x*.18+y*.11+h*2.0);
      const s=worldToScreen(x+.5,y+.5),push=z*(.08+.11*pulse),cx=s.x+nx*push,cy=s.y+ny*push,len=z*(.18+.14*h);
      ctx.strokeStyle=`rgba(244,252,250,${.035+.065*pulse})`;
      ctx.lineWidth=Math.max(1,z*.032);
      ctx.beginPath();ctx.moveTo(cx-tx*len,cy-ty*len);ctx.quadraticCurveTo(cx+nx*z*.035,cy+ny*z*.035,cx+tx*len,cy+ty*len);ctx.stroke()
    }
  }
  ctx.restore()
}
function drawWater(){
  const b=visibleBounds(5),z=cameraScale(),t=visualTime;
  ctx.save();ctx.lineCap="round";

  // No repeated wave stripes across the open ocean.
  // Visible waves are breaking surf and backwash oriented to the coastline.
  const step=adaptiveStep(b,zoom<3?2:1,24000);
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y);if(!isWaterTile(terrain[i]))continue;
      const dist=shoreDistance[i];
      if(dist>2.2)continue;

      const normal=normalizedShoreVector(x,y);
      if(!normal.count)continue;
      const nx=normal.x,ny=normal.y,tx=-ny,ty=nx;
      const h=hash(x,y,worldSeed+333);
      if(h<.22)continue;

      // Nearby coastline cells share similar timing, while a little noise
      // keeps the surf from becoming a perfect continuous ring.
      let phase=(t*.58+x*.075+y*.052+h*.20)%1;
      if(phase<0)phase+=1;
      const approach=smoothstep(.05,.76,phase);
      const crash=1-smoothstep(.66,1.0,phase);
      const alpha=Math.sin(Math.PI*phase)*(.10+(.30*crash));

      const base=worldToScreen(x+.5,y+.5);
      // Move the crest from offshore toward the land as the phase advances.
      const normalOffset=z*(-.30+approach*.48);
      const cx=base.x+nx*normalOffset,cy=base.y+ny*normalOffset;
      const len=z*(.34+.26*h+.16*(1-dist/2.2));
      const bow=z*(.055+.055*Math.sin(t*1.8+x*.31+y*.21));

      ctx.strokeStyle=`rgba(249,253,251,${clamp(alpha,0,.34)})`;
      ctx.lineWidth=Math.max(1,z*(.055+.025*crash));
      ctx.beginPath();
      ctx.moveTo(cx-tx*len,cy-ty*len);
      ctx.quadraticCurveTo(cx+nx*bow,cy+ny*bow,cx+tx*len,cy+ty*len);
      ctx.stroke();

      // A softer second line appears behind the breaking crest as backwash.
      if(phase>.45&&phase<.92&&h>.52){
        const back=z*(-.48+approach*.30);
        const bx=base.x+nx*back,by=base.y+ny*back;
        ctx.strokeStyle=`rgba(170,224,239,${.035+alpha*.25})`;
        ctx.lineWidth=Math.max(1,z*.035);
        ctx.beginPath();
        ctx.moveTo(bx-tx*len*.68,by-ty*len*.68);
        ctx.quadraticCurveTo(bx+nx*bow*.6,by+ny*bow*.6,bx+tx*len*.68,by+ty*len*.68);
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}
function drawGroundDetails(){
  const b=visibleBounds(3),step=adaptiveStep(b,zoom<4?2:1,18000),z=cameraScale();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),t=terrain[i],s=worldToScreen(x+.5,y+.5),h=hash(x,y,worldSeed+411);
    if((t===T.GRASS||t===T.FOREST)&&zoom>=3&&h>.62){ctx.strokeStyle=h>.92?'#f1d37d':h>.82?'#a4d27a':'#659f56';ctx.lineWidth=Math.max(1,z*.07);ctx.beginPath();ctx.moveTo(s.x-z*.14,s.y+z*.18);ctx.lineTo(s.x-z*.04,s.y-z*.12);ctx.moveTo(s.x,s.y+z*.18);ctx.lineTo(s.x,s.y-z*.24);ctx.moveTo(s.x+z*.13,s.y+z*.16);ctx.lineTo(s.x+z*.04,s.y-z*.10);ctx.stroke()}
    if(food[i]&&h>.36){ctx.fillStyle='rgba(0,0,0,.14)';ctx.beginPath();ctx.ellipse(s.x,s.y+z*.21,z*.40,z*.15,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4f8242';ctx.beginPath();ctx.arc(s.x-z*.16,s.y-z*.02,z*.18,0,Math.PI*2);ctx.arc(s.x+z*.02,s.y-z*.12,z*.20,0,Math.PI*2);ctx.arc(s.x+z*.16,s.y,z*.17,0,Math.PI*2);ctx.arc(s.x-z*.01,s.y-z*.18,z*.17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#78ae60';ctx.beginPath();ctx.arc(s.x-z*.02,s.y-z*.12,z*.09,0,Math.PI*2);ctx.arc(s.x+z*.10,s.y-z*.03,z*.07,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c94948';ctx.beginPath();ctx.arc(s.x-z*.10,s.y+z*.03,z*.05,0,Math.PI*2);ctx.arc(s.x+z*.02,s.y,z*.05,0,Math.PI*2);ctx.arc(s.x+z*.12,s.y+z*.05,z*.04,0,Math.PI*2);ctx.fill()}
    if(rocks[i]>0&&h>.46){ctx.fillStyle='rgba(0,0,0,.14)';ctx.beginPath();ctx.ellipse(s.x,s.y+z*.20,z*.38,z*.14,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#717978';ctx.beginPath();ctx.moveTo(s.x-z*.26,s.y+z*.10);ctx.lineTo(s.x-z*.08,s.y-z*.14);ctx.lineTo(s.x+z*.18,s.y-z*.06);ctx.lineTo(s.x+z*.24,s.y+z*.11);ctx.lineTo(s.x,s.y+z*.17);ctx.fill();ctx.fillStyle='#a7afae';ctx.beginPath();ctx.ellipse(s.x-z*.01,s.y-z*.04,z*.10,z*.06,-.20,0,Math.PI*2);ctx.fill()}
    if(t===T.SAND&&h>.88&&zoom>=3){ctx.fillStyle='rgba(144,118,70,.45)';ctx.fillRect(s.x-z*.08,s.y,z*.12,z*.12)}
    if(iron[i]>0&&h>.56){ctx.fillStyle='#8f6154';ctx.beginPath();ctx.arc(s.x+z*.05,s.y-z*.06,z*.13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b58072';ctx.beginPath();ctx.arc(s.x-z*.02,s.y-z*.10,z*.06,0,Math.PI*2);ctx.fill()}
    if(gold[i]>0&&h>.68){ctx.fillStyle='#d4b14e';ctx.beginPath();ctx.arc(s.x-z*.10,s.y-z*.04,z*.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f2d87a';ctx.beginPath();ctx.arc(s.x-z*.13,s.y-z*.08,z*.05,0,Math.PI*2);ctx.fill()}
  }
}
function tileNeighborTypeCount(x,y,target){
  let n=0;
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
    if(!xx&&!yy)continue;
    const nx=x+xx,ny=y+yy;
    if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
    if(terrain[idx(nx,ny)]===target)n++
  }
  return n
}
function tileEdgeSoftness(x,y){
  const t=terrain[idx(x,y)];
  if(isWaterTile(t))return 0;
  let water=0,total=0;
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
    const nx=x+xx,ny=y+yy;
    if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
    total++;
    const nt=terrain[idx(nx,ny)];
    if(isWaterTile(nt))water++
  }
  return water/Math.max(1,total)
}
function forestDensity(x,y){
  let n=0;
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
    const nx=x+xx,ny=y+yy;
    if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
    const i=idx(nx,ny);
    if(terrain[i]===T.FOREST&&trees[i]>0)n++
  }
  return n/9
}
function treeJitter(x,y){
  return {x:(hash(x,y,1701)-.5)*.70,y:(hash(x,y,1702)-.5)*.48,scale:.82+hash(x,y,1703)*.38}
}
function drawPineTree(x,y){
  const j=treeJitter(x,y),s=worldToScreen(x+.5+j.x,y+.63+j.y),z=clamp(cameraScale(),2.6,13)*j.scale,sway=Math.sin(visualTime*1.25+x*.61+y*.28)*z*.06;
  ctx.fillStyle="rgba(0,0,0,.20)";ctx.beginPath();ctx.ellipse(s.x+z*.12,s.y+z*.86,z*.62,z*.20,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#68482f";ctx.fillRect(s.x-z*.07,s.y-z*.02,z*.14,z*.92);
  const layers=[[-.83,.62],[-.49,.77],[-.10,.92]];
  for(let n=0;n<layers.length;n++){
    const [yy,w]=layers[n];
    ctx.fillStyle=n===0?"#2b633b":n===1?"#28603a":"#347347";
    ctx.beginPath();
    ctx.moveTo(s.x+sway,s.y+z*(yy-.52));
    ctx.lineTo(s.x-z*w+sway,s.y+z*(yy+.45));
    ctx.quadraticCurveTo(s.x,s.y+z*(yy+.25),s.x+z*w+sway,s.y+z*(yy+.45));
    ctx.closePath();ctx.fill()
  }
  ctx.fillStyle="rgba(138,204,135,.42)";ctx.beginPath();ctx.arc(s.x-z*.14+sway,s.y-z*.72,z*.10,0,Math.PI*2);ctx.fill()
}
function drawBroadleafTree(x,y){
  const j=treeJitter(x,y),s=worldToScreen(x+.5+j.x,y+.62+j.y),z=clamp(cameraScale(),2.6,13)*j.scale,sway=Math.sin(visualTime*1.30+x*.58+y*.27)*z*.08,h=hash(x,y,1777);
  ctx.fillStyle="rgba(0,0,0,.20)";ctx.beginPath();ctx.ellipse(s.x+z*.10,s.y+z*.93,z*.78,z*.23,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=h>.5?"#704b30":"#7d5736";ctx.fillRect(s.x-z*.10,s.y-z*.02,z*.20,z*1.02);
  ctx.fillStyle=h>.58?"#347845":"#3d8448";
  ctx.beginPath();
  ctx.arc(s.x-z*.30+sway,s.y-z*.36,z*.43,0,Math.PI*2);
  ctx.arc(s.x+z*.08+sway,s.y-z*.56,z*.51,0,Math.PI*2);
  ctx.arc(s.x+z*.38+sway,s.y-z*.30,z*.38,0,Math.PI*2);
  ctx.arc(s.x+sway,s.y-z*.14,z*.47,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="rgba(158,215,126,.50)";
  ctx.beginPath();ctx.arc(s.x-z*.12+sway,s.y-z*.59,z*.17,0,Math.PI*2);ctx.arc(s.x+z*.23+sway,s.y-z*.42,z*.13,0,Math.PI*2);ctx.fill()
}
function drawForestClump(x,y){
  const j=treeJitter(x,y),s=worldToScreen(x+.5+j.x,y+.64+j.y),z=clamp(cameraScale(),2.0,7.4)*j.scale,h=hash(x,y,worldSeed+770),d=forestDensity(x,y),sway=Math.sin(visualTime*1.20+x*.53+y*.31)*z*.04;
  ctx.fillStyle="rgba(0,0,0,.15)";ctx.beginPath();ctx.ellipse(s.x,s.y+z*.30,z*(.72+.12*d),z*.19,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=h>.62?"#2c6539":"#367443";
  ctx.beginPath();
  ctx.arc(s.x-z*.23+sway,s.y-z*.06,z*(.24+.07*d),0,Math.PI*2);
  ctx.arc(s.x+z*.01+sway,s.y-z*.15,z*(.29+.08*d),0,Math.PI*2);
  ctx.arc(s.x+z*.24+sway,s.y-z*.02,z*(.23+.06*d),0,Math.PI*2);
  ctx.arc(s.x-z*.01+sway,s.y+z*.02,z*(.26+.06*d),0,Math.PI*2);ctx.fill();
  ctx.fillStyle="rgba(146,207,118,.45)";ctx.beginPath();ctx.arc(s.x-z*.07+sway,s.y-z*.18,z*.10,0,Math.PI*2);ctx.fill()
}

function drawTree(x,y){
  if(cameraScale()<5.1){drawForestClump(x,y);return}
  if(hash(x,y,worldSeed+1800)>.52)drawPineTree(x,y);else drawBroadleafTree(x,y)
}
function drawTerrainFeatures(){
  const b=visibleBounds(5),camZ=cameraScale(),step=adaptiveStep(b,camZ<3?2:1,16000);
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),t=terrain[i],gate=hash(x,y,88);
    if(t===T.FOREST&&trees[i]>0){
      const d=forestDensity(x,y);
      if(camZ<5.0){if(gate>.69-d*.13)drawForestClump(x,y)}
      else if(gate>.18)drawTree(x,y)
    }

    // Coastline boulders make the shoreline feel like a miniature landscape.
    const shore=shorelineFactor(x,y);
    if((t===T.SAND||t===T.GRASS)&&shore>.18&&hash(x,y,worldSeed+1888)>.91){
      const j=treeJitter(x,y),s=worldToScreen(x+.5+j.x*.6,y+.55+j.y*.4),z=clamp(camZ,2.5,11);
      ctx.fillStyle="rgba(0,0,0,.18)";ctx.beginPath();ctx.ellipse(s.x+z*.08,s.y+z*.20,z*.34,z*.13,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#777d7c";ctx.beginPath();ctx.moveTo(s.x-z*.30,s.y+z*.12);ctx.lineTo(s.x-z*.12,s.y-z*.25);ctx.lineTo(s.x+z*.18,s.y-z*.16);ctx.lineTo(s.x+z*.31,s.y+z*.12);ctx.closePath();ctx.fill();
      ctx.fillStyle="#afb4b0";ctx.beginPath();ctx.moveTo(s.x-z*.10,s.y-z*.20);ctx.lineTo(s.x+z*.05,s.y-z*.15);ctx.lineTo(s.x+z*.15,s.y-z*.04);ctx.closePath();ctx.fill()
    }

    if((t===T.MOUNTAIN||t===T.SNOW)&&hash(x,y,610)>.44){
      const s=worldToScreen(x+.5+(hash(x,y,611)-.5)*.35,y+.72+(hash(x,y,612)-.5)*.20),z=clamp(camZ,2,11)*.72;
      ctx.fillStyle="rgba(0,0,0,.22)";ctx.beginPath();ctx.ellipse(s.x+z*.22,s.y+z*.86,z*.92,z*.25,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=t===T.SNOW?"#ccd4d6":"#7c8382";ctx.beginPath();ctx.moveTo(s.x-z*.90,s.y+z*.68);ctx.lineTo(s.x-z*.32,s.y-z*.22);ctx.lineTo(s.x,s.y-z*1.20);ctx.lineTo(s.x+z*.40,s.y-z*.18);ctx.lineTo(s.x+z*.90,s.y+z*.68);ctx.fill();
      ctx.fillStyle=t===T.SNOW?"#f2f6f7":"#adb3b1";ctx.beginPath();ctx.moveTo(s.x,s.y-z*1.20);ctx.lineTo(s.x-z*.26,s.y-z*.57);ctx.lineTo(s.x+z*.16,s.y-z*.50);ctx.lineTo(s.x+z*.34,s.y-z*.17);ctx.fill()
    }
  }
}
function drawFarm(b){
  const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12),growth=b.crop/100;
  ctx.fillStyle='rgba(0,0,0,.16)';ctx.beginPath();ctx.ellipse(s.x,s.y+z*.78,z*2.46,z*.88,0,0,Math.PI*2);ctx.fill();
  const soil=ctx.createLinearGradient(s.x,s.y-z*1.4,s.x,s.y+z*1.4);soil.addColorStop(0,'#93673a');soil.addColorStop(1,'#6b4b29');
  ctx.fillStyle=soil;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(s.x-z*2.05,s.y-z*1.10,z*4.1,z*2.32,z*.14);else ctx.rect(s.x-z*2.05,s.y-z*1.10,z*4.1,z*2.32);ctx.fill();
  ctx.strokeStyle='rgba(222,188,122,.60)';ctx.lineWidth=Math.max(1,z*.07);for(let r=-1;r<=1;r++){ctx.beginPath();ctx.moveTo(s.x-z*1.86,s.y+r*z*.56);ctx.lineTo(s.x+z*1.86,s.y+r*z*.56);ctx.stroke()}
  if(growth>.10){ctx.strokeStyle=growth>.78?'#debf63':growth>.45?'#7fb65a':'#5f9748';ctx.lineWidth=Math.max(1,z*.10);for(let r=-1;r<=1;r++)for(let n=-3;n<=3;n++){const xx=s.x+n*z*.48+(r%2)*z*.08,yy=s.y+r*z*.56;ctx.beginPath();ctx.moveTo(xx,yy+z*.12);ctx.lineTo(xx-z*.04,yy-z*(.10+.52*growth));ctx.moveTo(xx,yy+z*.12);ctx.lineTo(xx+z*.04,yy-z*(.12+.56*growth));ctx.stroke()}}
}
function drawV10Building(b){
  const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12);ctx.fillStyle="rgba(0,0,0,.22)";ctx.beginPath();ctx.ellipse(s.x+z*.10,s.y+z*1.05,z*1.55,z*.34,0,0,Math.PI*2);ctx.fill();
  if(b.type==="market"){
    ctx.fillStyle="#8f6843";ctx.fillRect(s.x-z*1.35,s.y-z*.32,z*2.70,z*1.20);ctx.fillStyle="#d8b65f";ctx.beginPath();ctx.moveTo(s.x-z*1.55,s.y-z*.28);ctx.lineTo(s.x,s.y-z*1.25);ctx.lineTo(s.x+z*1.55,s.y-z*.28);ctx.fill();
    for(let n=-1;n<=1;n++){ctx.fillStyle=["#b85e51","#e0c16c","#668d77"][n+1];ctx.fillRect(s.x+n*z*.62-z*.22,s.y+z*.02,z*.44,z*.30)}return
  }
  if(b.type==="shrine"){
    ctx.fillStyle="#78644c";ctx.fillRect(s.x-z*.64,s.y+z*.18,z*1.28,z*.66);ctx.fillStyle="#d7c28c";ctx.beginPath();ctx.moveTo(s.x-z*.82,s.y+z*.18);ctx.lineTo(s.x,s.y-z*.72);ctx.lineTo(s.x+z*.82,s.y+z*.18);ctx.fill();
    ctx.fillStyle="#f1d36f";ctx.beginPath();ctx.arc(s.x,s.y-z*.20,z*.16,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(245,220,130,.18)";ctx.beginPath();ctx.arc(s.x,s.y-z*.16,z*.64,0,Math.PI*2);ctx.fill();return
  }
  if(b.type==="temple"){
    ctx.fillStyle="#b5aa92";ctx.fillRect(s.x-z*1.30,s.y-z*.38,z*2.60,z*1.52);ctx.fillStyle="#dfd0a2";ctx.beginPath();ctx.moveTo(s.x-z*1.55,s.y-z*.36);ctx.lineTo(s.x,s.y-z*1.65);ctx.lineTo(s.x+z*1.55,s.y-z*.36);ctx.fill();
    ctx.fillStyle="#655d53";for(let n=-1;n<=1;n++)ctx.fillRect(s.x+n*z*.58-z*.09,s.y-z*.12,z*.18,z*1.08);ctx.fillStyle="#efd36e";ctx.beginPath();ctx.arc(s.x,s.y-z*.86,z*.14,0,Math.PI*2);ctx.fill();return
  }
}function drawBuilding(b){
  const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12);
  if(b.type==='farm'){drawFarm(b);return}
  if(b.type==='market'||b.type==='shrine'||b.type==='temple'){drawV10Building(b);return}
  if(!b.complete){ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(s.x,s.y+z*1.18,z*1.8,z*.42,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(101,73,45,.78)';ctx.fillRect(s.x-z*1.15,s.y-z*.40,z*2.3,z*1.35);ctx.strokeStyle='#d6b77a';ctx.lineWidth=Math.max(1,z*.12);ctx.strokeRect(s.x-z*1.45,s.y-z*.86,z*2.9,z*2.2);ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(s.x-z*1.18,s.y+z*1.02,z*2.36,z*.20);ctx.fillStyle='#7ccb73';ctx.fillRect(s.x-z*1.18,s.y+z*1.02,z*2.36*(b.progress/100),z*.20);return}
  ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(s.x+z*.12,s.y+z*1.24,z*1.75,z*.44,0,0,Math.PI*2);ctx.fill();
  if(b.type==='firepit'){ctx.fillStyle='#6a5441';for(let n=0;n<6;n++){const a=n/6*Math.PI*2;ctx.beginPath();ctx.arc(s.x+Math.cos(a)*z*.54,s.y+Math.sin(a)*z*.26,z*.20,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#ffd16d';ctx.beginPath();ctx.moveTo(s.x,s.y-z*.94);ctx.lineTo(s.x-z*.42,s.y+z*.20);ctx.lineTo(s.x,s.y+z*.04);ctx.lineTo(s.x+z*.38,s.y+z*.24);ctx.fill();ctx.fillStyle='rgba(255,142,50,.52)';ctx.beginPath();ctx.arc(s.x,s.y-z*.12,z*.56,0,Math.PI*2);ctx.fill();return}
  if(b.type==='mine'){ctx.fillStyle='#5e4939';ctx.beginPath();ctx.ellipse(s.x,s.y+z*.34,z*1.34,z*.76,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#221a17';ctx.beginPath();ctx.ellipse(s.x,s.y+z*.30,z*.82,z*.48,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b68f61';ctx.lineWidth=Math.max(1,z*.14);ctx.beginPath();ctx.moveTo(s.x-z*.92,s.y+z*.72);ctx.lineTo(s.x-z*.92,s.y-z*.70);ctx.lineTo(s.x+z*.92,s.y-z*.70);ctx.lineTo(s.x+z*.92,s.y+z*.72);ctx.stroke();ctx.fillStyle='#f1c86a';ctx.fillRect(s.x-z*.14,s.y-z*.46,z*.28,z*.28);ctx.fillStyle='rgba(255,208,110,.16)';ctx.beginPath();ctx.arc(s.x,s.y+z*.22,z*1.15,0,Math.PI*2);ctx.fill();return}
  if(b.type==='stockpile'){ctx.fillStyle='#835f3d';ctx.fillRect(s.x-z*1.50,s.y-z*.46,z*3.0,z*1.38);ctx.strokeStyle='#caa56d';ctx.lineWidth=Math.max(1,z*.10);for(let n=-1;n<=1;n++){ctx.beginPath();ctx.moveTo(s.x-z*1.36,s.y+n*z*.28);ctx.lineTo(s.x+z*1.36,s.y+n*z*.28);ctx.stroke()}ctx.fillStyle='#7c644c';ctx.fillRect(s.x-z*.92,s.y-z*.18,z*.34,z*.34);ctx.fillStyle='#96a0a4';ctx.fillRect(s.x-z*.22,s.y-z*.06,z*.20,z*.20);ctx.fillStyle='#dcbc61';ctx.fillRect(s.x+z*.28,s.y-z*.02,z*.22,z*.22);return}
  if(b.type==='granary'){ctx.fillStyle='#9a734a';ctx.fillRect(s.x-z*1.22,s.y-z*.86,z*2.44,z*1.86);ctx.fillStyle='#d0aa63';ctx.beginPath();ctx.moveTo(s.x-z*1.54,s.y-z*.80);ctx.lineTo(s.x,s.y-z*1.98);ctx.lineTo(s.x+z*1.54,s.y-z*.80);ctx.fill();ctx.fillStyle='#805938';ctx.fillRect(s.x-z*.26,s.y+z*.14,z*.52,z*.84);ctx.fillStyle='#f2d26f';ctx.fillRect(s.x+z*.46,s.y-z*.06,z*.26,z*.26);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(s.x-z*.90,s.y-z*.56,z*.42,z*.26);return}
  if(b.type==='workshop'){ctx.fillStyle='#74604d';ctx.fillRect(s.x-z*1.46,s.y-z*.60,z*2.92,z*1.78);ctx.fillStyle='#626a65';ctx.beginPath();ctx.moveTo(s.x-z*1.72,s.y-z*.56);ctx.lineTo(s.x,s.y-z*1.58);ctx.lineTo(s.x+z*1.72,s.y-z*.56);ctx.fill();ctx.fillStyle='#d7893b';ctx.fillRect(s.x+z*.64,s.y-z*.14,z*.34,z*.34);ctx.fillStyle='#d6c09a';ctx.fillRect(s.x-z*.94,s.y+z*.08,z*.36,z*.36);return}
  const wall=ctx.createLinearGradient(s.x-z*1.42,s.y,s.x+z*1.42,s.y);wall.addColorStop(0,'#916a44');wall.addColorStop(.55,'#a77b4f');wall.addColorStop(1,'#7b593a');ctx.fillStyle=wall;ctx.fillRect(s.x-z*1.34,s.y-z*.44,z*2.68,z*1.88);ctx.fillStyle='#d0a85c';ctx.beginPath();ctx.moveTo(s.x-z*1.72,s.y-z*.40);ctx.lineTo(s.x,s.y-z*1.80);ctx.lineTo(s.x+z*1.72,s.y-z*.40);ctx.fill();ctx.fillStyle='rgba(0,0,0,.12)';ctx.beginPath();ctx.moveTo(s.x,s.y-z*1.80);ctx.lineTo(s.x+z*1.72,s.y-z*.40);ctx.lineTo(s.x+z*1.28,s.y-z*.40);ctx.lineTo(s.x,s.y-z*1.44);ctx.fill();ctx.fillStyle='#5d3e2d';ctx.fillRect(s.x-z*.26,s.y+z*.40,z*.52,z*.98);ctx.fillStyle='#efd477';ctx.fillRect(s.x+z*.62,s.y-z*.02,z*.34,z*.34);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(s.x-z*.94,s.y-z*.10,z*.38,z*.28);b.smoke+=.03;ctx.fillStyle='rgba(220,224,219,.22)';for(let n=0;n<2;n++){ctx.beginPath();ctx.arc(s.x+z*1.02+Math.sin(b.smoke+n)*z*.18,s.y-z*1.66-n*z*.64,z*(.22+n*.10),0,Math.PI*2);ctx.fill()}
}
function drawPerson(p){
  if(!p.alive)return;
  const s=worldToScreen(p.px,p.py),base=clamp(cameraScale(),3,14),child=p.age<14,z=base*(child?.70:1),bob=Math.sin(p.phase)*z*.07;
  const skins=["#f1c494","#dca372","#be7e56","#7d4d36"],tunics=["#5d819d","#828a53","#83654c","#75649a","#4f816d","#a06f5d"],hairs=["#251d1a","#5c3f2b","#1b1a19","#8a6739","#6a2f29"];
  ctx.fillStyle="rgba(0,0,0,.18)";ctx.beginPath();ctx.ellipse(s.x+z*.08,s.y+z*1.06,z*.57,z*.17,0,0,Math.PI*2);ctx.fill();

  ctx.strokeStyle=skins[p.skin];ctx.lineWidth=Math.max(1,z*.075);
  ctx.beginPath();
  ctx.moveTo(s.x-z*.13,s.y+z*.67+bob);ctx.lineTo(s.x-z*.16,s.y+z*1.05+bob);
  ctx.moveTo(s.x+z*.13,s.y+z*.67+bob);ctx.lineTo(s.x+z*.16,s.y+z*1.05+bob);
  ctx.stroke();

  const body=ctx.createLinearGradient(s.x,s.y-z*.12,s.x,s.y+z*.82);body.addColorStop(0,tunics[p.shirt]);body.addColorStop(1,"rgba(30,25,25,.20)");
  ctx.fillStyle=body;ctx.beginPath();
  ctx.moveTo(s.x-z*.31,s.y-z*.02+bob);ctx.quadraticCurveTo(s.x,s.y-z*.15+bob,s.x+z*.31,s.y-z*.02+bob);
  ctx.lineTo(s.x+z*.22,s.y+z*.72+bob);ctx.lineTo(s.x-z*.22,s.y+z*.72+bob);ctx.closePath();ctx.fill();

  ctx.strokeStyle=skins[p.skin];ctx.lineWidth=Math.max(1,z*.065);ctx.beginPath();
  ctx.moveTo(s.x-z*.29,s.y+z*.12+bob);ctx.lineTo(s.x-z*.51,s.y+z*.30+bob);
  ctx.moveTo(s.x+z*.29,s.y+z*.12+bob);ctx.lineTo(s.x+z*.51,s.y+z*.30+bob);ctx.stroke();

  ctx.fillStyle=skins[p.skin];ctx.beginPath();ctx.arc(s.x,s.y-z*.47+bob,z*.27,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=hairs[p.hair];ctx.beginPath();ctx.arc(s.x,s.y-z*.55+bob,z*.30,Math.PI,Math.PI*2);ctx.fill();
  if(base>6){
    ctx.fillStyle="#28211f";ctx.beginPath();ctx.arc(s.x-z*.07,s.y-z*.47+bob,z*.022,0,Math.PI*2);ctx.arc(s.x+z*.07,s.y-z*.47+bob,z*.022,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(110,68,49,.45)";ctx.lineWidth=Math.max(1,z*.025);ctx.beginPath();ctx.moveTo(s.x-z*.05,s.y-z*.38+bob);ctx.quadraticCurveTo(s.x,s.y-z*.35+bob,s.x+z*.05,s.y-z*.38+bob);ctx.stroke()
  }
  if(p.carryAmount>0){
    ctx.fillStyle=p.carryType==="food"?"#c84e45":p.carryType==="wood"?"#8d5e39":p.carryType==="gold"?"#dfc35c":"#969fa2";
    ctx.beginPath();ctx.ellipse(s.x+p.dir*z*.57,s.y+z*.21,z*.15,z*.12,0,0,Math.PI*2);ctx.fill()
  }
  if(p.id===selected){ctx.strokeStyle="#f7ffed";ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,z*1.42,0,Math.PI*2);ctx.stroke()}
  if(settings.labels&&zoom>=7.5&&!child){
    ctx.font=`700 ${Math.round(base*.95)}px -apple-system,system-ui`;ctx.textAlign="center";
    ctx.strokeStyle="rgba(0,0,0,.52)";ctx.lineWidth=Math.max(2,base*.22);ctx.strokeText(p.name,s.x,s.y-z*1.50);
    ctx.fillStyle="#fff";ctx.fillText(p.name,s.x,s.y-z*1.50)
  }
}
function drawUndergroundResources(){
  const b=visibleBounds(3),step=adaptiveStep(b,zoom<3?3:zoom<5?2:1,17000),z=cameraScale();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),s=worldToScreen(x+.5,y+.5),h=hash(x,y,worldSeed+1500);
    if(underground[i]===U.MAGMA){ctx.fillStyle=`rgba(255,126,35,${.28+.18*Math.sin(tick*.07+x*.5)})`;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(2,z*.46),0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,192,81,.12)";ctx.beginPath();ctx.arc(s.x,s.y,z*1.05,0,Math.PI*2);ctx.fill()}
    if(underground[i]===U.WATER&&h>.50){ctx.strokeStyle="rgba(120,190,205,.42)";ctx.lineWidth=Math.max(1,z*.08);ctx.beginPath();ctx.moveTo(s.x-z*.42,s.y);ctx.lineTo(s.x+z*.42,s.y);ctx.stroke()}
    if(uCoal[i]){ctx.fillStyle="#222225";ctx.beginPath();ctx.arc(s.x-z*.18,s.y+z*.08,z*.24,0,Math.PI*2);ctx.fill()}
    if(uIron[i]){ctx.fillStyle="#a55e43";ctx.beginPath();ctx.arc(s.x+z*.10,s.y-z*.10,z*.28,0,Math.PI*2);ctx.arc(s.x-z*.20,s.y+z*.12,z*.18,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d38c69";ctx.fillRect(s.x+z*.02,s.y-z*.17,z*.12,z*.09)}
    if(uGold[i]){ctx.fillStyle="#e4bf49";ctx.beginPath();ctx.arc(s.x-z*.12,s.y-z*.08,z*.23,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff0a8";ctx.fillRect(s.x-z*.18,s.y-z*.14,z*.09,z*.07)}
    if(uCrystal[i]){ctx.fillStyle="rgba(108,220,239,.92)";ctx.beginPath();ctx.moveTo(s.x,s.y-z*.48);ctx.lineTo(s.x-z*.25,s.y+z*.22);ctx.lineTo(s.x,s.y+z*.45);ctx.lineTo(s.x+z*.25,s.y+z*.22);ctx.fill();ctx.fillStyle="rgba(188,248,255,.22)";ctx.beginPath();ctx.arc(s.x,s.y,z*.72,0,Math.PI*2);ctx.fill()}
    if(uGlow[i]){ctx.fillStyle=`rgba(255,204,112,${uGlow[i]/900})`;ctx.beginPath();ctx.arc(s.x,s.y,z*1.2,0,Math.PI*2);ctx.fill()}
  }
}
function drawMineShaftUnderground(b){
  const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12);
  ctx.fillStyle="rgba(0,0,0,.60)";ctx.beginPath();ctx.ellipse(s.x,s.y,z*1.15,z*.72,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#af8655";ctx.lineWidth=Math.max(1,z*.13);ctx.beginPath();ctx.arc(s.x,s.y,z*.82,Math.PI,Math.PI*2);ctx.stroke();
  ctx.fillStyle="#e4b85e";ctx.beginPath();ctx.arc(s.x,s.y-z*.25,z*.16,0,Math.PI*2);ctx.fill()
}
function drawMiniMap(force=false){
  const now=visualTime*1000,interval=settings.autoPerformance?(perfState.detail>1.65?260:perfState.detail>1.2?190:135):100;
  if(!force&&now-lastMiniMapRefreshMs<interval)return;
  lastMiniMapRefreshMs=now;
  if(dirty)rebuildTerrain();if(undergroundDirty)rebuildUnderground();const w=miniMap.width,h=miniMap.height;mmctx.clearRect(0,0,w,h);
  if(activeLayer==="surface")mmctx.drawImage(terrainCanvas,0,0,terrainCanvas.width,terrainCanvas.height,0,0,w,h);else mmctx.drawImage(undergroundCanvas,0,0,undergroundCanvas.width,undergroundCanvas.height,0,0,w,h);
  const sx=w/WORLD_W,sy=h/WORLD_H;
  if(activeLayer==="surface"){
    if(atlasMode!=="political")for(const s of settlements){
      const x=s.x*sx,y=s.y*sy,rad=Math.max(4,settlementRadius(s)*Math.min(sx,sy));let fill="rgba(255,255,255,.06)";
      if(atlasMode==="culture")fill=cultureColor(settlementCulture(s),.30);else if(atlasMode==="faith")fill=s.religionId?religionColor(settlementReligion(s),.30):"rgba(130,130,135,.18)";
      else if(atlasMode==="economy"){const v=clamp(ensureMarket(s).avgWealth/25,0,1);fill=`rgba(${Math.round(200-110*v)},${Math.round(120+105*v)},${Math.round(75+70*v)},.28)`}
      mmctx.fillStyle=fill;mmctx.beginPath();mmctx.arc(x,y,rad,0,Math.PI*2);mmctx.fill()
    }
    for(const r of tradeRoutes){const a=settlementById(r.aId),b=settlementById(r.bId);if(!a||!b)continue;mmctx.strokeStyle=atlasMode==="economy"?"rgba(255,222,116,.85)":"rgba(245,210,124,.45)";mmctx.lineWidth=atlasMode==="economy"?1.6:1;mmctx.beginPath();mmctx.moveTo(a.x*sx,a.y*sy);mmctx.lineTo(b.x*sx,b.y*sy);mmctx.stroke()}
    for(const s of settlements){let col=polityColor(s,1);if(atlasMode==="culture")col=cultureColor(settlementCulture(s),1);else if(atlasMode==="faith")col=s.religionId?religionColor(settlementReligion(s),1):"#8d9597";else if(atlasMode==="economy")col=ensureMarket(s).stage==="Coinage"?"#f1ce65":"#d39a63";mmctx.fillStyle=col;mmctx.beginPath();mmctx.arc(s.x*sx,s.y*sy,3,0,Math.PI*2);mmctx.fill();mmctx.strokeStyle="rgba(255,255,255,.80)";mmctx.lineWidth=1;mmctx.stroke()}
  }
  for(const b of buildings){if(!b.complete)continue;mmctx.fillStyle=b.type==="temple"?"#f5d36a":b.type==="market"?"#f0a86b":b.type==="mine"?"#f3ca6d":"#f3f1dd";mmctx.fillRect(b.x*sx-1,b.y*sy-1,3,3)}
  for(const p of people){if(!p.alive)continue;if(activeLayer==="surface"&&p.layer==="underground")continue;if(activeLayer==="underground"&&p.layer!=="underground")continue;mmctx.fillStyle=p.layer==="underground"?"#e8c28a":"#ffffff";mmctx.fillRect(p.x*sx,p.y*sy,2,2)}
  const v=viewportWorldSize(),left=(camX-v.w/2)*sx,top=(camY-v.h/2)*sy,vw=v.w*sx,vh=v.h*sy;mmctx.strokeStyle=activeLayer==="surface"?"#b5ff9f":"#ffd08c";mmctx.lineWidth=2;mmctx.strokeRect(left,top,vw,vh);mmctx.fillStyle=activeLayer==="surface"?"rgba(181,255,159,.08)":"rgba(255,208,140,.10)";mmctx.fillRect(left,top,vw,vh)
}
function drawSurfaceAtmosphere(){
  const sky=ctx.createLinearGradient(0,0,0,canvas.height*.55);
  sky.addColorStop(0,"rgba(203,236,255,.065)");sky.addColorStop(.62,"rgba(255,255,255,0)");
  ctx.fillStyle=sky;ctx.fillRect(0,0,canvas.width,canvas.height)
}
function drawVignette(){
  const g=ctx.createRadialGradient(canvas.width*.5,canvas.height*.42,canvas.width*.15,canvas.width*.5,canvas.height*.48,canvas.width*.78);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(4,8,10,.18)");
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height)
}
function renderUnderground(){
  if(undergroundDirty)rebuildUnderground();ensureWorldIndex();clampCamera();ctx.fillStyle="#171312";ctx.fillRect(0,0,canvas.width,canvas.height);
  const s=cameraScale(),v=viewportWorldSize(),viewLeft=camX-v.w/2,viewTop=camY-v.h/2,wl=Math.max(0,viewLeft),wt=Math.max(0,viewTop),wr=Math.min(WORLD_W,viewLeft+v.w),wb=Math.min(WORLD_H,viewTop+v.h);
  if(wr>wl&&wb>wt){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(undergroundCanvas,wl*TEX,wt*TEX,(wr-wl)*TEX,(wb-wt)*TEX,(wl-viewLeft)*s,(wt-viewTop)*s,(wr-wl)*s,(wb-wt)*s)}
  drawUndergroundResources();drawUndergroundEntities();if(settings.effects)drawParticles();
  const topGlow=ctx.createLinearGradient(0,0,0,canvas.height*.28);topGlow.addColorStop(0,"rgba(255,190,88,.08)");topGlow.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=topGlow;ctx.fillRect(0,0,canvas.width,canvas.height);drawVignette();drawMiniMap()
}
function polityColor(s,alpha=1){
  const k=settlementKingdom(s),index=k?k.colorIndex:s.colorIndex;
  const hex=polityColors[index%polityColors.length];
  if(alpha>=1)return hex;
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${alpha})`
}
function drawPoliticalLayer(){
  if(activeLayer!=="surface"||settlements.length<2)return;ensureWorldIndex();
  const bounds=visibleBounds(36),z=cameraScale();ctx.save();
  for(const r of tradeRoutes){
    const a=settlementById(r.aId),b=settlementById(r.bId);if(!a||!b)continue;
    if(!inVisibleBounds(a.x,a.y,bounds,40)&&!inVisibleBounds(b.x,b.y,bounds,40))continue;
    const A=worldToScreen(a.x,a.y),B=worldToScreen(b.x,b.y);ctx.strokeStyle="rgba(244,211,128,.28)";ctx.lineWidth=Math.max(1,Math.min(3,z*.08));ctx.setLineDash([6,7]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.quadraticCurveTo((A.x+B.x)/2,(A.y+B.y)/2-12,B.x,B.y);ctx.stroke()
  }
  ctx.setLineDash([]);
  for(const s of settlements){
    const radius=settlementRadius(s);if(!inVisibleBounds(s.x,s.y,bounds,radius+6))continue;
    const P=worldToScreen(s.x,s.y),rad=radius*z;
    if(rad<canvas.width*1.2){ctx.fillStyle=polityColor(s,.028);ctx.strokeStyle=polityColor(s,.25);ctx.lineWidth=Math.max(1,z*.08);ctx.beginPath();ctx.arc(P.x,P.y,rad,0,Math.PI*2);ctx.fill();ctx.stroke()}
    const pop=settlementPopulation(s);ctx.fillStyle="rgba(8,17,20,.80)";ctx.beginPath();if(ctx.roundRect)ctx.roundRect(P.x-z*1.1,P.y-z*2.9,z*2.2,z*.95,z*.25);else ctx.rect(P.x-z*1.1,P.y-z*2.9,z*2.2,z*.95);ctx.fill();ctx.fillStyle=polityColor(s,1);ctx.fillRect(P.x-z*.88,P.y-z*2.68,z*.28,z*.40);
    if(zoom>=3.7){ctx.fillStyle="#f5f8f7";ctx.textAlign="left";ctx.font=`700 ${Math.max(7,Math.round(z*.55))}px -apple-system,system-ui`;ctx.fillText(`${s.name} · ${pop}`,P.x-z*.46,P.y-z*2.35)}
  }
  for(const w of wars){
    if(w.status!=="active")continue;const a=settlementById(w.aId),b=settlementById(w.bId);if(!a||!b)continue;
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2;if(!inVisibleBounds(x,y,bounds,5))continue;const P=worldToScreen(x,y);
    ctx.fillStyle="rgba(30,20,18,.84)";ctx.beginPath();ctx.arc(P.x,P.y,z*.85,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f1d3b5";ctx.textAlign="center";ctx.font=`${Math.max(9,z*.75)}px system-ui`;ctx.fillText("⚔",P.x,P.y+z*.25)
  }
  ctx.restore()
}
function drawCritter(c){
  const s=worldToScreen(c.px,c.py),base=clamp(cameraScale(),2.8,12),z=base*.88,bob=Math.sin(c.phase*1.15)*z*.045,dir=c.dir||1;
  ctx.fillStyle="rgba(0,0,0,.16)";ctx.beginPath();ctx.ellipse(s.x+z*.05,s.y+z*.48,z*.58,z*.14,0,0,Math.PI*2);ctx.fill();

  if(c.type==="sheep"){
    ctx.fillStyle="#eee9df";ctx.beginPath();
    ctx.arc(s.x-z*.18,s.y-z*.02+bob,z*.18,0,Math.PI*2);ctx.arc(s.x,s.y-z*.10+bob,z*.21,0,Math.PI*2);ctx.arc(s.x+z*.18,s.y+bob,z*.18,0,Math.PI*2);ctx.arc(s.x,s.y+z*.05+bob,z*.22,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#565149";ctx.beginPath();ctx.ellipse(s.x+dir*z*.36,s.y-z*.07+bob,z*.15,z*.11,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#665f57";ctx.lineWidth=Math.max(1,z*.06);for(const lx of[-.16,.04,.18]){ctx.beginPath();ctx.moveTo(s.x+lx*z,s.y+z*.10+bob);ctx.lineTo(s.x+lx*z,s.y+z*.43+bob);ctx.stroke()}
    return
  }

  if(c.type==="wolf"){
    ctx.fillStyle="#687176";ctx.beginPath();ctx.ellipse(s.x,s.y+bob,z*.39,z*.19,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#50595e";ctx.beginPath();ctx.ellipse(s.x+dir*z*.37,s.y-z*.09+bob,z*.16,z*.10,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(s.x+dir*z*.31,s.y-z*.14+bob);ctx.lineTo(s.x+dir*z*.39,s.y-z*.28+bob);ctx.lineTo(s.x+dir*z*.47,s.y-z*.12+bob);ctx.fill();
    ctx.strokeStyle="#50575b";ctx.lineWidth=Math.max(1,z*.06);for(const lx of[-.17,.02,.17]){ctx.beginPath();ctx.moveTo(s.x+lx*z,s.y+z*.08+bob);ctx.lineTo(s.x+lx*z,s.y+z*.40+bob);ctx.stroke()}
    ctx.beginPath();ctx.moveTo(s.x-dir*z*.37,s.y-z*.02+bob);ctx.lineTo(s.x-dir*z*(.55+.08*Math.sin(c.phase)),s.y-z*.13+bob);ctx.stroke();return
  }

  // deer
  ctx.fillStyle="#a36b3e";ctx.beginPath();ctx.ellipse(s.x,s.y+bob,z*.39,z*.18,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#8d5933";ctx.beginPath();ctx.ellipse(s.x+dir*z*.34,s.y-z*.12+bob,z*.14,z*.10,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#76492e";ctx.lineWidth=Math.max(1,z*.055);
  for(const lx of[-.16,.04,.18]){ctx.beginPath();ctx.moveTo(s.x+lx*z,s.y+z*.06+bob);ctx.lineTo(s.x+lx*z,s.y+z*.40+bob);ctx.stroke()}
  ctx.beginPath();ctx.moveTo(s.x+dir*z*.25,s.y-z*.10+bob);ctx.lineTo(s.x+dir*z*.10,s.y-z*.24+bob);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s.x+dir*z*.32,s.y-z*.18+bob);ctx.lineTo(s.x+dir*z*.39,s.y-z*.34+bob);ctx.moveTo(s.x+dir*z*.39,s.y-z*.30+bob);ctx.lineTo(s.x+dir*z*.47,s.y-z*.39+bob);ctx.stroke()
}
function drawHazards(){
  const b=visibleBounds(3),z=cameraScale(),t=visualTime,step=adaptiveStep(b,1,21000);
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y),burnAmt=burn[i],tile=terrain[i];
      if(tile===T.LAVA){
        if(hash(x,y,worldSeed+505)<.60)continue;
        const jx=(hash(x,y,506)-.5)*.60,jy=(hash(x,y,507)-.5)*.44,s=worldToScreen(x+.5+jx,y+.5+jy);
        const pulse=.5+.5*Math.sin(t*3.0+x*.7+y*.4);
        ctx.fillStyle=`rgba(232,77,26,${.25+.18*pulse})`;
        ctx.beginPath();ctx.ellipse(s.x,s.y,z*(.30+.10*pulse),z*(.16+.06*pulse),0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(255,189,69,${.28+.20*pulse})`;
        ctx.beginPath();ctx.ellipse(s.x-z*.04,s.y-z*.03,z*.12,z*.07,0,0,Math.PI*2);ctx.fill();
        continue
      }
      if(burnAmt<70)continue;
      // Only a subset of burning cells gets a visible flame, and each one is
      // offset from the tile center so a fire reads as an irregular blaze.
      const gate=hash(x,y,worldSeed+620);
      if(gate<.70)continue;
      const strength=burnAmt/255,jx=(hash(x,y,621)-.5)*.76,jy=(hash(x,y,622)-.5)*.60;
      const s=worldToScreen(x+.5+jx,y+.55+jy),flick=.72+.28*Math.sin(t*8.0+x*1.3+y*.8+gate*8),size=z*(.24+.32*strength)*flick;

      ctx.fillStyle='rgba(0,0,0,.13)';ctx.beginPath();ctx.ellipse(s.x,s.y+size*.72,size*.58,size*.18,0,0,Math.PI*2);ctx.fill();

      ctx.fillStyle=`rgba(222,66,26,${.58+.20*strength})`;
      ctx.beginPath();
      ctx.moveTo(s.x,s.y-size*1.25);
      ctx.bezierCurveTo(s.x-size*.66,s.y-size*.35,s.x-size*.46,s.y+size*.55,s.x,s.y+size*.65);
      ctx.bezierCurveTo(s.x+size*.52,s.y+size*.48,s.x+size*.62,s.y-size*.28,s.x,s.y-size*1.25);
      ctx.fill();

      ctx.fillStyle=`rgba(255,153,48,${.70+.20*strength})`;
      ctx.beginPath();
      ctx.moveTo(s.x+size*.02,s.y-size*.78);
      ctx.bezierCurveTo(s.x-size*.34,s.y-size*.18,s.x-size*.24,s.y+size*.37,s.x,s.y+size*.44);
      ctx.bezierCurveTo(s.x+size*.30,s.y+size*.30,s.x+size*.32,s.y-size*.12,s.x+size*.02,s.y-size*.78);
      ctx.fill();

      ctx.fillStyle='rgba(255,224,120,.90)';ctx.beginPath();ctx.ellipse(s.x,s.y+size*.08,size*.12,size*.20,0,0,Math.PI*2);ctx.fill();

      if(hash(x,y,623)>.82){
        ctx.fillStyle='rgba(255,190,71,.75)';
        const ex=s.x+Math.sin(t*5+x)*size*.65,ey=s.y-size*(1.0+((t*.8+gate)%1));
        ctx.beginPath();ctx.arc(ex,ey,Math.max(1,size*.06),0,Math.PI*2);ctx.fill()
      }
    }
  }
}

function drawParticles(){
  for(const p of particles){
    const s=worldToScreen(p.x,p.y),z=Math.max(1.5,cameraScale()*.20),life=clamp(p.life/30,0,1);
    if(p.type==="spark"){
      ctx.strokeStyle=`rgba(255,239,155,${.35+.60*life})`;ctx.lineWidth=Math.max(1,z*.34);
      ctx.beginPath();ctx.moveTo(s.x-z*.7,s.y+z*.6);ctx.lineTo(s.x+z*.5,s.y-z*.7);ctx.stroke();
      ctx.fillStyle=`rgba(255,255,224,${.45+.50*life})`;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(1,z*.26),0,Math.PI*2);ctx.fill();continue
    }
    if(p.type==="fire"){
      ctx.fillStyle=`rgba(255,118,38,${.30+.55*life})`;ctx.beginPath();ctx.ellipse(s.x,s.y,z*.45,z*.72,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,217,101,${.35+.50*life})`;ctx.beginPath();ctx.ellipse(s.x,s.y+z*.10,z*.18,z*.31,0,0,Math.PI*2);ctx.fill();continue
    }
    const col=p.type==="heal"?"183,246,210":p.type==="grain"?"216,189,88":p.type==="stone"?"174,179,174":p.type==="dust"?"177,139,91":"105,169,91";
    ctx.fillStyle=`rgba(${col},${.25+.65*life})`;ctx.beginPath();ctx.arc(s.x,s.y,z*.38,0,Math.PI*2);ctx.fill()
  }
}
function drawTransientEffects(){
  if(!visualEffects.length)return;
  const now=visualTime;
  visualEffects=visualEffects.filter(e=>now-e.start<e.duration);
  let flash=0;

  for(const e of visualEffects){
    const age=now-e.start,p=clamp(age/e.duration,0,1),s=worldToScreen(e.x,e.y),z=cameraScale();
    if(e.type==="lightning"){
      const alpha=1-p,segments=8,topY=Math.max(-canvas.height*.08,s.y-canvas.height*.58);
      const stepY=(s.y-topY)/segments;
      const pts=[];
      for(let n=0;n<=segments;n++){
        const yy=topY+n*stepY;
        const envelope=Math.sin((n/segments)*Math.PI);
        const xx=lerp(s.x+Math.sin(e.seed)*z*2.2,s.x,n/segments)+Math.sin(e.seed+n*12.73+Math.floor(age*36))*z*(.75+1.1*envelope);
        pts.push([xx,yy])
      }

      ctx.save();
      ctx.shadowColor='rgba(112,196,255,.95)';ctx.shadowBlur=Math.max(8,z*1.5);
      ctx.strokeStyle=`rgba(135,211,255,${.30+.45*alpha})`;ctx.lineWidth=Math.max(3,z*.38);
      ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let n=1;n<pts.length;n++)ctx.lineTo(pts[n][0],pts[n][1]);ctx.stroke();
      ctx.shadowBlur=Math.max(4,z*.6);ctx.strokeStyle=`rgba(255,255,245,${.55+.45*alpha})`;ctx.lineWidth=Math.max(1.4,z*.14);
      ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let n=1;n<pts.length;n++)ctx.lineTo(pts[n][0],pts[n][1]);ctx.stroke();

      // Two small branches, not a field of symbols.
      for(let branch=0;branch<2;branch++){
        const n=3+branch*2,[bx,by]=pts[n],side=branch?1:-1;
        ctx.strokeStyle=`rgba(205,236,255,${.30+.35*alpha})`;ctx.lineWidth=Math.max(1,z*.07);
        ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+side*z*(1.2+branch*.4),by+z*.65);ctx.lineTo(bx+side*z*(1.9+branch*.5),by+z*1.35);ctx.stroke()
      }
      ctx.restore();

      ctx.fillStyle=`rgba(255,239,153,${.24+.50*alpha})`;ctx.beginPath();ctx.arc(s.x,s.y,z*(.34+.22*alpha),0,Math.PI*2);ctx.fill();
      flash=Math.max(flash,.18*alpha)
    }else if(e.type==="fireBurst"){
      const a=(1-p),r=z*e.r*(.25+.75*p);
      ctx.strokeStyle=`rgba(255,145,45,${.30*a})`;ctx.lineWidth=Math.max(1,z*.08);
      ctx.beginPath();ctx.arc(s.x,s.y,r*.55,0,Math.PI*2);ctx.stroke();
      for(let n=0;n<8;n++){
        const ang=n/8*Math.PI*2+e.seed,rr=r*(.30+.65*p),ex=s.x+Math.cos(ang)*rr,ey=s.y+Math.sin(ang)*rr*.48-r*.15*p;
        ctx.fillStyle=`rgba(255,${120+n*8},45,${.50*a})`;ctx.beginPath();ctx.arc(ex,ey,Math.max(1,z*.08*(1-p*.35)),0,Math.PI*2);ctx.fill()
      }
    }
  }

  if(flash>0){ctx.fillStyle=`rgba(219,241,255,${flash})`;ctx.fillRect(0,0,canvas.width,canvas.height)}
}
function drawClouds(){if(!settings.effects)return;for(const c of clouds){const s=worldToScreen(c.x,c.y),z=Math.max(10,c.r*cameraScale()*.45);ctx.fillStyle="rgba(198,209,210,.42)";for(let n=0;n<5;n++){ctx.beginPath();ctx.arc(s.x+(n-2)*z*.46,s.y+Math.sin(c.phase+n)*z*.13,z*(.52+(n%2)*.12),0,Math.PI*2);ctx.fill()}ctx.strokeStyle="rgba(176,214,232,.40)";ctx.lineWidth=Math.max(1,cameraScale()*.09);for(let n=0;n<12;n++){const rx=s.x-z*1.3+(n/11)*z*2.6;ctx.beginPath();ctx.moveTo(rx,s.y+z*.3);ctx.lineTo(rx-z*.10,s.y+z*.9);ctx.stroke()}}}
function drawLighting(){
  if(!settings.dayNight)return;const cycle=(tick%2600)/2600;let a=0;if(cycle<.18)a=.26*(1-cycle/.18);else if(cycle>.78)a=.30*((cycle-.78)/.22);
  if(a){const grad=ctx.createLinearGradient(0,0,0,canvas.height);grad.addColorStop(0,`rgba(18,35,66,${a*.9})`);grad.addColorStop(1,`rgba(5,12,20,${a})`);ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height)}
}
function inVisibleBounds(x,y,b,pad=3){return x>=b.l-pad&&x<=b.r+pad&&y>=b.t-pad&&y<=b.b+pad}
function drawSurfaceEntities(){
  const b=visibleBounds(5),z=cameraScale();
  for(const building of getSortedBuildings())if(inVisibleBounds(building.x,building.y,b,5))drawBuilding(building);
  const visibleCritters=[];for(const c of critters)if(c.alive&&inVisibleBounds(c.px,c.py,b,4))visibleCritters.push(c);
  if(z>3.4)visibleCritters.sort((a,b)=>a.py-b.py);
  for(const c of visibleCritters)drawCritter(c);
  const visiblePeople=[];for(const p of alivePeople())if(p.layer!=="underground"&&inVisibleBounds(p.px,p.py,b,4))visiblePeople.push(p);
  if(z>3.4)visiblePeople.sort((a,b)=>a.py-b.py);
  for(const p of visiblePeople)drawPerson(p)
}
function drawUndergroundEntities(){
  const b=visibleBounds(5),z=cameraScale();
  for(const mine of buildingsOf("mine"))if(inVisibleBounds(mine.x,mine.y,b,5))drawMineShaftUnderground(mine);
  const visiblePeople=[];for(const p of alivePeople())if(p.layer==="underground"&&inVisibleBounds(p.px,p.py,b,4))visiblePeople.push(p);
  if(z>3.4)visiblePeople.sort((a,b)=>a.py-b.py);
  for(const p of visiblePeople)drawPerson(p)
}
function render(){
  if(activeLayer==="underground"){renderUnderground();return}
  if(dirty)rebuildTerrain();ensureWorldIndex();clampCamera();ctx.fillStyle="#1c4f6f";ctx.fillRect(0,0,canvas.width,canvas.height);
  const s=cameraScale(),v=viewportWorldSize(),viewLeft=camX-v.w/2,viewTop=camY-v.h/2,wl=Math.max(0,viewLeft),wt=Math.max(0,viewTop),wr=Math.min(WORLD_W,viewLeft+v.w),wb=Math.min(WORLD_H,viewTop+v.h);
  if(wr>wl&&wb>wt){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(terrainCanvas,wl*TEX,wt*TEX,(wr-wl)*TEX,(wb-wt)*TEX,(wl-viewLeft)*s,(wt-viewTop)*s,(wr-wl)*s,(wb-wt)*s)}
  drawOrganicLandOverlay();drawCoastalBlend();drawSurfaceAtmosphere();drawWater();if(settings.trails)drawTrails();drawPoliticalLayer();drawGroundDetails();drawHazards();drawTerrainFeatures();drawSurfaceEntities();
  if(settings.effects){drawParticles();drawTransientEffects()}drawClouds();drawLighting();drawVignette();drawMiniMap()
}
function eraName(){const pop=people.filter(p=>p.alive).length;if(pop>=18)return"Village";if(pop>=10)return"Hamlet";if(pop>=5)return"Growing Camp";if(buildingsOf("hut").length)return"Early Settlement";return"Primitive"}
function jobCounts(){const c={};for(const p of people.filter(p=>p.alive)){c[p.job]=(c[p.job]||0)+1}return c}
function renderCivilization(){if(!settlement)return;const counts=jobCounts(),complete=buildings.filter(b=>b.complete),pending=buildings.filter(b=>!b.complete);settlementNameEl.textContent=settlement.name;settlementEraEl.textContent=`${eraName()} · Day ${Math.floor(day)}`;civBody.innerHTML=`<div class="sectionTitle">Stockpile</div><div class="resourceGrid"><div class="resourceCard">🍎 Food<b>${Math.floor(settlement.food)}</b></div><div class="resourceCard">🪵 Wood<b>${Math.floor(settlement.wood)}</b></div><div class="resourceCard">🪨 Stone<b>${Math.floor(settlement.stone)}</b></div><div class="resourceCard">⛓ Iron<b>${Math.floor(settlement.iron||0)}</b></div><div class="resourceCard">🟡 Gold<b>${Math.floor(settlement.gold||0)}</b></div><div class="resourceCard">⬛ Coal<b>${Math.floor(settlement.coal||0)}</b></div></div><div class="sectionTitle">Settlement</div><div class="civRows"><div class="civRow"><span>Population</span><span>${people.filter(p=>p.alive).length} / ${homeCapacity()}</span></div><div class="civRow"><span>Buildings</span><span>${complete.length}${pending.length?` + ${pending.length} building`:''}</span></div><div class="civRow"><span>Births / deaths</span><span>${settlement.births} / ${settlement.deaths}</span></div></div><div class="sectionTitle">Jobs</div><div class="civRows">${Object.entries(counts).map(([k,v])=>`<div class="civRow"><span>${escapeHtml(k)}</span><span>${v}</span></div>`).join('')}</div><div class="sectionTitle">Discoveries</div><div class="techList">${techNames.map(t=>`<span class="tech ${hasTech(t)?'':'locked'}">${hasTech(t)?'✓ ':''}${t}</span>`).join('')}</div><div class="sectionTitle">Buildings</div><div class="civRows">${["firepit","hut","stockpile","farm","mine","granary","workshop"].map(t=>`<div class="civRow"><span>${t[0].toUpperCase()+t.slice(1)}</span><span>${buildingsOf(t).length}</span></div>`).join('')}</div>`}
function showCitizen(p){
  selected=p.id;
  citizenName.textContent=p.name;
  citizenSub.textContent=`${Math.floor(p.age)} · ${p.lifeStage||lifeStageFor(p.age)} · ${p.alive?"Living":"Deceased"}`;
  const partner=p.partner?people.find(q=>q.id===p.partner):null;
  const parents=(p.parents||[]).map(id=>people.find(q=>q.id===id)).filter(Boolean);
  const children=(p.children||[]).map(id=>people.find(q=>q.id===id)).filter(Boolean);
  const mentor=p.mentorId?people.find(q=>q.id===p.mentorId):null;
  const home=homeFor(p),best=p.bestFriendId?people.find(q=>q.id===p.bestFriendId):null,rival=p.rivalId?people.find(q=>q.id===p.rivalId):null;
  const bond=partner?Math.round(relationshipBond(p,partner)):0;
  const relationLabel=p.relationshipStage==="married"?"💍 Married":p.relationshipStage==="dating"?"❤️ Dating":p.relationshipStage==="widowed"?"🕯 Widowed":"Single";
  const skillRows=skillJobs.map(j=>`<div class="skillLine"><span>${j}</span><b>${skillTitle(skillLevel(p,j))} ${skillLevel(p,j)}</b></div>`).join("");
  citizenBody.innerHTML=`<div class="stats"><div class="stat">❤️ Health<b>${Math.round(p.health)}%</b></div><div class="stat">😊 Happy<b>${Math.round(p.happiness||0)}%</b></div><div class="stat">⚡ Energy<b>${Math.round(p.energy)}%</b></div><div class="stat">😟 Stress<b>${Math.round(p.stress||0)}%</b></div></div>
  <div class="citizenRow"><span class="jobBadge">🛠 ${escapeHtml(p.job)}</span> <span class="jobBadge">🧠 ${escapeHtml(aiTraitLabel(p))}</span> <span class="jobBadge">📖 ${Math.round(p.education||0)} edu</span><br><b>Current goal:</b> ${escapeHtml(p.goal)}<br><b>Life goal:</b> ${escapeHtml(p.longGoal||"Build a stable life")}<br><b>Mood:</b> ${escapeHtml(p.mood)}<br><b>Why:</b> ${escapeHtml(p.decisionReason||"Observing the world")}</div>
  <div class="family"><b>Status:</b> ${relationLabel}<br><b>Partner:</b> ${partner?escapeHtml(partner.name):"None"}${partner?`<br><b>Relationship bond:</b> ${bond}/100`:""}${p.relationshipStage==="married"?`<br><b>Family surname:</b> ${escapeHtml(surnameOf(p))}<br><b>Married:</b> Day ${p.marriageDay}`:""}<br><b>Birth name:</b> ${escapeHtml(p.birthName||p.name)}<br><b>Parents:</b> ${parents.length?parents.map(x=>escapeHtml(x.name)).join(", "):"—"}<br><b>Children:</b> ${children.length?children.map(x=>escapeHtml(x.name)).join(", "):"None"}<br><b>Home:</b> ${home?`Hut #${home.id}`:"No permanent home"}<br><b>Mentor:</b> ${mentor?escapeHtml(mentor.name):"None"}</div>
  <div class="citizenRow"><b>Settlement:</b> ${escapeHtml(citizenSettlement(p)?.name||"None")}<br><b>Citizenship:</b> ${p.refugee?"Refugee / new arrival":"Resident"}${p.militaryRole?`<br><b>Military:</b> ${escapeHtml(p.militaryRole)}`:""}${citizenSettlement(p)?.leaderId===p.id?`<br><b>Office:</b> Leader of ${escapeHtml(citizenSettlement(p).name)}`:""}${(p.citizenshipHistory||[]).length?`<br><b>Migration:</b> ${escapeHtml(p.citizenshipHistory[0])}`:""}</div>
  <div class="citizenRow"><b>Culture:</b> ${escapeHtml(cultureById(p.cultureId)?.name||"Unformed")}<br><b>Faith:</b> ${escapeHtml(religionById(p.religionId)?.name||"No organized faith")}<br><b>Belief:</b> ${Math.round(p.belief||0)}% · ${escapeHtml(p.faithStance||faithStance(p))}${p.religiousRole?`<br><b>Religious role:</b> ${escapeHtml(p.religiousRole)}`:""}<br><b>Class:</b> ${escapeHtml(p.socialClass||"Commoner")}${p.economicRole?` · ${escapeHtml(p.economicRole)}`:""}</div>
  <div class="citizenRow"><b>Best friend:</b> ${best?escapeHtml(best.name):"None yet"}<br><b>Rival:</b> ${rival?escapeHtml(rival.name):"None"}<br><b>Wealth:</b> ${(p.wealth||0).toFixed(1)} · <b>Reputation:</b> ${Math.round(p.reputation||0)}<br><b>Possessions:</b> ${p.possessions?.tools||0} tools · ${p.possessions?.keepsakes||0} keepsakes</div>
  <div class="skillBox"><b>Skills</b>${skillRows}</div>
  <div class="memory"><b>Life memories</b><br>${(p.memory||[]).slice(0,5).map(m=>`• ${escapeHtml(m)}`).join("<br>")||"None"}</div>
  ${!p.alive?`<div class="warningBox"><b>Died:</b> Day ${p.deathDay||"?"} · ${escapeHtml(p.causeOfDeath||"unknown cause")}</div>`:""}`;
  citizen.classList.remove("hidden")
}
const toolMeta={
  inspect:["👁","Inspect","Tap a person"],land:["🌱","Raise Land","Drag to terraform"],water:["🌊","Water","Drag to carve water"],grass:["🌿","Grassland","Paint a biome"],forest:["🌲","Forest","Paint a biome"],sand:["🏜️","Desert","Paint a biome"],snow:["❄️","Snow","Paint a biome"],mountain:["⛰️","Mountain","Raise mountains"],
  rain:["🌧","Rain","Bless the land"],drought:["☀️","Drought","Dry the land"],fire:["🔥","Fire","Burn an area"],lava:["🌋","Lava","Create molten ground"],lightning:["⚡","Lightning","Strike the world"],heal:["💚","Heal","Heal living people"],bless:["✨","Bless","Restore people nearby"],
  food:["🍎","Food","Place food"],trees:["🌳","Trees","Place trees"],stone:["🪨","Stone","Place stone"],iron:["⛓️","Iron","Place iron"],gold:["🟡","Gold","Place gold"],
  deer:["🦌","Deer","Tap to spawn"],sheep:["🐑","Sheep","Tap to spawn"],wolf:["🐺","Wolf","Tap to spawn"],human:["🧍","Human","Tap to spawn"],couple:["👫","Couple","Tap to spawn"],family:["👨‍👩‍👧","Family","Tap to spawn"],
  cave:["🕳️","Cave","Carve underground"],ustone:["🪨","Underground Stone","Fill with stone"],uwater:["💧","Underground Water","Create underground lake"],magma:["🌋","Magma","Create magma chamber"],uiron:["⛓️","Iron Vein","Create underground vein"],ugold:["🟡","Gold Vein","Create underground vein"],ucoal:["⬛","Coal Seam","Create underground seam"],crystal:["💎","Crystal","Create rare crystals"],reveal:["🔦","Reveal","Expose nearby deposits"]
};
function refreshToolChip(){const m=toolMeta[tool]||["✦",tool,"Use on world"];toolIcon.textContent=m[0];toolName.textContent=m[1];toolHint.textContent=m[2];inspectBtn.classList.toggle("active",tool==="inspect")}
function updateUI(force=true){
  if(!settlement)return;
  const now=visualTime*1000;if(!force&&now-lastUiRefreshMs<180)return;lastUiRefreshMs=now;ensureWorldIndex();
  popEl.textContent=alivePopulation();dayEl.textContent=Math.floor(day);eraEl.textContent=eraName();pauseBtn.textContent=paused?"▶":"⏸";speedBtn.textContent="×"+speed;
  layerIcon.textContent=activeLayer==="surface"?"🌿":"⛏️";layerLabel.textContent=activeLayer==="surface"?"Surface":"Underground";layerBtn.classList.toggle("underground",activeLayer==="underground");layerBtn.classList.toggle("surface",activeLayer==="surface");
  if(miniMapMode)miniMapMode.textContent=activeLayer==="surface"?atlasMode[0].toUpperCase()+atlasMode.slice(1):"Underground";
  const m=toolMeta[tool]||["✦",tool,""];status.textContent=tool==="inspect"?`${layerName()} · inspect · drag · pinch to zoom`:`${layerName()} · ${m[1]} · ${["deer","sheep","wolf","human","couple","family"].includes(tool)?"tap to place":`brush ${brush} · drag to paint`}`;
  refreshToolChip();if(selected){const p=personById(selected);if(p&&!citizen.classList.contains("hidden"))showCitizen(p)}
}
function spawnHumanAt(wx,wy,age=20){
  if(!passable(wx,wy)){showToast("Choose dry land");return null}
  const sex=Math.random()<.5?"F":"M",name=generateUniqueName();
  const p=makePerson(name,wx,wy,sex,age);
  const nearest=settlements.slice().sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0]||settlement;
  if(nearest){p.settlementId=nearest.id;p.originSettlementId=nearest.id;p.cultureId=nearest.cultureId;p.religionId=nearest.religionId}
  people.push(p);invalidateWorldIndex();addEvent(`${name} was placed into ${nearest?.name||"the world"} by the Creator.`,"divine");recordDivineEvent("creation",wx,wy,4);return p
}
function applyTool(wx,wy,continuous=false){
  wx=Math.round(wx);wy=Math.round(wy);if(wx<0||wy<0||wx>=WORLD_W||wy>=WORLD_H)return;
  if(activeLayer==="underground"){
    if(tool==="inspect"){if(continuous)return;const p=people.filter(q=>q.alive&&q.layer==="underground").sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];if(p&&Math.hypot(p.x-wx,p.y-wy)<5)showCitizen(p);return}
    if(["cave","ustone","uwater","magma","uiron","ugold","ucoal","crystal","reveal"].includes(tool)){paintUnderground(wx,wy,brush,tool,!continuous);return}
    return
  }
  if(tool==="inspect"){if(continuous)return;const p=people.filter(q=>q.alive).sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];if(p&&Math.hypot(p.x-wx,p.y-wy)<5)showCitizen(p);return}
  if(["deer","sheep","wolf"].includes(tool)){if(continuous)return;spawnCritter(tool,wx,wy,1);return}
  if(tool==="human"){if(continuous)return;spawnHumanAt(wx,wy,20);assignJobs();return}
  if(tool==="couple"){if(continuous)return;const a=spawnHumanAt(wx-1,wy,22),b=spawnHumanAt(wx+1,wy,24);if(a&&b){a.sex="F";b.sex="M";a.partner=b.id;b.partner=a.id;a.relationshipStage=b.relationshipStage="dating";a.relationshipSince=b.relationshipSince=Math.floor(day);a.relations[b.id]=38;b.relations[a.id]=38;addEvent(`${a.name} and ${b.name} entered the world as a dating couple.`,"divine")}assignJobs();return}
  if(tool==="family"){if(continuous)return;const a=spawnHumanAt(wx-1,wy,27),b=spawnHumanAt(wx+1,wy,29);if(a&&b){
    a.sex="F";b.sex="M";a.partner=b.id;b.partner=a.id;
    a.relationshipStage=b.relationshipStage="dating";a.relationshipSince=b.relationshipSince=Math.floor(day);
    a.relations[b.id]=66;b.relations[a.id]=66;marryCouple(a,b);
    const familyName=surnameOf(a),childName=generateUniqueName(null,familyName);
    const child=makePerson(childName,wx,wy+1,Math.random()<.5?"F":"M",6,[a.id,b.id]);
    child.settlementId=a.settlementId;child.originSettlementId=a.settlementId;
    people.push(child);invalidateWorldIndex();child.job="Child";a.children.push(child.id);b.children.push(child.id);
    addEvent(`The ${familyName} family was placed into Tiny World.`,"divine")
  }assignJobs();return}
  if(tool==="heal"||tool==="bless"){
    const targets=people.filter(q=>q.alive&&Math.hypot(q.x-wx,q.y-wy)<brush);for(const p of targets){p.health=100;p.hunger=clamp(p.hunger-(tool==="bless"?45:20),0,100);p.thirst=clamp(p.thirst-(tool==="bless"?45:20),0,100);if(tool==="bless")p.energy=100;p.memory.unshift(tool==="bless"?"Received a divine blessing":"Touched by divine healing");spawnParticles("heal",p.x,p.y,8)}
    if(!continuous&&targets.length){addEvent(`${targets.length} ${targets.length===1?"person was":"people were"} ${tool==="bless"?"blessed":"healed"}.`,"divine");recordDivineEvent(tool,wx,wy,brush)}return
  }
  paint(wx,wy,brush,tool,!continuous);
  if(!continuous&&["land","water","grass","forest","rain","drought","fire","lava","lightning","food","trees","mountain"].includes(tool))recordDivineEvent(tool,wx,wy,brush);
  if(tool==="rain")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush)p.thirst=clamp(p.thirst-18,0,100)});
  if(tool==="fire")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush*.6)p.health-=8});
  if(tool==="lava")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush*.45)p.health-=18});
  if(tool==="lightning")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush*.35){p.health-=30;p.memory.unshift("Survived divine lightning")}})
}
function resizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);displayScale=dpr;const w=Math.max(320,Math.round(rect.width*dpr)),h=Math.max(320,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}clampCamera()}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*canvas.width,y:(e.clientY-r.top)/r.height*canvas.height}}
function sumArray(arr){let n=0;for(let i=0;i<arr.length;i++)n+=arr[i];return n}
function tileCount(type){let n=0;for(let i=0;i<N;i++)if(terrain[i]===type)n++;return n}
function saveSettings(){try{localStorage.setItem("tinyWorldSettings",JSON.stringify(settings))}catch(e){}}
function closeMenu(){gameMenu.classList.add("hidden");document.querySelectorAll(".navtab").forEach(b=>b.classList.remove("active"))}
function openMainMenu(tab){mainTab=tab;newWorldArmed=false;citizen.classList.add("hidden");brushPanel.classList.add("hidden");gameMenu.classList.remove("hidden");document.querySelectorAll(".navtab").forEach(b=>b.classList.toggle("active",b.dataset.mainTab===tab));renderMainMenu()}
function sectionButton(id,label){return `<button class="segment ${worldSection===id?"active":""}" data-world-section="${id}" type="button">${label}</button>`}
function powerCard(toolId,emoji,name,small="",danger=false){return `<button class="actionCard ${danger?"danger ":""}${tool===toolId?"selected":""}" data-tool-select="${toolId}" type="button"><span class="emoji">${emoji}</span><b>${name}</b>${small?`<small>${small}</small>`:""}</button>`}

function rangeRow(key,title,icon,min,max,step=1,suffix=""){
  const v=worldConfig[key];
  return `<div class="creatorRow"><div class="creatorLabel"><span>${icon}</span><div><b>${title}</b><small id="${key}Value">${v}${suffix}</small></div></div><input data-world-range="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"></div>`
}
function worldSizeChoices(){
  const sizes=[100,150,200,300,500];
  return `<div class="worldSizeGrid">${sizes.map(s=>`<button class="worldSizeChoice ${Number(worldConfig.worldSize)===s?"selected":""}" data-world-size="${s}" type="button"><b>${s}×${s}</b><small>${s===100?"Tiny":s===150?"Small":s===200?"Standard":s===300?"Large":"Huge"}</small></button>`).join("")}</div>`
}
function worldCreatorHtml(){
  return `<div class="menuHero"><div class="eyebrow">World Generator</div><h3>Create Your World</h3><p>Change the world before generating it. The same settings can later be used to reset this world.</p></div>
  <div class="menuSection">World Size</div>
  ${worldSizeChoices()}
  <div class="sizeNotice">${Number(worldConfig.worldSize)===500?"500×500 contains 250,000 simulation cells. Generation can take a little longer on iPhone.":"Default size is 200×200."}</div>
  <div class="menuSection">Seed</div>
  <div class="seedRow"><input id="worldSeedInput" value="${escapeHtml(worldConfig.seed)}" placeholder="random or custom seed"><button data-action="randomize-seed" type="button">🎲 Random</button></div>
  <div class="menuSection">Terrain</div>
  ${rangeRow("landmass","Landmass","🌍",10,90,1,"%")}
  ${rangeRow("water","Water Level","🌊",10,90,1,"%")}
  ${rangeRow("forest","Forest Density","🌲",0,100,1,"%")}
  ${rangeRow("mountains","Mountain Density","⛰️",0,100,1,"%")}
  <div class="menuSection">Life</div>
  ${rangeRow("wildlife","Wildlife Amount","🦌",0,100,1,"%")}
  ${rangeRow("startPopulation","Starting People","👥",2,20,1,"")}
  <div class="menuSection">Starting Supplies</div>
  ${rangeRow("startingFood","Starting Food","🍎",0,60,1,"")}
  ${rangeRow("startingWood","Starting Wood","🪵",0,40,1,"")}
  <button class="bigAction" data-action="generate-custom-world" type="button">🌍 Generate This World</button>
  <button class="bigAction" data-action="reset-custom-defaults" type="button">↺ Restore Generator Defaults</button>`
}
function worldResetHtml(){
  return `<div class="menuHero"><div class="eyebrow">World Reset</div><h3>Restart Current World</h3><p>This regenerates the current seed with the exact customization settings that created it.</p></div>
  <div class="civRows">
    <div class="civRow"><span>Seed</span><span>${escapeHtml(String(lastGeneratedConfig.seed))}</span></div>
    <div class="civRow"><span>World size</span><span>${lastGeneratedConfig.worldSize||200}×${lastGeneratedConfig.worldSize||200}</span></div>
    <div class="civRow"><span>Land / water</span><span>${lastGeneratedConfig.landmass}% / ${lastGeneratedConfig.water}%</span></div>
    <div class="civRow"><span>Forest / mountains</span><span>${lastGeneratedConfig.forest}% / ${lastGeneratedConfig.mountains}%</span></div>
    <div class="civRow"><span>Starting population</span><span>${lastGeneratedConfig.startPopulation}</span></div>
  </div>
  <div class="warningBox" style="margin-top:10px">Resetting removes the current civilization, buildings, history, roads, fire, placed resources, creatures and underground mining progress. The world regenerates from the same seed and settings.</div>
  <button class="bigAction danger" data-action="reset-current-world" type="button">${resetWorldArmed?"⚠️ Tap again to confirm reset":"↺ Reset Current World"}</button>`
}
function worldOverviewHtml(){
  const alive=people.filter(p=>p.alive),activeWars=wars.filter(w=>w.status==="active"),currencies=settlements.filter(s=>ensureMarket(s).stage==="Coinage").length;
  return `<div class="menuHero"><div class="eyebrow">Living world · ${worldAreaLabel()}</div><h3>${settlements.length} settlements · ${cultures.length} cultures</h3><p>Day ${Math.floor(day)} · ${eraName()} · Seed ${worldSeed}</p></div>
  <div class="menuGrid"><div class="menuStat"><small>Population</small><b>${alive.length}</b></div><div class="menuStat"><small>Kingdoms</small><b>${kingdoms.length}</b></div><div class="menuStat"><small>Religions</small><b>${religions.length}</b></div><div class="menuStat"><small>Currencies</small><b>${currencies}</b></div></div>
  <div class="menuSection">World civilization</div><div class="civRows"><div class="civRow"><span>🎭 Cultures</span><span>${cultures.length}</span></div><div class="civRow"><span>✦ Holy sites</span><span>${holySites.length}</span></div><div class="civRow"><span>🤝 Trade routes</span><span>${tradeRoutes.length}</span></div><div class="civRow"><span>⚔ Active wars</span><span>${activeWars.length}</span></div></div>
  <div class="menuSection">World makeup</div><div class="civRows"><div class="civRow"><span>🌿 Habitable land</span><span>${Math.round((tileCount(T.GRASS)+tileCount(T.FOREST)+tileCount(T.SAND))/N*100)}%</span></div><div class="civRow"><span>🌊 Water</span><span>${Math.round((tileCount(T.WATER)+tileCount(T.DEEP))/N*100)}%</span></div><div class="civRow"><span>⛰ Mountain / snow</span><span>${Math.round((tileCount(T.MOUNTAIN)+tileCount(T.SNOW))/N*100)}%</span></div></div>`
}
function peopleHtml(){
  const alive=people.filter(p=>p.alive);
  if(!alive.length)return `<div class="emptyState">There are no living people in this world.</div>`;
  return `<div class="menuHero"><div class="eyebrow">Living Civilization</div><h3>${alive.length} living people</h3><p>${alive.filter(p=>p.age<18).length} young · ${alive.filter(p=>p.lifeStage==="Elder").length} elders · avg happiness ${Math.round(alive.reduce((s,p)=>s+(p.happiness||0),0)/alive.length)}%</p></div>${alive.slice().sort((a,b)=>a.age-b.age).map(p=>`<button class="listCard" data-person="${p.id}" type="button"><div class="avatar">${p.age<14?"🧒":p.lifeStage==="Elder"?"🧓":p.sex==="F"?"👩":"👨"}</div><div class="grow"><b>${escapeHtml(p.name)}</b><small>${p.relationshipStage==="married"?"💍 ":p.relationshipStage==="dating"?"❤️ ":""}${escapeHtml(p.lifeStage)} · ${escapeHtml(p.job)} · ${skillTitle(skillLevel(p,p.job))}</small></div><div class="rightText">😊 ${Math.round(p.happiness||0)}<br>💰 ${(p.wealth||0).toFixed(0)}</div></button>`).join("")}`
}
function familyRegistryHtml(){
  const all=[...people];
  if(!all.length)return `<div class="emptyState">No families exist yet.</div>`;
  const families=new Map();
  for(const p of all){
    const s=surnameOf(p);
    if(!families.has(s))families.set(s,[]);
    families.get(s).push(p)
  }
  const cards=[...families.entries()].sort((a,b)=>b[1].filter(p=>p.alive).length-a[1].filter(p=>p.alive).length).map(([surname,members])=>{
    const living=members.filter(p=>p.alive),married=Math.floor(living.filter(p=>p.relationshipStage==="married").length/2),children=living.filter(p=>p.age<18).length;
    return `<div class="familyCard"><div class="familyCardHead"><div><b>${escapeHtml(surname)} family</b><small>${living.length} living · ${children} young · ${married} married pair${married===1?"":"s"}</small></div><span>🏠</span></div><div class="familyMembers">${members.slice().sort((a,b)=>a.age-b.age).map(p=>`<button data-person="${p.id}" type="button">${p.alive?"":"† "}${escapeHtml(p.name)} <small>${Math.floor(p.age)} · ${escapeHtml(p.lifeStage||lifeStageFor(p.age))}</small></button>`).join("")}</div></div>`
  }).join("");
  return `<div class="menuHero"><div class="eyebrow">Family Registry</div><h3>${families.size} family names</h3><p>Living and deceased relatives remain part of the civilization's recorded lineage.</p></div>${cards}`
}
function culturesHtml(){
  const cards=cultures.map(c=>{const using=settlements.filter(s=>s.cultureId===c.id),pop=people.filter(p=>p.alive&&p.cultureId===c.id).length,heroes=c.heroes.map(id=>people.find(p=>p.id===id)).filter(Boolean).slice(-3);
    return `<div class="cultureCard"><div class="cultureHead"><span class="cultureSwatch" style="background:${cultureColor(c,1)}"></span><div><b>${escapeHtml(c.name)}</b><small>${pop} people · ${using.length} settlement${using.length===1?"":"s"} · prestige ${Math.round(c.prestige||0)}</small></div></div><div class="tagRow">${c.values.map(v=>`<span>${escapeHtml(v)}</span>`).join("")}</div><div class="civRows"><div class="civRow"><span>Festival</span><span>${escapeHtml(c.festival)}</span></div><div class="civRow"><span>Custom</span><span>${escapeHtml(c.customs[0])}</span></div><div class="civRow"><span>Heroes</span><span>${heroes.length?heroes.map(h=>escapeHtml(h.name)).join(", "):"None yet"}</span></div></div></div>`}).join("");
  return `<div class="menuHero"><div class="eyebrow">Culture</div><h3>${cultures.length} living tradition${cultures.length===1?"":"s"}</h3><p>Settlements inherit customs from their founders, but distance, rivalry and generations can create new cultures.</p></div>${cards||`<div class="emptyState">Culture has not formed yet.</div>`}`
}
function faithHtml(){
  const cards=religions.map(r=>{const prophet=people.find(p=>p.id===r.prophetId),followers=religionFollowers(r),origin=settlementById(r.originSettlementId);
    return `<div class="faithCard"><div class="cultureHead"><span class="faithSwatch" style="background:${religionColor(r,1)}">✦</span><div><b>${escapeHtml(r.name)}</b><small>${followers} followers · founded day ${r.foundedDay} in ${escapeHtml(origin?.name||"unknown")}</small></div></div><p>${escapeHtml(r.doctrine)}</p><div class="civRows"><div class="civRow"><span>Theme</span><span>${escapeHtml(divineThemeLabel(r.theme))}</span></div><div class="civRow"><span>Prophet</span><span>${escapeHtml(prophet?.name||"None")}</span></div><div class="civRow"><span>Holy sites</span><span>${r.holySiteIds.length}</span></div><div class="civRow"><span>Prestige</span><span>${Math.round(r.prestige||0)}</span></div></div></div>`}).join("");
  const perceptions=settlements.map(s=>`<div class="civRow"><span>${escapeHtml(s.name)}</span><span>${creatorPerception(s)} · ${Math.round(s.divineAttention||0)} signs</span></div>`).join("");
  return `<div class="menuHero"><div class="eyebrow">Faith & the Creator</div><h3>${religions.length} organized faith${religions.length===1?"":"s"}</h3><p>People interpret what you do. Rain, healing, fire, lightning, creation and even long silence can shape belief.</p></div><div class="menuSection">How civilizations see you</div><div class="civRows">${perceptions}</div><div class="menuSection">Religions</div>${cards||`<div class="emptyState">No organized religion yet. Divine signs—or enough time wondering about a silent Creator—can change that.</div>`}<div class="menuSection">Holy sites</div>${holySites.slice(-8).reverse().map(h=>`<div class="updateItem"><b>✦ ${escapeHtml(h.name)}</b><small>${escapeHtml(settlementById(h.settlementId)?.name||"Unknown")} · day ${h.createdDay}</small><p>Remembered after ${escapeHtml(divineThemeLabel(h.event).toLowerCase())} touched this place.</p></div>`).join("")||`<div class="emptyState">No holy site has been remembered yet.</div>`}`
}
function economyHtml(){
  const cards=settlements.map(s=>{const m=ensureMarket(s),merchants=settlementPeople(s,true).filter(p=>p.economicRole==="Merchant"),classes={};for(const p of settlementPeople(s,true))classes[p.socialClass]=(classes[p.socialClass]||0)+1;
    return `<div class="economyCard"><div class="cultureHead"><div><b>${escapeHtml(s.name)}</b><small>${m.stage}${m.currency?` · ${escapeHtml(m.currency)}`:""} · avg wealth ${m.avgWealth.toFixed(1)}</small></div><span>💰</span></div><div class="priceGrid"><span>🍎 ${m.prices.food.toFixed(1)}</span><span>🪵 ${m.prices.wood.toFixed(1)}</span><span>🪨 ${m.prices.stone.toFixed(1)}</span><span>⛓ ${m.prices.iron.toFixed(1)}</span></div><div class="civRows"><div class="civRow"><span>Merchants</span><span>${merchants.length}</span></div><div class="civRow"><span>Transactions</span><span>${Math.floor(m.transactions)}</span></div><div class="civRow"><span>Classes</span><span>${Object.entries(classes).map(([k,v])=>`${k} ${v}`).join(" · ")}</span></div></div></div>`}).join("");
  return `<div class="menuHero"><div class="eyebrow">Economy</div><h3>${tradeRoutes.length} trade route${tradeRoutes.length===1?"":"s"}</h3><p>Scarcity changes prices. Settlements build markets, merchants gain wealth, classes emerge, and mature trade centers can mint currency.</p></div>${cards}`
}
function civilizationsHtml(){
  const settlementCards=settlements.slice().sort((a,b)=>settlementPopulation(b)-settlementPopulation(a)).map(s=>{
    const leader=settlementLeader(s),k=settlementKingdom(s),pop=settlementPopulation(s),army=armyMembers(s),rel=settlements.filter(o=>o.id!==s.id).map(o=>({o,v:relationScore(s,o)})).sort((a,b)=>b.v-a.v);
    return `<button class="civCard" data-settlement="${s.id}" type="button"><div class="civFlag" style="background:${polityColor(s,1)}"></div><div class="grow"><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.identity)} · founded day ${s.foundedDay}${k?` · ${escapeHtml(k.name)}`:" · Independent"}</small><div class="civMiniStats"><span>👥 ${pop}</span><span>👑 ${leader?escapeHtml(leader.name):"—"}</span><span>⚔ ${army.length}</span><span>📦 ${Math.floor(s.food)}</span></div>${rel.length?`<small>Best relation: ${escapeHtml(rel[0].o.name)} (${relationLabel(rel[0].v)})</small>`:""}</div></button>`
  }).join("");
  const kingdomCards=kingdoms.length?kingdoms.map(k=>{const cap=settlementById(k.capitalId),r=kingdomRuler(k),members=k.memberIds.map(id=>settlementById(id)).filter(Boolean);return `<div class="kingdomCard"><div class="familyCardHead"><div><b>👑 ${escapeHtml(k.name)}</b><small>Founded day ${k.foundedDay} · ${members.length} settlements</small></div><span class="kingdomSwatch" style="background:${polityColors[k.colorIndex%polityColors.length]}"></span></div><div class="civRows"><div class="civRow"><span>Capital</span><span>${escapeHtml(cap?.name||"—")}</span></div><div class="civRow"><span>Ruler</span><span>${escapeHtml(r?.name||"—")}</span></div><div class="civRow"><span>Population</span><span>${members.reduce((n,s)=>n+settlementPopulation(s),0)}</span></div><div class="civRow"><span>Wars won</span><span>${k.warsWon||0}</span></div></div></div>`}).join(""):`<div class="emptyState">No kingdom has formed yet. Friendly settlements can unite as the world develops.</div>`;
  return `<div class="menuHero"><div class="eyebrow">Civilizations</div><h3>${settlements.length} settlements · ${kingdoms.length} kingdoms</h3><p>Settlements migrate, govern themselves, trade, ally, rival and can unite into larger realms.</p></div><div class="menuSection">Settlements</div>${settlementCards}<div class="menuSection">Kingdoms</div>${kingdomCards}`
}
function villageHtml(){
  const s=settlementById(selectedSettlementId)||settlement;selectedSettlementId=s.id;
  const residents=settlementPeople(s,true),complete=settlementBuildings(s,true),pending=settlementBuildings(s,false).filter(b=>!b.complete),leader=settlementLeader(s),k=settlementKingdom(s),c=settlementCulture(s),r=settlementReligion(s),m=ensureMarket(s);
  const avgHappy=residents.length?Math.round(residents.reduce((n,p)=>n+(p.happiness||0),0)/residents.length):0,avgBelief=residents.length?Math.round(residents.reduce((n,p)=>n+(p.belief||0),0)/residents.length):0;
  return `<div class="menuHero"><div class="eyebrow">${k?escapeHtml(k.name):"Independent settlement"}</div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.identity)} · ${escapeHtml(c?.name||"Unformed culture")} · founded day ${s.foundedDay}</p></div>
  <div class="resourceGrid"><div class="resourceCard">👥 People<b>${residents.length}</b></div><div class="resourceCard">🍎 Food<b>${Math.floor(s.food)}</b></div><div class="resourceCard">💰 Wealth<b>${m.avgWealth.toFixed(1)}</b></div><div class="resourceCard">✦ Belief<b>${avgBelief}%</b></div><div class="resourceCard">⚔ Military<b>${militaryStrength(s)}</b></div></div>
  <div class="menuSection">Identity</div><div class="civRows"><div class="civRow"><span>🎭 Culture</span><span>${escapeHtml(c?.name||"Unformed")}</span></div><div class="civRow"><span>✦ Religion</span><span>${escapeHtml(r?.name||"None")}</span></div><div class="civRow"><span>👁 Creator</span><span>${creatorPerception(s)}</span></div><div class="civRow"><span>🪙 Economy</span><span>${m.stage}${m.currency?` · ${escapeHtml(m.currency)}`:""}</span></div></div>
  <div class="menuSection">Government</div><div class="civRows"><div class="civRow"><span>👑 Leader</span><span>${escapeHtml(leader?.name||"None")}</span></div><div class="civRow"><span>🏰 Realm</span><span>${escapeHtml(k?.name||"Independent")}</span></div><div class="civRow"><span>✨ Prosperity</span><span>${Math.round(s.prosperity||50)}%</span></div><div class="civRow"><span>😊 Happiness</span><span>${avgHappy}%</span></div></div>
  <div class="menuSection">Prices</div><div class="priceGrid"><span>🍎 ${m.prices.food.toFixed(1)}</span><span>🪵 ${m.prices.wood.toFixed(1)}</span><span>🪨 ${m.prices.stone.toFixed(1)}</span><span>⛓ ${m.prices.iron.toFixed(1)}</span></div>
  <div class="menuSection">Other settlements</div>${settlements.filter(o=>o.id!==s.id).map(o=>`<button class="listCard" data-settlement="${o.id}" type="button"><div class="civFlag small" style="background:${polityColor(o,1)}"></div><div class="grow"><b>${escapeHtml(o.name)}</b><small>${relationLabel(relationScore(s,o))} · ${escapeHtml(settlementCulture(o)?.name||"culture forming")} · ${escapeHtml(settlementReligion(o)?.name||"no faith")}</small></div><div class="rightText">👥 ${settlementPopulation(o)}</div></button>`).join("")||`<div class="emptyState">No other settlement exists yet.</div>`}`
}
function warHtml(){
  const active=wars.filter(w=>w.status==="active");
  const relationRows=[];
  for(let i=0;i<settlements.length;i++)for(let j=i+1;j<settlements.length;j++){
    const a=settlements[i],b=settlements[j],v=relationScore(a,b);
    relationRows.push(`<div class="diplomacyRow"><span class="dot" style="background:${polityColor(a,1)}"></span><b>${escapeHtml(a.name)}</b><span>↔</span><span class="dot" style="background:${polityColor(b,1)}"></span><b>${escapeHtml(b.name)}</b><em>${relationLabel(v)} ${Math.round(v)}</em></div>`)
  }
  const activeCards=active.length?active.map(w=>{const a=settlementById(w.aId),b=settlementById(w.bId);return `<div class="warCard"><div class="warTitle">⚔ ${escapeHtml(a?.name||"?")} vs ${escapeHtml(b?.name||"?")}</div><small>Day ${w.startDay} · ${escapeHtml(w.cause)}</small><div class="warSides"><div><b>${militaryStrength(a)}</b><span>strength</span><small>${w.casualtiesA} lost</small></div><div class="versus">VS</div><div><b>${militaryStrength(b)}</b><span>strength</span><small>${w.casualtiesB} lost</small></div></div><div class="civRow"><span>Battles fought</span><span>${w.battles}</span></div></div>`}).join(""):`<div class="emptyState">No active wars. Rivalries can still grow through borders, scarcity and diplomacy.</div>`;
  const past=wars.filter(w=>w.status!=="active").slice(-5).reverse().map(w=>{const a=settlementById(w.aId),b=settlementById(w.bId),winner=settlementById(w.winnerId);return `<div class="updateItem"><b>${escapeHtml(a?.name||"?")} vs ${escapeHtml(b?.name||"?")}</b><small>Days ${w.startDay}–${w.endDay||"?"}</small><p>${winner?`${escapeHtml(winner.name)} prevailed.`:"Peace without a clear victor."} Casualties: ${w.casualtiesA+w.casualtiesB}.</p></div>`}).join("");
  return `<div class="menuHero"><div class="eyebrow">War Room</div><h3>${active.length} active war${active.length===1?"":"s"}</h3><p>Armies are formed from real citizens. Battles can kill named people, create refugees and change political control.</p></div>
  <div class="menuGrid"><div class="menuStat"><small>Settlements</small><b>${settlements.length}</b></div><div class="menuStat"><small>Kingdoms</small><b>${kingdoms.length}</b></div><div class="menuStat"><small>Armies</small><b>${settlements.filter(s=>armyMembers(s).length).length}</b></div><div class="menuStat"><small>Trade routes</small><b>${tradeRoutes.length}</b></div></div>
  <div class="menuSection">Active conflicts</div>${activeCards}
  <div class="menuSection">Diplomacy</div>${relationRows.join("")||`<div class="emptyState">A second settlement is needed before diplomacy begins.</div>`}
  ${past?`<div class="menuSection">Recent wars</div>${past}`:""}`
}
function historyHtml(){
  return events.length?events.map(e=>`<div class="updateItem"><b>Day ${e.day}</b><small>${escapeHtml(e.kind)}</small><p>${escapeHtml(e.text)}</p></div>`).join(""):`<div class="emptyState">No history yet.</div>`
}
function settingsHtml(){
  const row=(key,title,sub)=>`<div class="settingRow"><div><b>${title}</b><small>${sub}</small></div><button class="toggle ${settings[key]?"on":""}" data-setting="${key}" type="button" aria-label="${title}"></button></div>`;
  return `${row("autoPerformance","Automatic performance","Adjust decorative detail when frame time rises")}
  <div class="performanceCard"><b>Performance engine</b><small>${performanceLabel()}</small><p>AI search caching, staggered simulation, adaptive rendering, entity culling and throttled Atlas updates are active.</p></div>
  ${row("labels","Citizen name labels","Show names while closely zoomed")}${row("trails","Footpaths","Show paths created by walking")}${row("dayNight","Day & night lighting","Darken the world as time cycles")}${row("effects","Weather & particles","Clouds, rain and world effects")}
  <div class="menuSection">World management</div><button class="bigAction" data-action="center-world" type="button">⌾ Center on selected settlement</button><button class="bigAction" data-action="open-world-creator" type="button">🌍 Open World Creator</button><button class="bigAction danger" data-action="open-world-reset" type="button">↺ Reset Current World</button>`
}
function updatesHtml(){
  return `<div class="menuHero"><div class="eyebrow">Tiny World</div><h3>V10.0.1 · Performance Core</h3><p>A dedicated optimization release focused on smoother frame pacing and eliminating simulation spikes before V10.1 continues.</p></div>
  <div class="updateItem"><b>V10.0.1 — Performance Core</b><small>Current</small><p>Major optimization pass: cached world indexes and AI targets, staggered simulation updates, cheaper job assignment, local social/relationship searches, visible-entity culling, adaptive visual detail, particle budgets, throttled Atlas/HUD refreshes, lower backing-texture memory and removal of an unnecessary periodic full terrain rebuild.</p></div><div class="updateItem"><b>V10.0 — Culture, Faith & Economy</b><small>Previous</small><p>Cultures now carry values, customs, festivals and heroes; daughter settlements can culturally diverge. Citizens have personal belief levels and religious stances. Divine actions alter how civilizations perceive the Creator and can create religions, prophets, clergy and holy sites. Settlements run markets with scarcity-driven prices, merchants, social classes, barter and emerging currencies. The Atlas adds Political, Culture, Faith and Economy modes.</p></div><div class="updateItem"><b>V9 — Civilizations & Kingdoms</b><small>Previous</small><p>Population pressure can create new settlements led by real migrating families. Every settlement has resources, buildings, territory, leaders, identity, diplomacy and military strength. Settlements trade, form kingdoms, develop rivalries, fight wars with named citizen casualties, and generate refugees whose citizenship histories persist.</p></div>
  <div class="updateItem"><b>V8.3 — Natural Coastline Water</b><small>Previous</small><p>Natural shallow-water shelves and coastline-oriented animated surf.</p></div>
  <div class="updateItem"><b>V8.2 — Natural Effects</b><small>Previous</small><p>Lightning is now a real branching strike with a brief flash instead of a grid of hazard markers. Fire uses irregular animated flame clusters and embers. The broad turquoise ocean halo was removed at the terrain-color level, leaving only a narrow coastal shallows transition and moving foam.</p></div><div class="updateItem"><b>V8.1 — Living Ocean</b><small>Previous</small><p>Ocean animation moved to real elapsed frame time with traveling wave bands and tidal surf.</p></div><div class="updateItem"><b>V8 — Premium Painted World</b><small>Previous</small><p>The surface renderer moved to continuous height/moisture sampling with smoothed terrain, mixed forests and upgraded miniature people and wildlife.</p></div><div class="updateItem"><b>V7.2 — Painted World Pass</b><small>Previous</small><p>Added larger painterly land dabs, softer shore blending, stronger surf and more organic forest shapes.</p></div><div class="updateItem"><b>V7.1 — Brushed World Pass</b><small>Previous</small><p>Terrain leans harder into a brushed look with stronger painterly dabs, forests render more organically, and water has much more visible motion and shoreline surf.</p></div><div class="updateItem"><b>V7 — Premium Art Pass</b><small>Previous</small><p>The world now uses a richer painterly land overlay, softer coastal blending, more alive shore water, refined huts and farms, and upgraded tiny sprites so citizens and animals feel like miniature living beings in a premium-looking world.</p></div><div class="updateItem"><b>V6.6 — Organic Terrain + Sprite Overhaul</b><small>Previous</small><p>Coastlines became softer, shoreline water gained a light tide effect, wave motion became more visible, and both citizens and animals received upgraded tiny vector sprites.</p></div><div class="updateItem"><b>V6.5 — Grand Graphics Overhaul</b><small>Previous</small><p>The world surface was rebuilt with sharper texturing, richer biome color, animated wave motion, improved shoreline foam, bush-like food clusters, cleaner low-zoom forest rendering and stronger visual grounding between the land and the citizens.</p></div><div class="updateItem"><b>V6 — Living Civilization</b><small>Previous</small><p>Citizens age, learn, build skills, form households, create families, experience grief and leave a lineage behind.</p></div><div class="updateItem"><b>V5.4 — World Scale</b><small>Previous</small><p>Dynamic 100×100 through 500×500 world sizes.</p></div><div class="updateItem"><b>V5.3 — Family & Marriage</b><small>Previous</small><p>Dating, emotional bonds, marriage, shared surnames, breakups and child surname inheritance.</p></div><div class="updateItem"><b>V5.2 — Responsive World</b><small>Previous</small><p>Responsive landscape catalogs, smaller wording and procedural unique names.</p></div><div class="updateItem"><b>V5.1 — Living World</b><small>Previous</small><p>Compact HUD, collapsible Atlas, hide-UI mode, personality traits, long-term goals, danger awareness, social needs and relationships.</p></div><div class="updateItem"><b>V5 — Visual Overhaul</b><small>Previous</small><p>Premium UI, atlas, richer terrain, water, forests, mountains, buildings, villagers and atmosphere.</p></div>
  <div class="updateItem"><b>V4.1 — Underground</b><small>Previous</small><p>Surface/Underground toggle, caves, deep stone, underground lakes, magma, iron/gold/coal/crystal veins, mine entrances, tunneling miners and layer-aware god powers.</p></div>
  <div class="updateItem"><b>V4 — World Control</b><small>Previous</small><p>World, God Powers and Resources tabs; full people/village/history/settings panels; biome painting; fire and lava; iron and gold; wildlife; direct people spawning; persistent visual settings.</p></div>
  <div class="updateItem"><b>V3 — Civilization</b><small>Previous</small><p>Families, jobs, farms, stockpiles, building construction, discoveries and village growth.</p></div>
  <div class="updateItem"><b>V2.1 — Camera Fix</b><small>Foundation</small><p>Unified Retina camera transform, stable terrain edges and aligned citizens.</p></div>`
}
function renderWorldTab(){
  menuTitle.textContent="World";menuSubtitle.textContent="Civilizations, kingdoms, people and history";
  menuSegments.classList.remove("hidden");
  menuSegments.innerHTML=sectionButton("overview","Overview")+sectionButton("civs","Civilizations")+sectionButton("culture","Culture")+sectionButton("faith","Faith")+sectionButton("economy","Economy")+sectionButton("people","People")+sectionButton("families","Families")+sectionButton("village","Settlement")+sectionButton("war","War")+sectionButton("history","History")+sectionButton("creator","World Creator")+sectionButton("reset","Reset")+sectionButton("settings","Settings")+sectionButton("updates","Updates");
  const pages={overview:worldOverviewHtml,civs:civilizationsHtml,culture:culturesHtml,faith:faithHtml,economy:economyHtml,people:peopleHtml,families:familyRegistryHtml,village:villageHtml,war:warHtml,history:historyHtml,creator:worldCreatorHtml,reset:worldResetHtml,settings:settingsHtml,updates:updatesHtml};menuBody.innerHTML=(pages[worldSection]||worldOverviewHtml)()
}
function renderPowersTab(){
  menuTitle.textContent="God Powers";menuSubtitle.textContent=`Transform the ${resourceLayer==="surface"?"surface":"underground"}`;
  menuSegments.classList.remove("hidden");menuSegments.innerHTML=`<button class="segment ${resourceLayer==="surface"?"active":""}" data-layer-section="surface" type="button">🌿 Surface</button><button class="segment ${resourceLayer==="underground"?"active":""}" data-layer-section="underground" type="button">⛏ Underground</button>`;
  if(resourceLayer==="underground"){
    menuBody.innerHTML=`<div class="layerNote">These powers affect only the underground layer. Switch layers with the Surface/Underground button to watch the changes directly.</div>
    <div class="menuSection">Excavation</div><div class="actionGrid">${powerCard("cave","🕳️","Cave","Carve tunnels")}${powerCard("ustone","🪨","Fill Stone","Close caverns")}${powerCard("reveal","🔦","Reveal","Highlight deposits")}</div>
    <div class="menuSection">Underground elements</div><div class="actionGrid">${powerCard("uwater","💧","Water","Underground lake")}${powerCard("magma","🌋","Magma","Molten chamber",true)}</div>
    <div class="menuSection">Mineral veins</div><div class="actionGrid">${powerCard("uiron","⛓️","Iron Vein")}${powerCard("ugold","🟡","Gold Vein")}${powerCard("ucoal","⬛","Coal Seam")}${powerCard("crystal","💎","Crystal","Rare deposit")}</div>`;return
  }
  menuBody.innerHTML=`<div class="menuSection">Terraform</div><div class="actionGrid">${powerCard("land","🌱","Raise Land")}${powerCard("water","🌊","Water")}${powerCard("mountain","⛰️","Mountain")}${powerCard("grass","🌿","Grassland")}${powerCard("sand","🏜️","Desert")}${powerCard("snow","❄️","Snow")}</div>
  <div class="menuSection">Weather</div><div class="actionGrid">${powerCard("rain","🌧","Rain")}${powerCard("drought","☀️","Drought")}${powerCard("lightning","⚡","Lightning","Strike",true)}</div>
  <div class="menuSection">Elements</div><div class="actionGrid">${powerCard("fire","🔥","Fire","Burn land",true)}${powerCard("lava","🌋","Lava","Molten terrain",true)}</div>
  <div class="menuSection">Divine</div><div class="actionGrid">${powerCard("heal","💚","Heal","Restore health")}${powerCard("bless","✨","Bless","Restore needs")}</div>
  <div class="menuSection">Materials</div><div class="actionGrid">${powerCard("food","🍎","Food")}${powerCard("trees","🌳","Trees")}${powerCard("stone","🪨","Stone")}</div>`
}
function renderResourcesTab(){
  menuTitle.textContent="World Resources";menuSubtitle.textContent=resourceLayer==="surface"?"Surface life and materials":"Underground geology and minerals";
  menuSegments.classList.remove("hidden");menuSegments.innerHTML=`<button class="segment ${resourceLayer==="surface"?"active":""}" data-layer-section="surface" type="button">🌿 Surface</button><button class="segment ${resourceLayer==="underground"?"active":""}" data-layer-section="underground" type="button">⛏ Underground</button>`;
  if(resourceLayer==="underground"){
    const caveTiles=tileUndergroundCount(U.CAVE),waterTiles=tileUndergroundCount(U.WATER),magmaTiles=tileUndergroundCount(U.MAGMA);
    menuBody.innerHTML=`<div class="menuHero"><div class="eyebrow">Below the surface</div><h3>Underground World</h3><p>Mineral veins are visible here. Mine entrances connect surface villages to this exact camera location.</p></div>
    <div class="oreLegend"><div class="menuStat"><small>⛓ Iron</small><b>${undergroundCount(uIron)}</b></div><div class="menuStat"><small>🟡 Gold</small><b>${undergroundCount(uGold)}</b></div><div class="menuStat"><small>⬛ Coal</small><b>${undergroundCount(uCoal)}</b></div><div class="menuStat"><small>💎 Crystal</small><b>${undergroundCount(uCrystal)}</b></div></div>
    <div class="menuSection">Minerals</div><div class="actionGrid">${powerCard("ustone","🪨","Stone",`${undergroundCount(uStone)} mass`)}${powerCard("uiron","⛓️","Iron",`${undergroundCount(uIron)} ore`)}${powerCard("ugold","🟡","Gold",`${undergroundCount(uGold)} ore`)}${powerCard("ucoal","⬛","Coal",`${undergroundCount(uCoal)} ore`)}${powerCard("crystal","💎","Crystal",`${undergroundCount(uCrystal)} ore`)}</div>
    <div class="menuSection">Geology</div><div class="actionGrid">${powerCard("cave","🕳️","Caves",`${caveTiles} tiles`)}${powerCard("uwater","💧","Water",`${waterTiles} tiles`)}${powerCard("magma","🌋","Magma",`${magmaTiles} tiles`)}</div>`;return
  }
  const deer=critters.filter(c=>c.type==="deer").length,sheep=critters.filter(c=>c.type==="sheep").length,wolves=critters.filter(c=>c.type==="wolf").length;
  menuBody.innerHTML=`<div class="menuSection">Biomes</div><div class="actionGrid">${powerCard("grass","🌿","Grassland")}${powerCard("forest","🌲","Forest")}${powerCard("sand","🏜️","Desert")}${powerCard("snow","❄️","Snow")}${powerCard("mountain","⛰️","Mountains")}${powerCard("water","🌊","Water")}</div>
  <div class="menuSection">Surface materials</div><div class="actionGrid">${powerCard("stone","🪨","Stone",`${sumArray(rocks)} exposed`)}${powerCard("trees","🌳","Trees",`${sumArray(trees)} density`)}${powerCard("food","🍎","Wild Food",`${sumArray(food)} available`)}</div>
  <div class="menuSection">Creatures</div><div class="actionGrid">${powerCard("deer","🦌","Deer",`${deer} alive`)}${powerCard("sheep","🐑","Sheep",`${sheep} alive`)}${powerCard("wolf","🐺","Wolf",`${wolves} alive`)}</div>
  <div class="menuSection">People</div><div class="actionGrid">${powerCard("human","🧍","Human",`${people.filter(p=>p.alive).length} alive`)}${powerCard("couple","👫","Couple","2 adults")}${powerCard("family","👨‍👩‍👧","Family","2 adults + child")}</div>`
}
function tileUndergroundCount(type){let n=0;for(let i=0;i<N;i++)if(underground[i]===type)n++;return n}
function renderMainMenu(){if(mainTab==="world")renderWorldTab();else if(mainTab==="powers")renderPowersTab();else renderResourcesTab()}
function chooseTool(id){tool=id;const under=["cave","ustone","uwater","magma","uiron","ugold","ucoal","crystal","reveal"].includes(id);activeLayer=under?"underground":"surface";resourceLayer=activeLayer;refreshToolChip();brushPanel.classList.add("hidden");closeMenu();showToast(`${(toolMeta[id]||["",id])[1]} selected · ${layerName()}`);updateUI()}

function centerOnSettlement(){const s=settlementById(selectedSettlementId)||settlement;camX=s.x;camY=s.y;clampCamera();showToast(`Centered on ${s.name}`)}

canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,canvasPoint(e));if(pointers.size===1){const p=canvasPoint(e);last=p;dragging=false;const w=screenToWorld(p.x,p.y);if(tool!=="inspect")applyTool(w.x,w.y,true)}else if(pointers.size===2){const a=[...pointers.values()];pinchStart={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),z:zoom}}});
canvas.addEventListener("pointermove",e=>{const p=canvasPoint(e);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);if(pointers.size===2&&pinchStart){const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom=clamp(pinchStart.z*(d/pinchStart.d),2,10);clampCamera();return}if(!pointers.has(e.pointerId)||pointers.size!==1)return;const dx=p.x-last.x,dy=p.y-last.y;if(Math.abs(dx)+Math.abs(dy)>2)dragging=true;if(tool==="inspect"){const s=cameraScale();camX-=dx/s;camY-=dy/s;clampCamera()}else if(Date.now()-paintStamp>24){const w=screenToWorld(p.x,p.y);applyTool(w.x,w.y,true);paintStamp=Date.now()}last=p});
canvas.addEventListener("pointerup",e=>{const p=canvasPoint(e),w=screenToWorld(p.x,p.y);if(pointers.size===1){if(tool==="inspect"&&!dragging)applyTool(w.x,w.y,false);else if(tool!=="inspect")applyTool(w.x,w.y,false)}pointers.delete(e.pointerId);pinchStart=null});
canvas.addEventListener("pointercancel",e=>{pointers.delete(e.pointerId);pinchStart=null});

document.querySelectorAll(".brush").forEach(b=>b.addEventListener("click",()=>{brush=Number(b.dataset.size);brushLabel.textContent=brush;document.querySelectorAll(".brush").forEach(x=>x.classList.toggle("active",x===b));brushPanel.classList.add("hidden");updateUI()}));
brushBtn.addEventListener("click",()=>brushPanel.classList.toggle("hidden"));
document.querySelectorAll(".navtab").forEach(b=>b.addEventListener("click",()=>openMainMenu(b.dataset.mainTab)));
document.getElementById("menuClose").addEventListener("click",closeMenu);
inspectBtn.addEventListener("click",()=>{tool="inspect";closeMenu();brushPanel.classList.add("hidden");updateUI();showToast("Inspect mode")});
layerBtn.addEventListener("click",()=>{activeLayer=activeLayer==="surface"?"underground":"surface";resourceLayer=activeLayer;tool="inspect";closeMenu();brushPanel.classList.add("hidden");updateUI();showToast(activeLayer==="surface"?"Surface view":"Underground view")});
document.getElementById("centerBtn").addEventListener("click",centerOnSettlement);
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).classList.add("hidden")));
menuSegments.addEventListener("click",e=>{const w=e.target.closest("[data-world-section]");if(w){worldSection=w.dataset.worldSection;newWorldArmed=false;resetWorldArmed=false;renderMainMenu();return}const l=e.target.closest("[data-layer-section]");if(l){resourceLayer=l.dataset.layerSection;renderMainMenu()}});
menuBody.addEventListener("input",e=>{
  const r=e.target.closest("[data-world-range]");if(r){const k=r.dataset.worldRange;worldConfig[k]=Number(r.value);saveWorldConfig();const label=document.getElementById(k+"Value");if(label)label.textContent=r.value+(["landmass","water","forest","mountains","wildlife"].includes(k)?"%":"");return}
  if(e.target.id==="worldSeedInput"){worldConfig.seed=e.target.value;saveWorldConfig()}
});
menuBody.addEventListener("click",e=>{
  const sizeBtn=e.target.closest("[data-world-size]");if(sizeBtn){worldConfig.worldSize=Number(sizeBtn.dataset.worldSize);saveWorldConfig();renderMainMenu();return}
  const toolBtn=e.target.closest("[data-tool-select]");if(toolBtn){chooseTool(toolBtn.dataset.toolSelect);return}
  const settlementBtn=e.target.closest("[data-settlement]");if(settlementBtn){const s=settlementById(Number(settlementBtn.dataset.settlement));if(s){selectedSettlementId=s.id;camX=s.x;camY=s.y;clampCamera();worldSection="village";renderMainMenu();showToast(s.name)}return}
  const personBtn=e.target.closest("[data-person]");if(personBtn){const p=people.find(q=>q.id===Number(personBtn.dataset.person));if(p){closeMenu();showCitizen(p);camX=p.x;camY=p.y;clampCamera()}return}
  const settingBtn=e.target.closest("[data-setting]");if(settingBtn){const k=settingBtn.dataset.setting;settings[k]=!settings[k];saveSettings();if(k==="autoPerformance"){perfState.detail=1;perfState.avgMs=16.7;perfState.quality="Full"}renderMainMenu();return}
  const action=e.target.closest("[data-action]");if(!action)return;
  const a=action.dataset.action;
  if(a==="center-world"){centerOnSettlement();closeMenu()}
  if(a==="open-world-creator"){worldSection="creator";resetWorldArmed=false;renderMainMenu()}
  if(a==="open-world-reset"){worldSection="reset";resetWorldArmed=false;renderMainMenu()}
  if(a==="randomize-seed"){worldConfig.seed=String(rndi(100000,999999999));saveWorldConfig();renderMainMenu()}
  if(a==="reset-custom-defaults"){worldConfig=Object.assign({},defaultWorldConfig);saveWorldConfig();renderMainMenu();showToast("Generator defaults restored")}
  if(a==="generate-custom-world"){const seedInput=document.getElementById("worldSeedInput");if(seedInput)worldConfig.seed=seedInput.value;worldConfig=normalizeWorldConfig(worldConfig);saveWorldConfig();generate(false);closeMenu()}
  if(a==="reset-current-world"){if(!resetWorldArmed){resetWorldArmed=true;renderMainMenu();showToast("Tap again to confirm reset")}else{resetWorldArmed=false;resetCurrentWorld();closeMenu()}}
});
pauseBtn.addEventListener("click",()=>{paused=!paused;updateUI()});speedBtn.addEventListener("click",()=>{speed=speed===1?2:speed===2?5:1;updateUI()});window.addEventListener("resize",resizeCanvas);window.addEventListener("orientationchange",()=>setTimeout(resizeCanvas,120));
miniMap.addEventListener("pointerdown",e=>{e.stopPropagation();const rect=miniMap.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width,py=(e.clientY-rect.top)/rect.height;camX=clamp(px*WORLD_W,0,WORLD_W);camY=clamp(py*WORLD_H,0,WORLD_H);clampCamera();showToast("Atlas moved camera")});
miniMapToggle.addEventListener("click",e=>{e.stopPropagation();miniMapPanel.classList.toggle("compact");miniMapToggle.querySelector("small").textContent=miniMapPanel.classList.contains("compact")?"⌄":"⌃"});
document.querySelectorAll("[data-atlas-mode]").forEach(btn=>btn.addEventListener("click",e=>{
  e.stopPropagation();atlasMode=btn.dataset.atlasMode;document.querySelectorAll("[data-atlas-mode]").forEach(b=>b.classList.toggle("active",b.dataset.atlasMode===atlasMode));
  if(miniMapMode)miniMapMode.textContent=atlasMode[0].toUpperCase()+atlasMode.slice(1);drawMiniMap(true)
}));
uiToggleBtn.addEventListener("click",()=>{appEl.classList.toggle("uiHidden");uiToggleBtn.textContent=appEl.classList.contains("uiHidden")?"◩":"◫";uiToggleBtn.setAttribute("aria-label",appEl.classList.contains("uiHidden")?"Show interface":"Hide interface")});
setTimeout(()=>document.getElementById("splash")?.classList.add("hide"),650);
try{
  generate(false);resizeCanvas();refreshToolChip();
  function frame(now){
    visualTime=now*.001;updatePerformanceClock(now);
    if(now-lastSim>=75){simulate();lastSim=now}
    render();requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame);
}catch(err){
  console.error("Tiny World startup error",err);
  setTimeout(()=>document.getElementById("splash")?.classList.add("hide"),50);
  const t=document.getElementById("toast");if(t){t.textContent="Startup error — refresh after updating";t.classList.remove("hidden")}
}
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
})();
