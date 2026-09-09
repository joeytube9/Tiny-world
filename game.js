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

const WORLD_W=420,WORLD_H=300,N=WORLD_W*WORLD_H;
const T={DEEP:0,WATER:1,SAND:2,GRASS:3,FOREST:4,MOUNTAIN:5,SNOW:6,LAVA:7};
const terrain=new Uint8Array(N),height=new Float32Array(N),moisture=new Float32Array(N),food=new Uint8Array(N),trees=new Uint8Array(N),rocks=new Uint8Array(N),iron=new Uint8Array(N),gold=new Uint8Array(N),wet=new Uint8Array(N),scar=new Uint8Array(N),burn=new Uint8Array(N),trail=new Uint8Array(N);
const U={CAVE:0,DIRT:1,STONE:2,DEEP:3,WATER:4,MAGMA:5};
const underground=new Uint8Array(N),uStone=new Uint8Array(N),uIron=new Uint8Array(N),uGold=new Uint8Array(N),uCoal=new Uint8Array(N),uCrystal=new Uint8Array(N),uGlow=new Uint8Array(N);
const TEX=2,terrainCanvas=document.createElement("canvas");terrainCanvas.width=WORLD_W*TEX;terrainCanvas.height=WORLD_H*TEX;const tctx=terrainCanvas.getContext("2d");
const undergroundCanvas=document.createElement("canvas");undergroundCanvas.width=WORLD_W*TEX;undergroundCanvas.height=WORLD_H*TEX;const uctx=undergroundCanvas.getContext("2d");
const names=["Mara","Dren","Tala","Korin","Nia","Rook","Sela","Bram","Ira","Eren","Veya","Lio","Asha","Toren","Mira","Kael","Rin","Orin","Nora","Vale","Edda","Jori","Lena","Oren","Tavi","Sora","Dara","Milo"];
const techNames=["Shelter","Storage","Agriculture","Stoneworking","Mining","Village Planning","Granaries","Roads"];

let people=[],buildings=[],events=[],particles=[],clouds=[],constructionQueue=[],critters=[];
let settlement=null,day=1,tick=0,paused=false,speed=1,tool="inspect",brush=12,selected=null,dirty=true,worldSeed=1;
let camX=WORLD_W/2,camY=WORLD_H/2,zoom=4,displayScale=1,pointers=new Map(),dragging=false,last={x:0,y:0},pinchStart=null,paintStamp=0,lastSim=0,toastTimer=null,nextPersonId=1,nextBuildingId=1,nextCritterId=1;
let mainTab="world",worldSection="overview",newWorldArmed=false,resetWorldArmed=false;
let activeLayer="surface",resourceLayer="surface",undergroundDirty=true;
const defaultWorldConfig={seed:"random",landmass:50,water:50,forest:52,mountains:42,wildlife:50,startPopulation:2,startingFood:12,startingWood:4};
let worldConfig=Object.assign({},defaultWorldConfig);
let lastGeneratedConfig=Object.assign({},defaultWorldConfig);
let settings={labels:true,trails:true,dayNight:true,effects:true};try{settings=Object.assign(settings,JSON.parse(localStorage.getItem("tinyWorldSettings")||"{}"))}catch(e){}try{worldConfig=Object.assign(worldConfig,JSON.parse(localStorage.getItem("tinyWorldConfig")||"{}"))}catch(e){}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),idx=(x,y)=>y*WORLD_W+x,rnd=(a,b)=>a+Math.random()*(b-a),rndi=(a,b)=>Math.floor(rnd(a,b+1)),lerp=(a,b,t)=>a+(b-a)*t;
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
  c.landmass=clamp(Number(c.landmass)||50,10,90);
  c.water=clamp(Number(c.water)||50,10,90);
  c.forest=clamp(Number(c.forest)||50,0,100);
  c.mountains=clamp(Number(c.mountains)||40,0,100);
  c.wildlife=clamp(Number(c.wildlife)||50,0,100);
  c.startPopulation=clamp(Math.round(Number(c.startPopulation)||2),2,12);
  c.startingFood=clamp(Math.round(Number(c.startingFood)||12),0,60);
  c.startingWood=clamp(Math.round(Number(c.startingWood)||4),0,40);
  c.seed=String(c.seed??"random");
  return c
}
function resetCurrentWorld(){
  worldConfig=Object.assign({},lastGeneratedConfig);
  generate(true);
}
function showToast(text){clearTimeout(toastTimer);toast.textContent=text;toast.classList.remove("hidden");toastTimer=setTimeout(()=>toast.classList.add("hidden"),1350)}
function addEvent(text,kind="world"){events.unshift({day:Math.floor(day),text,kind});events=events.slice(0,160);renderHistory()}
function renderHistory(){historyList.innerHTML=events.map(e=>`<div class="event"><div class="eday">DAY ${e.day}</div><div class="etext">${escapeHtml(e.text)}</div></div>`).join("")}
function discover(name,text){if(settlement.tech.has(name))return;settlement.tech.add(name);addEvent(text||`${settlement.name} discovered ${name}.`,"discovery");showToast(`Discovery: ${name}`)}
function hasTech(name){return settlement.tech.has(name)}

function colorFor(t,x,y,i){const v=(hash(x,y,31)-.5)*12;const c={[T.DEEP]:[28,79,111],[T.WATER]:[43,120,151],[T.SAND]:[205,177,102],[T.GRASS]:[104,157,76],[T.FOREST]:[62,116,57],[T.MOUNTAIN]:[104,109,106],[T.SNOW]:[210,216,211],[T.LAVA]:[129,48,24]};let [r,g,b]=c[t]||c[T.GRASS];if(scar[i]){r=61;g=52;b=43}if(burn[i]&&t!==T.LAVA){r=clamp(r+burn[i]*.22,0,255);g=clamp(g-burn[i]*.12,0,255);b=clamp(b-burn[i]*.16,0,255)}return[clamp(r+v,0,255),clamp(g+v,0,255),clamp(b+v,0,255)]}
function nearType(x,y,type){for(let yy=Math.max(0,y-1);yy<=Math.min(WORLD_H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(WORLD_W-1,x+1);xx++)if(terrain[idx(xx,yy)]===type)return true;return false}
function shorelineFactor(x,y){const t=terrain[idx(x,y)];if(t!==T.WATER&&t!==T.SAND)return 0;let land=0,total=0;for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){const nx=x+xx,ny=y+yy;if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;total++;const nt=terrain[idx(nx,ny)];if(nt>=T.SAND)land++}return land/Math.max(1,total)}
function rebuildTerrain(){const im=tctx.createImageData(terrainCanvas.width,terrainCanvas.height),d=im.data;for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){const i=idx(x,y),t=terrain[i],[r0,g0,b0]=colorFor(t,x,y,i),edge=shorelineFactor(x,y);for(let sy=0;sy<TEX;sy++)for(let sx=0;sx<TEX;sx++){const micro=(hash(x*TEX+sx,y*TEX+sy,worldSeed+91)-.5)*9;let r=r0+micro,g=g0+micro,b=b0+micro;if(t===T.WATER&&edge>.35){r+=edge*14;g+=edge*18;b+=edge*12}const p=((y*TEX+sy)*terrainCanvas.width+(x*TEX+sx))*4;d[p]=r;d[p+1]=g;d[p+2]=b;d[p+3]=255}}tctx.putImageData(im,0,0);tctx.save();tctx.globalAlpha=.24;tctx.fillStyle="#d9efeb";for(let y=1;y<WORLD_H-1;y++)for(let x=1;x<WORLD_W-1;x++){const i=idx(x,y);if(terrain[i]===T.WATER&&(nearType(x,y,T.SAND)||nearType(x,y,T.GRASS))&&hash(x,y,worldSeed+200)>.33)tctx.fillRect(x*TEX,y*TEX,TEX,1)}tctx.restore();dirty=false}


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
function spawnParticles(type,x,y,count=10){for(let i=0;i<count;i++)particles.push({type,x:x+rnd(-1.3,1.3),y:y+rnd(-1.2,1.2),vx:rnd(-.08,.08),vy:rnd(-.18,.03),life:rndi(10,30)})}
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
    else if(type==="fire"&&terrain[i]>=T.SAND&&terrain[i]!==T.SNOW&&terrain[i]!==T.LAVA){burn[i]=255;scar[i]=180;if(trees[i]&&Math.random()<.5)trees[i]--;if(food[i])food[i]=0}
    else if(type==="lava"){terrain[i]=T.LAVA;height[i]=.55;trees[i]=food[i]=rocks[i]=iron[i]=gold[i]=0;burn[i]=255;scar[i]=255}
    else if(type==="lightning"&&n<.43){trees[i]=Math.max(0,trees[i]-2);food[i]=0;scar[i]=210;burn[i]=Math.max(burn[i],160)}
  }
  dirty=true;
  if(type==="rain")spawnCloud(cx,cy,r);
  if(type==="fire")spawnParticles("fire",cx,cy,22);
  if(type==="lava")spawnParticles("fire",cx,cy,28);
  if(type==="lightning")spawnParticles("spark",cx,cy,28);
  if(record){
    const m={land:"The Creator raised new land.",water:"The Creator reshaped the sea.",grass:"Grassland spread across the world.",forest:"A forest spread by divine will.",sand:"The land was turned to desert.",snow:"A frozen biome formed.",mountain:"Mountains rose from the earth.",rain:"The Creator summoned rain.",drought:"A divine drought swept the land.",fire:"Divine fire was unleashed.",lava:"Lava erupted from the ground.",lightning:"Lightning tore through the land.",stone:"Stone deposits appeared.",iron:"Iron deposits appeared.",gold:"Gold deposits appeared.",trees:"Trees erupted from the soil.",food:"Food resources appeared."};
    if(m[type])addEvent(m[type],"divine")
  }
}

function makePerson(name,x,y,sex,age,parents=[]){return{id:nextPersonId++,name,x,y,px:x,py:y,sex,age,parents:[...parents],health:100,hunger:rnd(6,16),thirst:rnd(6,14),energy:rnd(80,100),job:age<14?"Child":"Gatherer",goal:"Explore",mood:"Curious",partner:null,children:[],memory:[parents.length?"Born in the settlement":"Entered the Tiny World"],alive:true,dir:1,phase:rnd(0,6.28),skin:rndi(0,3),shirt:rndi(0,5),hair:rndi(0,4),carryType:null,carryAmount:0,lastBirthDay:-999,workTimer:0,layer:"surface"}}
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

function addBuilding(type,x,y,complete=true){const b={id:nextBuildingId++,type,x,y,complete,progress:complete?100:0,age:0,smoke:rnd(0,6.28),crop:0,harvest:0};buildings.push(b);return b}
function buildingsOf(type,completeOnly=true){return buildings.filter(b=>b.type===type&&(!completeOnly||b.complete))}
function nearestBuilding(p,type=null,completeOnly=true){let best=null,bd=1e9;for(const b of buildings){if(type&&b.type!==type)continue;if(completeOnly&&!b.complete)continue;const d=Math.abs(p.x-b.x)+Math.abs(p.y-b.y);if(d<bd){bd=d;best=b}}return best}
function dropoff(p){return nearestBuilding(p,"stockpile")||nearestBuilding(p,"firepit")||nearestBuilding(p,"hut")}
function buildingAt(x,y,r=3){return buildings.some(b=>Math.hypot(b.x-x,b.y-y)<r)}
function passable(x,y){if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)return false;const t=terrain[idx(x,y)];return t!==T.DEEP&&t!==T.WATER&&t!==T.MOUNTAIN&&t!==T.SNOW&&t!==T.LAVA}
function recordTrail(x,y){if(x<0||y<0||x>=WORLD_W||y>=WORLD_H)return;const i=idx(x,y);if(passable(x,y))trail[i]=clamp(trail[i]+1,0,255)}
function moveTo(p,nx,ny){if(passable(nx,ny)){p.dir=nx>=p.x?1:-1;p.x=nx;p.y=ny;recordTrail(nx,ny);return true}return false}
function wander(p){const d=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]][rndi(0,8)];moveTo(p,p.x+d[0],p.y+d[1])}
function nearestTile(p,fn,max=42){let best=null,bd=1e9;for(let y=Math.max(0,p.y-max);y<=Math.min(WORLD_H-1,p.y+max);y+=2)for(let x=Math.max(0,p.x-max);x<=Math.min(WORLD_W-1,p.x+max);x+=2){const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d<bd&&fn(idx(x,y),x,y)){bd=d;best={x,y}}}return best}
function moveToward(p,t){if(!t){wander(p);return}const dx=Math.sign(t.x-p.x),dy=Math.sign(t.y-p.y),opts=[];if(dx&&passable(p.x+dx,p.y))opts.push([p.x+dx,p.y]);if(dy&&passable(p.x,p.y+dy))opts.push([p.x,p.y+dy]);if(dx&&dy&&passable(p.x+dx,p.y+dy))opts.push([p.x+dx,p.y+dy]);if(opts.length){const q=opts[rndi(0,opts.length-1)];moveTo(p,q[0],q[1])}else wander(p)}
function nearWater(p){for(let y=p.y-2;y<=p.y+2;y++)for(let x=p.x-2;x<=p.x+2;x++){if(x<0||y<0||x>=WORLD_W||y>=WORLD_H)continue;const t=terrain[idx(x,y)];if(t===T.WATER||t===T.DEEP)return true}return false}
function atTarget(p,t,r=1.4){return t&&Math.hypot(p.x-t.x,p.y-t.y)<=r}

function assignJobs(){const adults=people.filter(p=>p.alive&&p.age>=14&&p.layer!=="underground");const pending=buildings.filter(b=>!b.complete);const farms=buildingsOf("farm");let farmerSlots=hasTech("Agriculture")?Math.max(0,Math.min(farms.length*2,Math.ceil(adults.length*.28))):0;let builders=pending.length?Math.max(1,Math.ceil(adults.length*.15)):0;let miners=hasTech("Stoneworking")&&(settlement.stone<14||(settlement.iron||0)<8||(settlement.gold||0)<3)?Math.max(1,Math.ceil(adults.length*.16)):0;let woodNeeded=settlement.wood<18?Math.max(1,Math.ceil(adults.length*.25)):Math.max(0,Math.ceil(adults.length*.12));let foodNeeded=settlement.food<20?Math.max(1,Math.ceil(adults.length*.30)):Math.max(1,Math.ceil(adults.length*.16));for(const p of adults){if(builders>0){p.job="Builder";builders--;continue}if(farmerSlots>0){p.job="Farmer";farmerSlots--;continue}if(miners>0){p.job="Miner";miners--;continue}if(woodNeeded>0){p.job="Woodcutter";woodNeeded--;continue}if(foodNeeded>0){p.job="Gatherer";foodNeeded--;continue}p.job=Math.random()<.45?"Hauler":"Gatherer"}}
function deliver(p){if(p.layer==="underground")return false;const d=dropoff(p);if(!d)return false;if(!atTarget(p,d,1.8)){p.goal=`Deliver ${p.carryType}`;moveToward(p,d);return true}if(p.carryType==="food")settlement.food+=p.carryAmount;if(p.carryType==="wood")settlement.wood+=p.carryAmount;if(p.carryType==="stone")settlement.stone+=p.carryAmount;if(p.carryType==="iron")settlement.iron+=p.carryAmount;if(p.carryType==="gold")settlement.gold+=p.carryAmount;if(p.carryType==="coal")settlement.coal=(settlement.coal||0)+p.carryAmount;p.carryType=null;p.carryAmount=0;p.goal="Work";return true}
function findFarmWork(p){const farms=buildingsOf("farm");if(!farms.length)return null;let best=null,bd=1e9;for(const f of farms){const d=Math.abs(p.x-f.x)+Math.abs(p.y-f.y);if(d<bd&&(f.crop>=100||f.crop<15)){bd=d;best=f}}return best||farms[rndi(0,farms.length-1)]}
function workMinerUnderground(p){
  const mine=buildingsOf("mine")[0];
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
  p.carryAmount=1;underground[i]=U.CAVE;undergroundDirty=true;spawnParticles("stone",p.x,p.y,5);return true
}
function workPerson(p){if(p.job==="Miner"&&buildingsOf("mine").length)return workMinerUnderground(p);if(p.carryAmount>0&&p.carryType)return deliver(p);
  if(p.job==="Builder"){const site=buildings.find(b=>!b.complete);if(site){p.goal=`Build ${site.type}`;if(!atTarget(p,site,1.6)){moveToward(p,site);return true}site.progress+=1.8;spawnParticles("dust",site.x,site.y,2);if(site.progress>=100){site.progress=100;site.complete=true;addEvent(`${p.name} completed the ${site.type}.`,"building");if(site.type==="hut")discover("Shelter","The settlement mastered permanent shelter.");if(site.type==="stockpile")discover("Storage","A communal stockpile established shared storage.");if(site.type==="farm")discover("Agriculture","The first fields were prepared for agriculture.");if(site.type==="granary")discover("Granaries","A granary was completed to protect the harvest.");if(site.type==="mine"){discover("Mining","First Hearth opened its first mine shaft.");openMineShaft(site)}}return true}}
  if(p.job==="Farmer"){const f=findFarmWork(p);if(f){p.goal="Tend fields";if(!atTarget(p,f,2)){moveToward(p,f);return true}if(f.crop>=100){p.carryType="food";p.carryAmount=5;f.crop=8;spawnParticles("grain",f.x,f.y,8);return true}if(f.crop<15)f.crop=18;return true}}
  if(p.job==="Miner"){const target=nearestTile(p,(i)=>rocks[i]>0||iron[i]>0||gold[i]>0,34);if(target){p.goal="Mine minerals";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);if(gold[i]>0){gold[i]--;p.carryType="gold"}else if(iron[i]>0){iron[i]--;p.carryType="iron"}else{rocks[i]--;p.carryType="stone"}p.carryAmount=1;spawnParticles("stone",p.x,p.y,5);return true}}
  if(p.job==="Woodcutter"){const target=nearestTile(p,(i)=>trees[i]>0,34);if(target){p.goal="Cut wood";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);trees[i]--;p.carryType="wood";p.carryAmount=1;spawnParticles("leaf",p.x,p.y,6);return true}}
  if(p.job==="Hauler"){const f=buildingsOf("farm").find(f=>f.crop>=100);if(f){p.goal="Collect harvest";if(!atTarget(p,f,2)){moveToward(p,f);return true}p.carryType="food";p.carryAmount=4;f.crop=12;return true}}
  const target=nearestTile(p,(i)=>food[i]>0,34);if(target){p.goal="Gather food";if(!atTarget(p,target,1)){moveToward(p,target);return true}const i=idx(target.x,target.y);food[i]--;p.carryType="food";p.carryAmount=2;return true}
  wander(p);return true;
}
function homeCapacity(){return buildingsOf("hut").length*4+2}
function matchPartners(){const singles=people.filter(p=>p.alive&&p.age>=18&&!p.partner);for(const p of singles){if(p.partner)continue;const q=singles.find(o=>o!==p&&!o.partner&&o.sex!==p.sex&&Math.abs(o.age-p.age)<18);if(q){p.partner=q.id;q.partner=p.id;p.memory.unshift(`Became partners with ${q.name}`);q.memory.unshift(`Became partners with ${p.name}`);addEvent(`${p.name} and ${q.name} formed a family.`,"family")}}}
function tryBirths(){if(people.filter(p=>p.alive).length>=48)return;if(homeCapacity()<=people.filter(p=>p.alive).length)return;if(settlement.food<12)return;for(const mother of people){if(!mother.alive||mother.sex!=="F"||mother.age<18||mother.age>42||!mother.partner||day-mother.lastBirthDay<22)continue;const father=people.find(p=>p.id===mother.partner&&p.alive);if(!father)continue;if(Math.random()>.008)continue;const sex=Math.random()<.5?"F":"M",name=names[(nextPersonId+rndi(0,names.length-1))%names.length]+(nextPersonId>names.length?` ${Math.ceil(nextPersonId/names.length)}`:"");const baby=makePerson(name,mother.x,mother.y,sex,0,[mother.id,father.id]);mother.children.push(baby.id);father.children.push(baby.id);mother.lastBirthDay=day;settlement.food=Math.max(0,settlement.food-6);people.push(baby);settlement.births++;mother.memory.unshift(`Gave birth to ${name}`);father.memory.unshift(`Became parent of ${name}`);addEvent(`${name} was born to ${mother.name} and ${father.name}.`,"family");showToast(`${name} was born`);break}}
function eatFromStores(p){if(p.hunger<58)return false;if(settlement.food>0){settlement.food--;p.hunger=clamp(p.hunger-36,0,100);p.goal="Eat";return true}return false}
function think(p){if(!p.alive)return;p.px+=(p.x-p.px)*.23;p.py+=(p.y-p.py)*.23;p.phase+=.22;p.hunger+=p.age<6?.020:.030;p.thirst+=.043;p.energy-=p.age<6?.010:.016;p.age+=.00011;
  const pi=idx(clamp(Math.round(p.x),0,WORLD_W-1),clamp(Math.round(p.y),0,WORLD_H-1));if(p.layer!=="underground"){if(terrain[pi]===T.LAVA)p.health-=1.6;else if(burn[pi]>110)p.health-=.30}else if(underground[pi]===U.MAGMA)p.health-=1.8;if(p.hunger>92||p.thirst>94)p.health-=.09;else if(p.health<100&&p.hunger<55&&p.thirst<55)p.health+=.014;if(p.health<=0){p.alive=false;settlement.deaths++;addEvent(`${p.name} died at age ${Math.floor(p.age)}.`,"citizen");return}
  if(p.layer==="underground"&&p.job==="Miner"){p.mood="Working below";workMinerUnderground(p);return}
  if(p.thirst>60){p.goal="Find water";p.mood="Thirsty";if(nearWater(p))p.thirst=clamp(p.thirst-20,0,100);else moveToward(p,nearestTile(p,(i)=>terrain[i]===T.WATER,36));return}
  if(eatFromStores(p))return;
  if(p.energy<22){p.goal="Rest";p.mood="Tired";const home=nearestBuilding(p,"hut")||nearestBuilding(p,"firepit");if(home&&!atTarget(p,home,2))moveToward(p,home);else p.energy=clamp(p.energy+.8,0,100);return}
  if(p.age<14){p.job="Child";p.goal="Stay near home";const home=nearestBuilding(p,"hut")||nearestBuilding(p,"firepit");if(home&&Math.hypot(p.x-home.x,p.y-home.y)>7)moveToward(p,home);else if(Math.random()<.08)wander(p);return}
  p.mood="Focused";workPerson(p);
}

function findBuildSite(type){const cx=settlement.x,cy=settlement.y;for(let r=4;r<24;r+=2){for(let n=0;n<24;n++){const a=(n/24)*Math.PI*2+rnd(-.08,.08),x=Math.round(cx+Math.cos(a)*r),y=Math.round(cy+Math.sin(a)*r);if(!passable(x,y)||buildingAt(x,y,type==="farm"?5:4))continue;const t=terrain[idx(x,y)];if(type==="farm"&&(t!==T.GRASS&&t!==T.FOREST))continue;if(type!=="farm"&&t===T.SAND)continue;return{x,y}}}return null}
function queueBuilding(type,wood,stone=0){if(buildings.some(b=>b.type===type&&!b.complete))return false;if(settlement.wood<wood||settlement.stone<stone)return false;const site=findBuildSite(type);if(!site)return false;settlement.wood-=wood;settlement.stone-=stone;addBuilding(type,site.x,site.y,false);addEvent(`Construction began on a ${type}.`,"building");return true}
function planVillage(){const pop=people.filter(p=>p.alive).length,huts=buildingsOf("hut").length,farms=buildingsOf("farm").length;
  if(huts<Math.ceil(Math.max(2,pop)/4))queueBuilding("hut",8);
  if(day>3&&!buildings.some(b=>b.type==="stockpile"))queueBuilding("stockpile",10);
  if(hasTech("Storage")&&day>8&&!hasTech("Agriculture")&&settlement.food>=10)discover("Agriculture","Villagers began saving seed and planning permanent fields.");
  if(hasTech("Agriculture")&&farms<Math.max(1,Math.ceil(pop/6)))queueBuilding("farm",6);
  if(pop>=6&&!hasTech("Village Planning"))discover("Village Planning","The growing settlement began organizing buildings around a shared center.");
  if(day>16&&settlement.wood>=15&&!hasTech("Stoneworking"))discover("Stoneworking","Villagers learned to shape stone gathered from the hills.");
  if(hasTech("Stoneworking")&&pop>=5&&!buildings.some(b=>b.type==="mine"))queueBuilding("mine",10,2);
  if(hasTech("Stoneworking")&&pop>=7&&!buildings.some(b=>b.type==="workshop"))queueBuilding("workshop",12,5);
  if(pop>=8&&hasTech("Agriculture")&&!buildings.some(b=>b.type==="granary"))queueBuilding("granary",14,2);
  if(!hasTech("Roads")){let found=false;for(let n=0;n<400;n++){const i=rndi(0,N-1);if(trail[i]>85){found=true;break}}if(found)discover("Roads","Repeated foot traffic hardened into the settlement's first permanent paths.")}
}
function updateFarms(){for(const f of buildingsOf("farm")){const i=idx(clamp(Math.round(f.x),0,WORLD_W-1),clamp(Math.round(f.y),0,WORLD_H-1));const rain=wet[i]>0?1.7:1;f.crop=clamp(f.crop+.045*rain,0,100)}}
function consumeSettlement(){const alive=people.filter(p=>p.alive).length;if(tick%420===0&&alive>0)settlement.food=Math.max(0,settlement.food-Math.max(1,Math.floor(alive/4)))}
function simulate(){if(paused)return;const loops=speed===1?1:speed===2?2:5;for(let l=0;l<loops;l++){tick++;day+=.008;people.forEach(think);updateCritters();buildings.forEach(b=>b.age++);updateFarms();consumeSettlement();if(tick%120===0)assignJobs();if(tick%190===0){planVillage();matchPartners();tryBirths()}if(tick%280===0){for(let n=0;n<280;n++){const x=rndi(0,WORLD_W-1),y=rndi(0,WORLD_H-1),i=idx(x,y);if(terrain[i]===T.GRASS&&food[i]<4&&Math.random()<.15)food[i]++;if(terrain[i]===T.FOREST&&trees[i]<4&&Math.random()<.18)trees[i]++;if(wet[i])wet[i]--;if(scar[i])scar[i]--;if(burn[i])burn[i]=Math.max(0,burn[i]-2)}dirty=true}}
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;p.vy+=p.type==="leaf"?.006:0});particles=particles.filter(p=>p.life>0);clouds.forEach(c=>{c.life--;c.phase+=.015;c.x+=.015});clouds=clouds.filter(c=>c.life>0);updateUI()}

function generate(useExistingSeed=false){
  worldConfig=normalizeWorldConfig(worldConfig);
  saveWorldConfig();

  if(useExistingSeed){
    worldSeed=seedFromInput(lastGeneratedConfig.seed);
    worldConfig=Object.assign({},lastGeneratedConfig);
  }else{
    worldSeed=seedFromInput(worldConfig.seed);
    lastGeneratedConfig=Object.assign({},worldConfig,{seed:String(worldSeed)});
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
  for(let n=0;n<700;n++){
    const x=clamp((WORLD_W>>1)+rndi(-110,110),8,WORLD_W-9),y=clamp((WORLD_H>>1)+rndi(-82,82),8,WORLD_H-9),t=terrain[idx(x,y)];
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
  paint(sx,sy,25,"land",false);

  nextPersonId=1;nextBuildingId=1;nextCritterId=1;
  people=[];

  const startPop=configValue("startPopulation");
  for(let n=0;n<startPop;n++){
    const sex=n%2===0?"F":"M";
    const name=n===0?"Mara":n===1?"Dren":`${names[(n+2)%names.length]} ${n+1}`;
    people.push(makePerson(name,sx+rndi(-3,3),sy+rndi(-2,2),sex,rndi(19,30)))
  }
  if(people.length>=2){people[0].partner=people[1].id;people[1].partner=people[0].id}

  buildings=[];events=[];particles=[];clouds=[];critters=[];
  day=1;tick=0;camX=sx;camY=sy;zoom=4;dirty=true;undergroundDirty=true;selected=null;
  activeLayer="surface";resourceLayer="surface";
  settlement={name:"First Hearth",x:sx,y:sy,food:configValue("startingFood"),wood:configValue("startingWood"),stone:0,iron:0,gold:0,coal:0,tech:new Set(),births:0,deaths:0};
  generateUnderground();
  addBuilding("firepit",sx,sy,true);

  const deerCount=Math.round(2+6*wildlifeScale),sheepCount=Math.round(3*wildlifeScale),wolfCount=Math.round(1.5*wildlifeScale);
  for(let n=0;n<deerCount;n++)spawnCritter("deer",sx+rndi(-28,28),sy+rndi(-22,22),1);
  for(let n=0;n<sheepCount;n++)spawnCritter("sheep",sx+rndi(-30,30),sy+rndi(-24,24),1);
  for(let n=0;n<wolfCount;n++)spawnCritter("wolf",sx+rndi(-42,42),sy+rndi(-32,32),1);

  addEvent(`${people.map(p=>p.name).slice(0,2).join(" and ")} founded First Hearth in world seed ${worldSeed}.`,"founding");
  assignJobs();clampCamera();updateUI();
  showToast(useExistingSeed?"World reset":"New customized world created")
}

function drawTrails(){const b=visibleBounds(2),step=zoom<3?3:zoom<4?2:1;ctx.save();ctx.lineCap="round";for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){const v=trail[idx(x,y)];if(v<12)continue;const s=worldToScreen(x+.5,y+.5),z=cameraScale();ctx.fillStyle=v>80?"rgba(118,88,55,.52)":`rgba(135,103,67,${Math.min(.38,v/230)})`;ctx.beginPath();ctx.ellipse(s.x,s.y,Math.max(1.4,z*.48),Math.max(1,z*.22),hash(x,y,9)*Math.PI,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawWater(){const b=visibleBounds(2),step=zoom<3?5:zoom<5?3:2;ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle="#d7eff1";ctx.lineWidth=Math.max(1,cameraScale()*.10);for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){const t=terrain[idx(x,y)];if(t!==T.WATER&&t!==T.DEEP)continue;const h=hash(x,y,worldSeed+331);if(h<.58)continue;const s=worldToScreen(x+.5,y+.5),w=Math.sin(tick*.065+x*.55+y*.37)*cameraScale()*.18,len=cameraScale()*(1+h);ctx.beginPath();ctx.moveTo(s.x-len/2,s.y+w);ctx.lineTo(s.x+len/2,s.y+w);ctx.stroke()}ctx.restore()}
function drawGroundDetails(){
  const b=visibleBounds(3),step=zoom<4?3:1,z=cameraScale();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),t=terrain[i],s=worldToScreen(x+.5,y+.5),h=hash(x,y,worldSeed+411);
    if((t===T.GRASS||t===T.FOREST)&&h>.90&&zoom>=3){ctx.fillStyle=h>.96?"#d8c95f":"#4d813e";ctx.fillRect(s.x,s.y,Math.max(1,z*.12),Math.max(1,z*.28))}
    if(food[i]&&h>.50){ctx.fillStyle="#c74443";const rr=Math.max(1.5,z*.24);ctx.beginPath();ctx.arc(s.x-rr*.5,s.y,rr,0,Math.PI*2);ctx.arc(s.x+rr*.6,s.y-rr*.3,rr*.8,0,Math.PI*2);ctx.fill()}
    if(rocks[i]>0&&h>.42){ctx.fillStyle="#777d78";ctx.beginPath();ctx.ellipse(s.x,s.y,z*.45,z*.30,-.25,0,Math.PI*2);ctx.fill();ctx.fillStyle="#a4aaa4";ctx.beginPath();ctx.ellipse(s.x-z*.1,s.y-z*.08,z*.18,z*.10,-.25,0,Math.PI*2);ctx.fill()}
    if(iron[i]>0&&h>.55){ctx.fillStyle="#6f7f85";ctx.beginPath();ctx.arc(s.x+z*.18,s.y-z*.1,z*.22,0,Math.PI*2);ctx.fill();ctx.fillStyle="#a8bbc0";ctx.fillRect(s.x+z*.1,s.y-z*.18,z*.12,z*.10)}
    if(gold[i]>0){ctx.fillStyle="#d7b64c";ctx.beginPath();ctx.arc(s.x-z*.18,s.y-z*.08,z*.20,0,Math.PI*2);ctx.fill()}
  }
}
function drawTree(x,y){const s=worldToScreen(x+.5,y+.55),z=clamp(cameraScale(),2.2,12);const sway=Math.sin(tick*.025+x*.7+y*.31)*z*.06;ctx.fillStyle="rgba(0,0,0,.22)";ctx.beginPath();ctx.ellipse(s.x+z*.2,s.y+z*1.05,z*.9,z*.3,-.1,0,Math.PI*2);ctx.fill();ctx.fillStyle="#68482d";ctx.fillRect(s.x-z*.17,s.y-z*.04,z*.35,z*1.15);ctx.fillStyle=hash(x,y,501)>.5?"#2d6335":"#2a5b32";ctx.beginPath();ctx.arc(s.x+sway,s.y-z*.48,z*.88,0,Math.PI*2);ctx.arc(s.x-z*.55+sway,s.y-z*.10,z*.60,0,Math.PI*2);ctx.arc(s.x+z*.58+sway,s.y-z*.10,z*.62,0,Math.PI*2);ctx.fill();ctx.fillStyle="#4b8b4c";ctx.beginPath();ctx.arc(s.x-z*.22+sway,s.y-z*.65,z*.44,0,Math.PI*2);ctx.fill()}
function drawTerrainFeatures(){const b=visibleBounds(4),step=zoom<3?3:zoom<4?2:1;for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){const i=idx(x,y),t=terrain[i];if(t===T.FOREST&&trees[i]>0&&hash(x,y,88)>.31)drawTree(x,y);if((t===T.MOUNTAIN||t===T.SNOW)&&hash(x,y,610)>.45){const s=worldToScreen(x+.5,y+.7),z=clamp(cameraScale(),2,11)*.72;ctx.fillStyle="rgba(0,0,0,.18)";ctx.beginPath();ctx.ellipse(s.x+z*.3,s.y+z*.8,z*.9,z*.25,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=t===T.SNOW?"#aeb6b1":"#686e6b";ctx.beginPath();ctx.moveTo(s.x-z,s.y+z*.7);ctx.lineTo(s.x,s.y-z*1.25);ctx.lineTo(s.x+z,s.y+z*.7);ctx.fill();ctx.fillStyle="#e7ebe7";ctx.beginPath();ctx.moveTo(s.x,s.y-z*1.25);ctx.lineTo(s.x-z*.25,s.y-z*.68);ctx.lineTo(s.x+z*.28,s.y-z*.55);ctx.fill()}}}
function drawFarm(b){const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12),growth=b.crop/100;ctx.fillStyle="rgba(0,0,0,.20)";ctx.fillRect(s.x-z*2.2,s.y-z*1.35,z*4.4,z*2.9);ctx.fillStyle="#795936";ctx.fillRect(s.x-z*2,s.y-z*1.2,z*4,z*2.4);ctx.strokeStyle="#a17b4c";ctx.lineWidth=Math.max(1,z*.08);for(let r=-1;r<=1;r++){ctx.beginPath();ctx.moveTo(s.x-z*1.8,s.y+r*z*.65);ctx.lineTo(s.x+z*1.8,s.y+r*z*.65);ctx.stroke()}if(growth>.15){ctx.strokeStyle=growth>.72?"#d1b34e":"#6ca24d";ctx.lineWidth=Math.max(1,z*.10);for(let r=-1;r<=1;r++)for(let n=-3;n<=3;n++){const xx=s.x+n*z*.48,yy=s.y+r*z*.65;ctx.beginPath();ctx.moveTo(xx,yy+z*.20);ctx.lineTo(xx,yy-z*(.2+.45*growth));ctx.stroke()}}}
function drawBuilding(b){const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12);if(b.type==="farm"){drawFarm(b);return}if(!b.complete){ctx.fillStyle="rgba(88,66,43,.75)";ctx.fillRect(s.x-z*1.2,s.y-z*.5,z*2.4,z*1.5);ctx.strokeStyle="#d3b174";ctx.lineWidth=Math.max(1,z*.12);ctx.strokeRect(s.x-z*1.5,s.y-z*.9,z*3,z*2.4);ctx.fillStyle="rgba(255,255,255,.25)";ctx.fillRect(s.x-z*1.2,s.y+z*1.1,z*2.4,z*.22);ctx.fillStyle="#8bc579";ctx.fillRect(s.x-z*1.2,s.y+z*1.1,z*2.4*(b.progress/100),z*.22);return}
  ctx.fillStyle="rgba(0,0,0,.25)";ctx.beginPath();ctx.ellipse(s.x+z*.3,s.y+z*1.3,z*1.8,z*.48,0,0,Math.PI*2);ctx.fill();
  if(b.type==="firepit"){ctx.fillStyle="#5a4635";for(let n=0;n<5;n++){const a=n/5*Math.PI*2;ctx.beginPath();ctx.arc(s.x+Math.cos(a)*z*.55,s.y+Math.sin(a)*z*.28,z*.23,0,Math.PI*2);ctx.fill()}ctx.fillStyle="#ffb548";ctx.beginPath();ctx.moveTo(s.x,s.y-z*.8);ctx.lineTo(s.x-z*.45,s.y+z*.35);ctx.lineTo(s.x,s.y+z*.15);ctx.lineTo(s.x+z*.42,s.y+z*.35);ctx.fill();return}
  if(b.type==="mine"){ctx.fillStyle="#5b4a3b";ctx.beginPath();ctx.ellipse(s.x,s.y+z*.22,z*1.25,z*.72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#1f1b19";ctx.beginPath();ctx.ellipse(s.x,s.y+z*.20,z*.78,z*.46,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#a78255";ctx.lineWidth=Math.max(1,z*.16);ctx.beginPath();ctx.moveTo(s.x-z*.9,s.y+z*.68);ctx.lineTo(s.x-z*.9,s.y-z*.65);ctx.lineTo(s.x+z*.9,s.y-z*.65);ctx.lineTo(s.x+z*.9,s.y+z*.68);ctx.stroke();ctx.fillStyle="#d9b96d";ctx.fillRect(s.x-z*.14,s.y-z*.48,z*.28,z*.28);return}
  if(b.type==="stockpile"){ctx.fillStyle="#8b6840";ctx.fillRect(s.x-z*1.5,s.y-z*.55,z*3,z*1.5);ctx.strokeStyle="#c49a5b";ctx.lineWidth=Math.max(1,z*.10);for(let n=-1;n<=1;n++){ctx.beginPath();ctx.moveTo(s.x-z*1.35,s.y+n*z*.35);ctx.lineTo(s.x+z*1.35,s.y+n*z*.35);ctx.stroke()}return}
  if(b.type==="granary"){ctx.fillStyle="#8b633d";ctx.fillRect(s.x-z*1.25,s.y-z*.9,z*2.5,z*2);ctx.fillStyle="#c59a4f";ctx.beginPath();ctx.moveTo(s.x-z*1.55,s.y-z*.85);ctx.lineTo(s.x,s.y-z*2.0);ctx.lineTo(s.x+z*1.55,s.y-z*.85);ctx.fill();ctx.fillStyle="#513829";ctx.fillRect(s.x-z*.3,s.y+z*.25,z*.6,z*.85);return}
  if(b.type==="workshop"){ctx.fillStyle="#75604a";ctx.fillRect(s.x-z*1.55,s.y-z*.65,z*3.1,z*1.9);ctx.fillStyle="#555b59";ctx.beginPath();ctx.moveTo(s.x-z*1.8,s.y-z*.6);ctx.lineTo(s.x,s.y-z*1.7);ctx.lineTo(s.x+z*1.8,s.y-z*.6);ctx.fill();ctx.fillStyle="#d18a42";ctx.fillRect(s.x+z*.75,s.y-z*.15,z*.38,z*.38);return}
  ctx.fillStyle="#8b633d";ctx.fillRect(s.x-z*1.4,s.y-z*.5,z*2.8,z*2);ctx.fillStyle="#c39a54";ctx.beginPath();ctx.moveTo(s.x-z*1.8,s.y-z*.45);ctx.lineTo(s.x,s.y-z*1.95);ctx.lineTo(s.x+z*1.8,s.y-z*.45);ctx.fill();ctx.fillStyle="#4f3828";ctx.fillRect(s.x-z*.3,s.y+z*.45,z*.65,z*1.05);ctx.fillStyle="#e6bc68";ctx.fillRect(s.x+z*.68,s.y,z*.4,z*.4);b.smoke+=.03;ctx.fillStyle="rgba(218,222,214,.20)";for(let n=0;n<2;n++){ctx.beginPath();ctx.arc(s.x+z*1.1+Math.sin(b.smoke+n)*z*.2,s.y-z*1.85-n*z*.75,z*(.26+n*.10),0,Math.PI*2);ctx.fill()}}
function drawPerson(p){if(!p.alive)return;const s=worldToScreen(p.px,p.py),base=clamp(cameraScale(),3,12),child=p.age<14,scale=child?.72:1,z=base*scale,bob=Math.sin(p.phase)*z*.09;const skins=["#f0c18b","#d9a06d","#b9784f","#7d4e35"],shirts=["#775a42","#4c7280","#737846","#7e5b67","#41685c","#6f5b83"],hairs=["#36251d","#65452f","#1e1c1b","#956f3d","#6d342c"];ctx.fillStyle="rgba(0,0,0,.27)";ctx.beginPath();ctx.ellipse(s.x+z*.15,s.y+z*1.4,z*.78,z*.28,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=shirts[p.shirt];ctx.fillRect(s.x-z*.65,s.y-z*.15+bob,z*1.3,z*1.45);ctx.fillStyle=skins[p.skin];ctx.fillRect(s.x-z*.48,s.y-z*1.15+bob,z*.96,z*.95);ctx.fillStyle=hairs[p.hair];ctx.fillRect(s.x-z*.5,s.y-z*1.30+bob,z,z*.34);ctx.fillStyle="#27211e";ctx.fillRect(s.x+(p.dir>0?z*.16:-z*.31),s.y-z*.78+bob,Math.max(1,z*.14),Math.max(1,z*.14));if(p.carryAmount>0){ctx.fillStyle=p.carryType==="food"?"#d04b42":p.carryType==="wood"?"#8a5a36":p.carryType==="iron"?"#a85e43":p.carryType==="gold"?"#e1bd45":p.carryType==="coal"?"#27272a":"#929893";ctx.beginPath();ctx.arc(s.x+p.dir*z*.78,s.y+z*.15,z*.30,0,Math.PI*2);ctx.fill()}if(p.id===selected){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,z*2.05,0,Math.PI*2);ctx.stroke()}if(settings.labels&&zoom>=6&&!child){ctx.font=`600 ${Math.round(base*1.18)}px -apple-system,system-ui`;ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText(p.name,s.x,s.y-z*2.05)}}
function drawUndergroundResources(){
  const b=visibleBounds(3),step=zoom<3?3:zoom<5?2:1,z=cameraScale();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
    const i=idx(x,y),s=worldToScreen(x+.5,y+.5),h=hash(x,y,worldSeed+1500);
    if(underground[i]===U.MAGMA){ctx.fillStyle=`rgba(255,126,35,${.38+.18*Math.sin(tick*.07+x*.5)})`;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(2,z*.42),0,Math.PI*2);ctx.fill()}
    if(underground[i]===U.WATER&&h>.52){ctx.strokeStyle="rgba(104,174,191,.38)";ctx.lineWidth=Math.max(1,z*.08);ctx.beginPath();ctx.moveTo(s.x-z*.4,s.y);ctx.lineTo(s.x+z*.4,s.y);ctx.stroke()}
    if(uCoal[i]){ctx.fillStyle="#28282a";ctx.beginPath();ctx.arc(s.x-z*.20,s.y+z*.08,z*.24,0,Math.PI*2);ctx.fill()}
    if(uIron[i]){ctx.fillStyle="#a85e43";ctx.beginPath();ctx.arc(s.x+z*.10,s.y-z*.10,z*.27,0,Math.PI*2);ctx.arc(s.x-z*.20,s.y+z*.12,z*.18,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d28a68";ctx.fillRect(s.x+z*.02,s.y-z*.17,z*.12,z*.09)}
    if(uGold[i]){ctx.fillStyle="#e1bd45";ctx.beginPath();ctx.arc(s.x-z*.12,s.y-z*.08,z*.23,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff0a0";ctx.fillRect(s.x-z*.18,s.y-z*.14,z*.09,z*.07)}
    if(uCrystal[i]){ctx.fillStyle="rgba(119,210,226,.92)";ctx.beginPath();ctx.moveTo(s.x,s.y-z*.48);ctx.lineTo(s.x-z*.25,s.y+z*.22);ctx.lineTo(s.x,s.y+z*.45);ctx.lineTo(s.x+z*.25,s.y+z*.22);ctx.fill()}
    if(uGlow[i]){ctx.fillStyle=`rgba(255,204,112,${uGlow[i]/900})`;ctx.beginPath();ctx.arc(s.x,s.y,z*1.2,0,Math.PI*2);ctx.fill()}
  }
}
function drawMineShaftUnderground(b){
  const s=worldToScreen(b.x,b.y),z=clamp(cameraScale(),3,12);
  ctx.fillStyle="rgba(0,0,0,.60)";ctx.beginPath();ctx.ellipse(s.x,s.y,z*1.15,z*.72,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#af8655";ctx.lineWidth=Math.max(1,z*.13);ctx.beginPath();ctx.arc(s.x,s.y,z*.82,Math.PI,Math.PI*2);ctx.stroke();
  ctx.fillStyle="#e4b85e";ctx.beginPath();ctx.arc(s.x,s.y-z*.25,z*.16,0,Math.PI*2);ctx.fill()
}
function renderUnderground(){
  if(undergroundDirty)rebuildUnderground();clampCamera();
  ctx.fillStyle="#171312";ctx.fillRect(0,0,canvas.width,canvas.height);
  const s=cameraScale(),v=viewportWorldSize(),viewLeft=camX-v.w/2,viewTop=camY-v.h/2,wl=Math.max(0,viewLeft),wt=Math.max(0,viewTop),wr=Math.min(WORLD_W,viewLeft+v.w),wb=Math.min(WORLD_H,viewTop+v.h);
  if(wr>wl&&wb>wt){ctx.imageSmoothingEnabled=true;ctx.drawImage(undergroundCanvas,wl*TEX,wt*TEX,(wr-wl)*TEX,(wb-wt)*TEX,(wl-viewLeft)*s,(wt-viewTop)*s,(wr-wl)*s,(wb-wt)*s)}
  drawUndergroundResources();
  buildingsOf("mine").forEach(drawMineShaftUnderground);
  people.filter(p=>p.layer==="underground").sort((a,b)=>a.py-b.py).forEach(drawPerson);
  if(settings.effects)drawParticles();
  ctx.fillStyle="rgba(12,8,7,.17)";ctx.fillRect(0,0,canvas.width,canvas.height)
}
function drawCritter(c){
  const s=worldToScreen(c.px,c.py),z=clamp(cameraScale(),2.8,10),bob=Math.sin(c.phase)*z*.06;
  const body=c.type==="deer"?"#8a5d38":c.type==="sheep"?"#d8d5c4":"#687077";
  const head=c.type==="sheep"?"#4f4b45":body;
  ctx.fillStyle="rgba(0,0,0,.20)";ctx.beginPath();ctx.ellipse(s.x+z*.15,s.y+z*.7,z*.8,z*.22,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(s.x,s.y+bob,z*.65,z*.42,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=head;ctx.beginPath();ctx.arc(s.x+c.dir*z*.64,s.y-z*.17+bob,z*.28,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=head;ctx.lineWidth=Math.max(1,z*.10);for(const lx of [-.35,.25]){ctx.beginPath();ctx.moveTo(s.x+lx*z,s.y+z*.25+bob);ctx.lineTo(s.x+lx*z,s.y+z*.72+bob);ctx.stroke()}
  if(c.type==="deer"){ctx.strokeStyle="#5a3d29";ctx.lineWidth=Math.max(1,z*.08);ctx.beginPath();ctx.moveTo(s.x+c.dir*z*.73,s.y-z*.42+bob);ctx.lineTo(s.x+c.dir*z*.88,s.y-z*.72+bob);ctx.moveTo(s.x+c.dir*z*.74,s.y-z*.45+bob);ctx.lineTo(s.x+c.dir*z*.60,s.y-z*.70+bob);ctx.stroke()}
}
function drawHazards(){
  const b=visibleBounds(2),z=cameraScale();
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=2)for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=2){
    const i=idx(x,y),s=worldToScreen(x+.5,y+.5);
    if(terrain[i]===T.LAVA){
      ctx.fillStyle=`rgba(255,123,37,${.30+.18*Math.sin(tick*.08+x)})`;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(2,z*.5),0,Math.PI*2);ctx.fill()
    }else if(burn[i]>50){
      const f=burn[i]/255;ctx.fillStyle=`rgba(255,111,38,${.25+.45*f})`;ctx.beginPath();ctx.moveTo(s.x,s.y-z*.8*f);ctx.lineTo(s.x-z*.28,s.y+z*.25);ctx.lineTo(s.x+z*.28,s.y+z*.25);ctx.fill()
    }
  }
}

function drawParticles(){for(const p of particles){const s=worldToScreen(p.x,p.y),q=Math.max(1.5,cameraScale()*.20);ctx.fillStyle=p.type==="spark"?"#fff0a4":p.type==="fire"?"#ff7a35":p.type==="heal"?"#b7f6d2":p.type==="grain"?"#d8bd58":p.type==="stone"?"#aeb3ae":p.type==="dust"?"#b18b5b":"#69a95b";ctx.fillRect(s.x-q/2,s.y-q/2,q,q)}}
function drawClouds(){if(!settings.effects)return;for(const c of clouds){const s=worldToScreen(c.x,c.y),z=Math.max(10,c.r*cameraScale()*.45);ctx.fillStyle="rgba(198,209,210,.42)";for(let n=0;n<5;n++){ctx.beginPath();ctx.arc(s.x+(n-2)*z*.46,s.y+Math.sin(c.phase+n)*z*.13,z*(.52+(n%2)*.12),0,Math.PI*2);ctx.fill()}ctx.strokeStyle="rgba(176,214,232,.40)";ctx.lineWidth=Math.max(1,cameraScale()*.09);for(let n=0;n<12;n++){const rx=s.x-z*1.3+(n/11)*z*2.6;ctx.beginPath();ctx.moveTo(rx,s.y+z*.3);ctx.lineTo(rx-z*.10,s.y+z*.9);ctx.stroke()}}}
function drawLighting(){if(!settings.dayNight)return;const cycle=(tick%2600)/2600;let a=0;if(cycle<.18)a=.34*(1-cycle/.18);else if(cycle>.78)a=.34*((cycle-.78)/.22);if(a){ctx.fillStyle=`rgba(10,22,48,${a})`;ctx.fillRect(0,0,canvas.width,canvas.height)}}
function render(){if(activeLayer==="underground"){renderUnderground();return}if(dirty)rebuildTerrain();clampCamera();ctx.fillStyle="#1c4f6f";ctx.fillRect(0,0,canvas.width,canvas.height);const s=cameraScale(),v=viewportWorldSize(),viewLeft=camX-v.w/2,viewTop=camY-v.h/2,wl=Math.max(0,viewLeft),wt=Math.max(0,viewTop),wr=Math.min(WORLD_W,viewLeft+v.w),wb=Math.min(WORLD_H,viewTop+v.h);if(wr>wl&&wb>wt){ctx.imageSmoothingEnabled=true;ctx.drawImage(terrainCanvas,wl*TEX,wt*TEX,(wr-wl)*TEX,(wb-wt)*TEX,(wl-viewLeft)*s,(wt-viewTop)*s,(wr-wl)*s,(wb-wt)*s)}drawWater();if(settings.trails)drawTrails();drawGroundDetails();drawHazards();drawTerrainFeatures();buildings.slice().sort((a,b)=>a.y-b.y).forEach(drawBuilding);critters.slice().sort((a,b)=>a.py-b.py).forEach(drawCritter);people.filter(p=>p.layer!=="underground").sort((a,b)=>a.py-b.py).forEach(drawPerson);if(settings.effects)drawParticles();drawClouds();drawLighting()}

function eraName(){const pop=people.filter(p=>p.alive).length;if(pop>=18)return"Village";if(pop>=10)return"Hamlet";if(pop>=5)return"Growing Camp";if(buildingsOf("hut").length)return"Early Settlement";return"Primitive"}
function jobCounts(){const c={};for(const p of people.filter(p=>p.alive)){c[p.job]=(c[p.job]||0)+1}return c}
function renderCivilization(){if(!settlement)return;const counts=jobCounts(),complete=buildings.filter(b=>b.complete),pending=buildings.filter(b=>!b.complete);settlementNameEl.textContent=settlement.name;settlementEraEl.textContent=`${eraName()} · Day ${Math.floor(day)}`;civBody.innerHTML=`<div class="sectionTitle">Stockpile</div><div class="resourceGrid"><div class="resourceCard">🍎 Food<b>${Math.floor(settlement.food)}</b></div><div class="resourceCard">🪵 Wood<b>${Math.floor(settlement.wood)}</b></div><div class="resourceCard">🪨 Stone<b>${Math.floor(settlement.stone)}</b></div><div class="resourceCard">⛓ Iron<b>${Math.floor(settlement.iron||0)}</b></div><div class="resourceCard">🟡 Gold<b>${Math.floor(settlement.gold||0)}</b></div><div class="resourceCard">⬛ Coal<b>${Math.floor(settlement.coal||0)}</b></div></div><div class="sectionTitle">Settlement</div><div class="civRows"><div class="civRow"><span>Population</span><span>${people.filter(p=>p.alive).length} / ${homeCapacity()}</span></div><div class="civRow"><span>Buildings</span><span>${complete.length}${pending.length?` + ${pending.length} building`:''}</span></div><div class="civRow"><span>Births / deaths</span><span>${settlement.births} / ${settlement.deaths}</span></div></div><div class="sectionTitle">Jobs</div><div class="civRows">${Object.entries(counts).map(([k,v])=>`<div class="civRow"><span>${escapeHtml(k)}</span><span>${v}</span></div>`).join('')}</div><div class="sectionTitle">Discoveries</div><div class="techList">${techNames.map(t=>`<span class="tech ${hasTech(t)?'':'locked'}">${hasTech(t)?'✓ ':''}${t}</span>`).join('')}</div><div class="sectionTitle">Buildings</div><div class="civRows">${["firepit","hut","stockpile","farm","mine","granary","workshop"].map(t=>`<div class="civRow"><span>${t[0].toUpperCase()+t.slice(1)}</span><span>${buildingsOf(t).length}</span></div>`).join('')}</div>`}
function showCitizen(p){selected=p.id;citizenName.textContent=p.name;citizenSub.textContent=`${Math.floor(p.age)} · ${p.sex==="F"?"Female":"Male"} · ${p.layer==="underground"?"Underground":"Surface"}`;const partner=p.partner?people.find(q=>q.id===p.partner):null,parents=p.parents.map(id=>people.find(q=>q.id===id)).filter(Boolean);citizenBody.innerHTML=`<div class="stats"><div class="stat">❤️ Health<b>${Math.round(p.health)}%</b></div><div class="stat">⚡ Energy<b>${Math.round(p.energy)}%</b></div><div class="stat">🍖 Hunger<b>${Math.round(p.hunger)}%</b></div><div class="stat">💧 Thirst<b>${Math.round(p.thirst)}%</b></div></div><div class="citizenRow"><span class="jobBadge">🛠 ${escapeHtml(p.job)}</span><br><b>Goal:</b> ${escapeHtml(p.goal)}<br><b>Mood:</b> ${escapeHtml(p.mood)}</div>${p.carryAmount?`<div class="carry">Carrying ${p.carryAmount} ${p.carryType}</div>`:''}<div class="family"><b>Partner:</b> ${partner?escapeHtml(partner.name):'None'}<br><b>Parents:</b> ${parents.length?parents.map(x=>escapeHtml(x.name)).join(', '):'—'}<br><b>Children:</b> ${p.children.length}</div><div class="memory">Latest memory: ${escapeHtml(p.memory[0]||"None")}</div>`;citizen.classList.remove("hidden")}
const toolMeta={
  inspect:["👁","Inspect","Tap a person"],land:["🌱","Raise Land","Drag to terraform"],water:["🌊","Water","Drag to carve water"],grass:["🌿","Grassland","Paint a biome"],forest:["🌲","Forest","Paint a biome"],sand:["🏜️","Desert","Paint a biome"],snow:["❄️","Snow","Paint a biome"],mountain:["⛰️","Mountain","Raise mountains"],
  rain:["🌧","Rain","Bless the land"],drought:["☀️","Drought","Dry the land"],fire:["🔥","Fire","Burn an area"],lava:["🌋","Lava","Create molten ground"],lightning:["⚡","Lightning","Strike the world"],heal:["💚","Heal","Heal living people"],bless:["✨","Bless","Restore people nearby"],
  food:["🍎","Food","Place food"],trees:["🌳","Trees","Place trees"],stone:["🪨","Stone","Place stone"],iron:["⛓️","Iron","Place iron"],gold:["🟡","Gold","Place gold"],
  deer:["🦌","Deer","Tap to spawn"],sheep:["🐑","Sheep","Tap to spawn"],wolf:["🐺","Wolf","Tap to spawn"],human:["🧍","Human","Tap to spawn"],couple:["👫","Couple","Tap to spawn"],family:["👨‍👩‍👧","Family","Tap to spawn"],
  cave:["🕳️","Cave","Carve underground"],ustone:["🪨","Underground Stone","Fill with stone"],uwater:["💧","Underground Water","Create underground lake"],magma:["🌋","Magma","Create magma chamber"],uiron:["⛓️","Iron Vein","Create underground vein"],ugold:["🟡","Gold Vein","Create underground vein"],ucoal:["⬛","Coal Seam","Create underground seam"],crystal:["💎","Crystal","Create rare crystals"],reveal:["🔦","Reveal","Expose nearby deposits"]
};
function refreshToolChip(){const m=toolMeta[tool]||["✦",tool,"Use on world"];toolIcon.textContent=m[0];toolName.textContent=m[1];toolHint.textContent=m[2];inspectBtn.classList.toggle("active",tool==="inspect")}
function updateUI(){if(!settlement)return;popEl.textContent=people.filter(p=>p.alive).length;dayEl.textContent=Math.floor(day);eraEl.textContent=eraName();pauseBtn.textContent=paused?"▶":"⏸";speedBtn.textContent="×"+speed;layerIcon.textContent=activeLayer==="surface"?"🌿":"⛏️";layerLabel.textContent=activeLayer==="surface"?"Surface":"Underground";layerBtn.classList.toggle("underground",activeLayer==="underground");layerBtn.classList.toggle("surface",activeLayer==="surface");const m=toolMeta[tool]||["✦",tool,""];status.textContent=tool==="inspect"?`${layerName()} · inspect · drag · pinch to zoom`:`${layerName()} · ${m[1]} · ${["deer","sheep","wolf","human","couple","family"].includes(tool)?"tap to place":`brush ${brush} · drag to paint`}`;refreshToolChip();if(selected){const p=people.find(q=>q.id===selected);if(p&&!citizen.classList.contains("hidden"))showCitizen(p)}}
function spawnHumanAt(wx,wy,age=20){
  if(!passable(wx,wy)){showToast("Choose dry land");return null}
  const sex=Math.random()<.5?"F":"M",base=names[rndi(0,names.length-1)],name=`${base} ${nextPersonId}`;
  const p=makePerson(name,wx,wy,sex,age);people.push(p);addEvent(`${name} was placed into the world by the Creator.`,"divine");return p
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
  if(tool==="couple"){if(continuous)return;const a=spawnHumanAt(wx-1,wy,22),b=spawnHumanAt(wx+1,wy,24);if(a&&b){a.sex="F";b.sex="M";a.partner=b.id;b.partner=a.id;addEvent(`${a.name} and ${b.name} entered the world as a couple.`,"divine")}assignJobs();return}
  if(tool==="family"){if(continuous)return;const a=spawnHumanAt(wx-1,wy,27),b=spawnHumanAt(wx+1,wy,29);if(a&&b){a.sex="F";b.sex="M";a.partner=b.id;b.partner=a.id;const child=spawnHumanAt(wx,wy+1,6);if(child){child.parents=[a.id,b.id];child.job="Child";a.children.push(child.id);b.children.push(child.id)}addEvent(`A family was placed into Tiny World.`,"divine")}assignJobs();return}
  if(tool==="heal"||tool==="bless"){
    const targets=people.filter(q=>q.alive&&Math.hypot(q.x-wx,q.y-wy)<brush);for(const p of targets){p.health=100;p.hunger=clamp(p.hunger-(tool==="bless"?45:20),0,100);p.thirst=clamp(p.thirst-(tool==="bless"?45:20),0,100);if(tool==="bless")p.energy=100;p.memory.unshift(tool==="bless"?"Received a divine blessing":"Touched by divine healing");spawnParticles("heal",p.x,p.y,8)}
    if(!continuous&&targets.length)addEvent(`${targets.length} ${targets.length===1?"person was":"people were"} ${tool==="bless"?"blessed":"healed"}.`,"divine");return
  }
  paint(wx,wy,brush,tool,!continuous);
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
function worldCreatorHtml(){
  return `<div class="menuHero"><div class="eyebrow">World Generator</div><h3>Create Your World</h3><p>Change the world before generating it. The same settings can later be used to reset this world.</p></div>
  <div class="menuSection">Seed</div>
  <div class="seedRow"><input id="worldSeedInput" value="${escapeHtml(worldConfig.seed)}" placeholder="random or custom seed"><button data-action="randomize-seed" type="button">🎲 Random</button></div>
  <div class="menuSection">Terrain</div>
  ${rangeRow("landmass","Landmass","🌍",10,90,1,"%")}
  ${rangeRow("water","Water Level","🌊",10,90,1,"%")}
  ${rangeRow("forest","Forest Density","🌲",0,100,1,"%")}
  ${rangeRow("mountains","Mountain Density","⛰️",0,100,1,"%")}
  <div class="menuSection">Life</div>
  ${rangeRow("wildlife","Wildlife Amount","🦌",0,100,1,"%")}
  ${rangeRow("startPopulation","Starting People","👥",2,12,1,"")}
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
    <div class="civRow"><span>Land / water</span><span>${lastGeneratedConfig.landmass}% / ${lastGeneratedConfig.water}%</span></div>
    <div class="civRow"><span>Forest / mountains</span><span>${lastGeneratedConfig.forest}% / ${lastGeneratedConfig.mountains}%</span></div>
    <div class="civRow"><span>Starting population</span><span>${lastGeneratedConfig.startPopulation}</span></div>
  </div>
  <div class="warningBox" style="margin-top:10px">Resetting removes the current civilization, buildings, history, roads, fire, placed resources, creatures and underground mining progress. The world regenerates from the same seed and settings.</div>
  <button class="bigAction danger" data-action="reset-current-world" type="button">${resetWorldArmed?"⚠️ Tap again to confirm reset":"↺ Reset Current World"}</button>`
}
function worldOverviewHtml(){
  return `<div class="menuHero"><div class="eyebrow">Current world</div><h3>${escapeHtml(settlement.name)}</h3><p>Day ${Math.floor(day)} · ${eraName()} · Seed ${worldSeed}</p></div>
  <div class="menuGrid"><div class="menuStat"><small>Population</small><b>${people.filter(p=>p.alive).length}</b></div><div class="menuStat"><small>Wild creatures</small><b>${critters.length}</b></div><div class="menuStat"><small>Buildings</small><b>${buildings.filter(b=>b.complete).length}</b></div><div class="menuStat"><small>Discoveries</small><b>${settlement.tech.size}</b></div></div>
  <div class="menuSection">World makeup</div>
  <div class="civRows"><div class="civRow"><span>🌿 Habitable land</span><span>${Math.round((tileCount(T.GRASS)+tileCount(T.FOREST)+tileCount(T.SAND))/N*100)}%</span></div><div class="civRow"><span>🌊 Water</span><span>${Math.round((tileCount(T.WATER)+tileCount(T.DEEP))/N*100)}%</span></div><div class="civRow"><span>⛰ Mountain / snow</span><span>${Math.round((tileCount(T.MOUNTAIN)+tileCount(T.SNOW))/N*100)}%</span></div><div class="civRow"><span>🌋 Lava</span><span>${tileCount(T.LAVA)} tiles</span></div><div class="civRow"><span>⛏ Underground mines</span><span>${buildingsOf("mine").length}</span></div><div class="civRow"><span>⛓ Underground iron</span><span>${undergroundCount(uIron)}</span></div><div class="civRow"><span>🟡 Underground gold</span><span>${undergroundCount(uGold)}</span></div></div>`
}
function peopleHtml(){
  const alive=people.filter(p=>p.alive);
  if(!alive.length)return `<div class="emptyState">There are no living people in this world.</div>`;
  return `<div class="menuHero"><div class="eyebrow">Population</div><h3>${alive.length} living people</h3><p>Tap a person to open their full citizen card.</p></div>${alive.slice().sort((a,b)=>a.age-b.age).map(p=>`<button class="listCard" data-person="${p.id}" type="button"><div class="avatar">${p.sex==="F"?"👩":"👨"}</div><div class="grow"><b>${escapeHtml(p.name)}</b><small>Age ${Math.floor(p.age)} · ${escapeHtml(p.job)} · ${escapeHtml(p.goal)}</small></div><div class="rightText">❤️ ${Math.round(p.health)}<br>${p.children.length} child${p.children.length===1?"":"ren"}</div></button>`).join("")}`
}
function villageHtml(){
  const counts=jobCounts(),complete=buildings.filter(b=>b.complete),pending=buildings.filter(b=>!b.complete);
  return `<div class="menuHero"><div class="eyebrow">Village</div><h3>${escapeHtml(settlement.name)}</h3><p>${eraName()} · capacity ${homeCapacity()} · ${pending.length} active construction project${pending.length===1?"":"s"}</p></div>
  <div class="resourceGrid"><div class="resourceCard">🍎 Food<b>${Math.floor(settlement.food)}</b></div><div class="resourceCard">🪵 Wood<b>${Math.floor(settlement.wood)}</b></div><div class="resourceCard">🪨 Stone<b>${Math.floor(settlement.stone)}</b></div><div class="resourceCard">⛓ Iron<b>${Math.floor(settlement.iron||0)}</b></div><div class="resourceCard">🟡 Gold<b>${Math.floor(settlement.gold||0)}</b></div></div>
  <div class="menuSection">Jobs</div><div class="civRows">${Object.entries(counts).map(([k,v])=>`<div class="civRow"><span>${escapeHtml(k)}</span><span>${v}</span></div>`).join("")}</div>
  <div class="menuSection">Buildings</div><div class="civRows">${["firepit","hut","stockpile","farm","mine","granary","workshop"].map(t=>`<div class="civRow"><span>${t[0].toUpperCase()+t.slice(1)}</span><span>${buildingsOf(t).length}</span></div>`).join("")}</div>
  <div class="menuSection">Discoveries</div><div class="techList">${techNames.map(t=>`<span class="tech ${hasTech(t)?"":"locked"}">${hasTech(t)?"✓ ":""}${t}</span>`).join("")}</div>`
}
function warHtml(){
  return `<div class="menuHero"><div class="eyebrow">Warfare foundation</div><h3>Peace in the first age</h3><p>This panel is already structured for factions, diplomacy, armies and wars as civilization expands beyond one settlement.</p></div>
  <div class="menuGrid"><div class="menuStat"><small>Factions</small><b>1</b></div><div class="menuStat"><small>Active wars</small><b>0</b></div><div class="menuStat"><small>Armies</small><b>0</b></div><div class="menuStat"><small>Relations</small><b>Peace</b></div></div>
  <div class="menuSection">Future war information</div><div class="civRows"><div class="civRow"><span>⚔️ Army strength</span><span>Not formed</span></div><div class="civRow"><span>🛡 Defenses</span><span>None</span></div><div class="civRow"><span>🤝 Diplomacy</span><span>Single faction</span></div><div class="civRow"><span>🏰 Kingdoms</span><span>Awaiting expansion</span></div></div>
  <div class="warningBox" style="margin-top:10px">When multiple settlements and kingdoms arrive, this page becomes the war room: alliances, enemies, casualties, occupied land and battle history.</div>`
}
function historyHtml(){
  return events.length?events.map(e=>`<div class="updateItem"><b>Day ${e.day}</b><small>${escapeHtml(e.kind)}</small><p>${escapeHtml(e.text)}</p></div>`).join(""):`<div class="emptyState">No history yet.</div>`
}
function settingsHtml(){
  const row=(key,title,sub)=>`<div class="settingRow"><div><b>${title}</b><small>${sub}</small></div><button class="toggle ${settings[key]?"on":""}" data-setting="${key}" type="button" aria-label="${title}"></button></div>`;
  return `${row("labels","Citizen name labels","Show names while closely zoomed")}${row("trails","Footpaths","Show paths created by walking")}${row("dayNight","Day & night lighting","Darken the world as time cycles")}${row("effects","Weather & particles","Clouds, rain and world effects")}
  <div class="menuSection">World management</div><button class="bigAction" data-action="center-world" type="button">⌾ Center on First Hearth</button><button class="bigAction" data-action="open-world-creator" type="button">🌍 Open World Creator</button><button class="bigAction danger" data-action="open-world-reset" type="button">↺ Reset Current World</button>`
}
function updatesHtml(){
  return `<div class="menuHero"><div class="eyebrow">Tiny World</div><h3>V4.2 · World Creator</h3><p>You can now shape how a world is generated before civilization begins.</p></div>
  <div class="updateItem"><b>V4.2 — World Creator</b><small>Current</small><p>Custom seeds, landmass, water level, forests, mountains, wildlife, starting population and supplies; exact-world reset using the original generation configuration.</p></div>
  <div class="updateItem"><b>V4.1 — Underground</b><small>Previous</small><p>Surface/Underground toggle, caves, deep stone, underground lakes, magma, iron/gold/coal/crystal veins, mine entrances, tunneling miners and layer-aware god powers.</p></div>
  <div class="updateItem"><b>V4 — World Control</b><small>Previous</small><p>World, God Powers and Resources tabs; full people/village/history/settings panels; biome painting; fire and lava; iron and gold; wildlife; direct people spawning; persistent visual settings.</p></div>
  <div class="updateItem"><b>V3 — Civilization</b><small>Previous</small><p>Families, jobs, farms, stockpiles, building construction, discoveries and village growth.</p></div>
  <div class="updateItem"><b>V2.1 — Camera Fix</b><small>Foundation</small><p>Unified Retina camera transform, stable terrain edges and aligned citizens.</p></div>`
}
function renderWorldTab(){
  menuTitle.textContent="World";menuSubtitle.textContent="People, villages, history and settings";
  menuSegments.classList.remove("hidden");
  menuSegments.innerHTML=sectionButton("overview","Overview")+sectionButton("creator","World Creator")+sectionButton("reset","Reset")+sectionButton("people","People")+sectionButton("village","Village")+sectionButton("war","War")+sectionButton("history","History")+sectionButton("settings","Settings")+sectionButton("updates","Updates");
  const pages={overview:worldOverviewHtml,creator:worldCreatorHtml,reset:worldResetHtml,people:peopleHtml,village:villageHtml,war:warHtml,history:historyHtml,settings:settingsHtml,updates:updatesHtml};menuBody.innerHTML=(pages[worldSection]||worldOverviewHtml)()
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

function centerOnSettlement(){camX=settlement.x;camY=settlement.y;clampCamera();showToast("Centered on First Hearth")}

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
  const toolBtn=e.target.closest("[data-tool-select]");if(toolBtn){chooseTool(toolBtn.dataset.toolSelect);return}
  const personBtn=e.target.closest("[data-person]");if(personBtn){const p=people.find(q=>q.id===Number(personBtn.dataset.person));if(p){closeMenu();showCitizen(p);camX=p.x;camY=p.y;clampCamera()}return}
  const settingBtn=e.target.closest("[data-setting]");if(settingBtn){const k=settingBtn.dataset.setting;settings[k]=!settings[k];saveSettings();renderMainMenu();return}
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
generate(false);resizeCanvas();
function frame(now){if(now-lastSim>=75){simulate();lastSim=now}render();requestAnimationFrame(frame)}requestAnimationFrame(frame);
setTimeout(()=>document.getElementById("splash").classList.add("hide"),650);refreshToolChip();
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
})();
