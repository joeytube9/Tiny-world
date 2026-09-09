(()=>{
"use strict";

const canvas=document.getElementById("world");
const ctx=canvas.getContext("2d",{alpha:false});
const popEl=document.getElementById("pop"),dayEl=document.getElementById("day"),eraEl=document.getElementById("era");
const history=document.getElementById("history"),historyList=document.getElementById("historyList");
const citizen=document.getElementById("citizen"),citizenName=document.getElementById("citizenName"),citizenSub=document.getElementById("citizenSub"),citizenBody=document.getElementById("citizenBody");
const brushPanel=document.getElementById("brushPanel"),brushBtn=document.getElementById("brushBtn"),brushLabel=document.getElementById("brushLabel");
const status=document.getElementById("status"),pauseBtn=document.getElementById("pauseBtn"),speedBtn=document.getElementById("speedBtn");
const toast=document.getElementById("toast");

const WORLD_W=420,WORLD_H=300,N=WORLD_W*WORLD_H;
const T={DEEP:0,WATER:1,SAND:2,GRASS:3,FOREST:4,MOUNTAIN:5,SNOW:6};
const terrain=new Uint8Array(N),height=new Float32Array(N),moisture=new Float32Array(N);
const food=new Uint8Array(N),trees=new Uint8Array(N),wet=new Uint8Array(N),scar=new Uint8Array(N);

const TEX=2;
const terrainCanvas=document.createElement("canvas");
terrainCanvas.width=WORLD_W*TEX;
terrainCanvas.height=WORLD_H*TEX;
const tctx=terrainCanvas.getContext("2d");

let people=[],huts=[],events=[],particles=[],clouds=[];
let day=1,tick=0,paused=false,speed=1,tool="inspect",brush=12,selected=null,dirty=true;
let camX=WORLD_W/2,camY=WORLD_H/2,zoom=4,worldSeed=1;
let displayScale=1; // backing-store pixels per CSS pixel
let pointers=new Map(),dragging=false,last={x:0,y:0},pinchStart=null,paintStamp=0;
let lastSim=0,toastTimer=null;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const idx=(x,y)=>y*WORLD_W+x;
const rnd=(a,b)=>a+Math.random()*(b-a);
const rndi=(a,b)=>Math.floor(rnd(a,b+1));
const lerp=(a,b,t)=>a+(b-a)*t;

function hash(x,y,s=0){
  let n=(x*374761393+y*668265263+s*1442695041)|0;
  n=(n^(n>>13))*1274126177;
  return((n^(n>>16))>>>0)/4294967295;
}
function fade(t){return t*t*(3-2*t)}
function valueNoise(x,y,scale,seed){
  const fx=x/scale,fy=y/scale,x0=Math.floor(fx),y0=Math.floor(fy),sx=fade(fx-x0),sy=fade(fy-y0);
  const a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);
  return lerp(lerp(a,b,sx),lerp(c,d,sx),sy);
}
function fbm(x,y,s){
  return valueNoise(x,y,110,s)*.43+
         valueNoise(x,y,56,s+1)*.27+
         valueNoise(x,y,27,s+2)*.18+
         valueNoise(x,y,13,s+3)*.08+
         valueNoise(x,y,6,s+4)*.04;
}
function classify(i){
  const h=height[i],m=moisture[i];
  terrain[i]=h<.26?T.DEEP:h<.35?T.WATER:h<.405?T.SAND:h>.85?T.SNOW:h>.735?T.MOUNTAIN:m>.60?T.FOREST:T.GRASS;
}
function colorFor(t,x,y,i){
  const variation=(hash(x,y,31)-.5)*12;
  const colors={
    [T.DEEP]:[28,79,111],
    [T.WATER]:[43,120,151],
    [T.SAND]:[205,177,102],
    [T.GRASS]:[104,157,76],
    [T.FOREST]:[62,116,57],
    [T.MOUNTAIN]:[104,109,106],
    [T.SNOW]:[210,216,211]
  };
  let [r,g,b]=colors[t];
  if(scar[i]>0){r=61;g=52;b=43}
  return[
    clamp(Math.round(r+variation),0,255),
    clamp(Math.round(g+variation),0,255),
    clamp(Math.round(b+variation),0,255)
  ];
}
function nearType(x,y,type){
  for(let yy=Math.max(0,y-1);yy<=Math.min(WORLD_H-1,y+1);yy++){
    for(let xx=Math.max(0,x-1);xx<=Math.min(WORLD_W-1,x+1);xx++){
      if(terrain[idx(xx,yy)]===type)return true;
    }
  }
  return false;
}
function shorelineFactor(x,y){
  const t=terrain[idx(x,y)];
  if(t!==T.WATER&&t!==T.SAND)return 0;
  let land=0,total=0;
  for(let yy=-2;yy<=2;yy++){
    for(let xx=-2;xx<=2;xx++){
      const nx=x+xx,ny=y+yy;
      if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
      total++;
      const nt=terrain[idx(nx,ny)];
      if(nt===T.SAND||nt===T.GRASS||nt===T.FOREST||nt===T.MOUNTAIN||nt===T.SNOW)land++;
    }
  }
  return land/Math.max(1,total);
}
function rebuildTerrain(){
  const image=tctx.createImageData(terrainCanvas.width,terrainCanvas.height);
  const d=image.data;
  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const i=idx(x,y),t=terrain[i],[r0,g0,b0]=colorFor(t,x,y,i);
      const edge=shorelineFactor(x,y);
      for(let sy=0;sy<TEX;sy++){
        for(let sx=0;sx<TEX;sx++){
          const micro=(hash(x*TEX+sx,y*TEX+sy,worldSeed+91)-.5)*9;
          let r=r0+micro,g=g0+micro,b=b0+micro;
          if((t===T.WATER||t===T.SAND)&&edge>.35){
            if(t===T.WATER){r+=edge*14;g+=edge*18;b+=edge*12}
            else{r+=edge*8;g+=edge*6;b-=edge*3}
          }
          const p=((y*TEX+sy)*terrainCanvas.width+(x*TEX+sx))*4;
          d[p]=clamp(r,0,255);d[p+1]=clamp(g,0,255);d[p+2]=clamp(b,0,255);d[p+3]=255;
        }
      }
    }
  }
  tctx.putImageData(image,0,0);

  tctx.save();
  tctx.globalAlpha=.24;
  tctx.fillStyle="#d9efeb";
  for(let y=1;y<WORLD_H-1;y++){
    for(let x=1;x<WORLD_W-1;x++){
      const i=idx(x,y);
      if(terrain[i]===T.WATER&&(nearType(x,y,T.SAND)||nearType(x,y,T.GRASS))){
        if(hash(x,y,worldSeed+200)>.33)tctx.fillRect(x*TEX,y*TEX,TEX,1);
      }
    }
  }
  tctx.restore();
  dirty=false;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showToast(text){
  clearTimeout(toastTimer);
  toast.textContent=text;
  toast.classList.remove("hidden");
  toastTimer=setTimeout(()=>toast.classList.add("hidden"),1200);
}
function addEvent(text,kind="world"){
  events.unshift({day:Math.floor(day),text,kind});
  events=events.slice(0,140);
  historyList.innerHTML=events.map(e=>`<div class="event"><div class="eday">DAY ${e.day}</div><div class="etext">${escapeHtml(e.text)}</div></div>`).join("");
}
function makePerson(name,x,y,sex,age){
  return{
    id:"p"+Date.now()+Math.random(),name,x,y,px:x,py:y,sex,age,
    health:100,hunger:rnd(7,17),thirst:rnd(7,15),energy:rnd(82,100),
    carryFood:2,wood:0,mood:"Curious",goal:"Explore",partner:null,children:[],
    memory:["Entered the Tiny World"],alive:true,dir:1,phase:rnd(0,Math.PI*2),
    skin:rndi(0,3),shirt:rndi(0,5),hair:rndi(0,4),cape:Math.random()<.16
  };
}
function brushNoise(x,y,cx,cy,r){
  return Math.hypot(x-cx,y-cy)/r+(hash(x,y,(tick>>3)%37)-.5)*.38;
}
function spawnCloud(x,y,r){
  clouds.push({x,y,r:Math.max(8,r*.9),life:330,phase:rnd(0,Math.PI*2)});
}
function spawnLightning(x,y){
  for(let i=0;i<28;i++)particles.push({type:"spark",x:x+rnd(-2.5,2.5),y:y+rnd(-2.5,2.5),vx:rnd(-.08,.08),vy:rnd(-.25,.04),life:rndi(8,22)});
}
function spawnChop(x,y){
  for(let i=0;i<7;i++)particles.push({type:"leaf",x:x+rnd(-.5,.5),y:y+rnd(-.4,.4),vx:rnd(-.08,.08),vy:rnd(-.14,-.02),life:rndi(10,25)});
}
function spawnHeal(x,y){
  for(let i=0;i<18;i++)particles.push({type:"heal",x:x+rnd(-1.4,1.4),y:y+rnd(-1.2,1.2),vx:rnd(-.04,.04),vy:rnd(-.12,-.03),life:rndi(18,34)});
}
function paint(cx,cy,r,type,record=true){
  const x0=Math.max(0,Math.floor(cx-r-4)),x1=Math.min(WORLD_W-1,Math.ceil(cx+r+4));
  const y0=Math.max(0,Math.floor(cy-r-4)),y1=Math.min(WORLD_H-1,Math.ceil(cy+r+4));
  for(let y=y0;y<=y1;y++){
    for(let x=x0;x<=x1;x++){
      const n=brushNoise(x,y,cx,cy,r);
      if(n>1)continue;
      const i=idx(x,y),power=Math.max(0,1-n);
      if(type==="land"){
        height[i]=clamp(height[i]+.14+power*.19,.405,.82);
        classify(i);
        if(terrain[i]===T.SAND&&power>.43)terrain[i]=T.GRASS;
      }else if(type==="water"){
        height[i]=clamp(height[i]-.15-power*.23,.05,.38);
        classify(i);food[i]=0;trees[i]=0;
      }else if(type==="forest"&&(terrain[i]===T.GRASS||terrain[i]===T.FOREST)){
        terrain[i]=T.FOREST;moisture[i]=clamp(moisture[i]+.22,0,1);
        if(Math.random()<.7)trees[i]=clamp(trees[i]+1,0,5);
      }else if(type==="food"&&(terrain[i]===T.GRASS||terrain[i]===T.FOREST)){
        if(Math.random()<.12+.45*power)food[i]=clamp(food[i]+1,0,6);
      }else if(type==="rain"){
        wet[i]=255;
        if((terrain[i]===T.GRASS||terrain[i]===T.FOREST)&&Math.random()<.08)food[i]=clamp(food[i]+1,0,6);
      }else if(type==="lightning"&&n<.43){
        trees[i]=Math.max(0,trees[i]-2);food[i]=0;scar[i]=210;
      }
    }
  }
  dirty=true;
  if(type==="rain")spawnCloud(cx,cy,r);
  if(type==="lightning")spawnLightning(cx,cy);
  if(record){
    const messages={
      land:"The Creator raised new land.",
      water:"The Creator reshaped the sea.",
      forest:"A forest spread by divine will.",
      rain:"The Creator summoned rain.",
      lightning:"Lightning tore through the land."
    };
    if(messages[type])addEvent(messages[type],"divine");
  }
}
function generate(){
  worldSeed=rndi(1,999999);
  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const i=idx(x,y),nx=(x-WORLD_W/2)/(WORLD_W/2),ny=(y-WORLD_H/2)/(WORLD_H/2);
      const edge=Math.pow(Math.sqrt(nx*nx+ny*ny),1.15);
      const macro=fbm(x,y,worldSeed);
      const detail=fbm(x+410,y-270,worldSeed+73);
      height[i]=clamp(macro*.94+detail*.18-edge*.235,.04,.98);
      moisture[i]=fbm(x-340,y+570,worldSeed+141);
      classify(i);
      food[i]=terrain[i]===T.GRASS&&hash(x,y,worldSeed+9)>.94?rndi(1,4):0;
      trees[i]=terrain[i]===T.FOREST?rndi(1,4):0;
      wet[i]=0;scar[i]=0;
    }
  }
  let sx=WORLD_W>>1,sy=WORLD_H>>1;
  for(let n=0;n<150;n++){
    const x=clamp(sx+rndi(-55,55),7,WORLD_W-8),y=clamp(sy+rndi(-42,42),7,WORLD_H-8);
    const t=terrain[idx(x,y)];
    if(t===T.GRASS||t===T.FOREST){sx=x;sy=y;break}
  }
  paint(sx,sy,18,"land",false);
  people=[makePerson("Mara",sx-2,sy,"F",24),makePerson("Dren",sx+2,sy,"M",26)];
  people[0].partner=people[1].id;people[1].partner=people[0].id;
  huts=[];events=[];particles=[];clouds=[];day=1;tick=0;camX=sx;camY=sy;zoom=4;dirty=true;selected=null;
  clampCamera();
  addEvent("Mara and Dren entered an untouched world.");
  updateUI();
  showToast("A new world has formed");
}
function passable(x,y){
  if(x<1||y<1||x>=WORLD_W-1||y>=WORLD_H-1)return false;
  const t=terrain[idx(x,y)];
  return t!==T.DEEP&&t!==T.WATER&&t!==T.MOUNTAIN&&t!==T.SNOW;
}
function wander(p){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]];
  const d=dirs[rndi(0,dirs.length-1)],nx=p.x+d[0],ny=p.y+d[1];
  if(passable(nx,ny)){p.dir=d[0]>=0?1:-1;p.x=nx;p.y=ny}
}
function nearest(p,fn,max=38){
  let best=null,bd=1e9;
  for(let y=Math.max(0,p.y-max);y<=Math.min(WORLD_H-1,p.y+max);y+=2){
    for(let x=Math.max(0,p.x-max);x<=Math.min(WORLD_W-1,p.x+max);x+=2){
      const d=Math.abs(x-p.x)+Math.abs(y-p.y);
      if(d<bd&&fn(idx(x,y),x,y)){bd=d;best={x,y}}
    }
  }
  return best;
}
function moveToward(p,t){
  if(!t){wander(p);return}
  const dx=Math.sign(t.x-p.x),dy=Math.sign(t.y-p.y),opts=[];
  if(dx&&passable(p.x+dx,p.y))opts.push([p.x+dx,p.y]);
  if(dy&&passable(p.x,p.y+dy))opts.push([p.x,p.y+dy]);
  if(dx&&dy&&passable(p.x+dx,p.y+dy))opts.push([p.x+dx,p.y+dy]);
  if(opts.length){
    const q=opts[rndi(0,opts.length-1)];
    p.dir=q[0]>=p.x?1:-1;p.x=q[0];p.y=q[1];
  }else wander(p);
}
function nearWater(p){
  for(let y=p.y-2;y<=p.y+2;y++){
    for(let x=p.x-2;x<=p.x+2;x++){
      if(x<0||y<0||x>=WORLD_W||y>=WORLD_H)continue;
      const t=terrain[idx(x,y)];
      if(t===T.WATER||t===T.DEEP)return true;
    }
  }
  return false;
}
function think(p){
  if(!p.alive)return;
  p.px+=(p.x-p.px)*.22;p.py+=(p.y-p.py)*.22;p.phase+=.22;
  p.hunger+=.032;p.thirst+=.046;p.energy-=.017;p.age+=1/10000;
  if(p.hunger>90||p.thirst>93)p.health-=.10;
  else if(p.health<100&&p.hunger<55&&p.thirst<55)p.health+=.015;
  if(p.health<=0){p.alive=false;addEvent(p.name+" died.","citizen");return}
  if(p.thirst>58){
    p.goal="Find water";p.mood=p.thirst>82?"Desperate":"Thirsty";
    if(nearWater(p))p.thirst=clamp(p.thirst-19,0,100);
    else moveToward(p,nearest(p,i=>terrain[i]===T.WATER));
    return;
  }
  if(p.hunger>58){
    p.goal="Find food";p.mood=p.hunger>82?"Starving":"Hungry";
    if(p.carryFood>0){p.carryFood--;p.hunger=clamp(p.hunger-34,0,100);return}
    const i=idx(p.x,p.y);
    if(food[i]){food[i]--;p.carryFood++;p.hunger-=18;dirty=true;return}
    moveToward(p,nearest(p,i=>food[i]>0));return;
  }
  if(p.energy<24){p.goal="Rest";p.mood="Tired";p.energy=clamp(p.energy+.55,0,100);return}
  const i=idx(p.x,p.y);
  if(trees[i]>0&&p.wood<10&&Math.random()<.38){
    trees[i]--;p.wood++;p.goal="Gather wood";p.mood="Working";dirty=true;spawnChop(p.x,p.y);return;
  }
  if(food[i]>0&&p.carryFood<4&&Math.random()<.40){
    food[i]--;p.carryFood++;p.goal="Gather food";dirty=true;return;
  }
  if(p.wood>=8&&huts.length<Math.max(1,Math.ceil(people.filter(q=>q.alive).length/3))&&!huts.some(h=>Math.hypot(h.x-p.x,h.y-p.y)<5)){
    p.wood-=8;huts.push({x:p.x,y:p.y,age:0,smoke:rnd(0,Math.PI*2),owner:p.id});
    p.memory.unshift("Built a shelter");addEvent(p.name+" built a primitive shelter.","building");return;
  }
  if(Math.random()<.17){
    const target=p.wood<7?nearest(p,i=>trees[i]>0,27):nearest(p,i=>food[i]>0,27);
    if(target){p.goal=p.wood<7?"Seek forest":"Seek food";moveToward(p,target)}
    else wander(p);
  }else if(Math.random()<.09)wander(p);
}
function simulate(){
  if(paused)return;
  const loops=speed===1?1:speed===2?2:5;
  for(let l=0;l<loops;l++){
    tick++;day+=.008;
    people.forEach(think);
    huts.forEach(h=>h.age++);
    if(tick%280===0){
      for(let n=0;n<280;n++){
        const x=rndi(0,WORLD_W-1),y=rndi(0,WORLD_H-1),i=idx(x,y);
        if(terrain[i]===T.GRASS&&food[i]<4&&Math.random()<.16)food[i]++;
        if(terrain[i]===T.FOREST&&trees[i]<4&&Math.random()<.20)trees[i]++;
        if(wet[i])wet[i]--;
        if(scar[i])scar[i]--;
      }
      dirty=true;
    }
  }
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;p.vy+=p.type==="leaf"?.006:0});
  particles=particles.filter(p=>p.life>0);
  clouds.forEach(c=>{c.life--;c.phase+=.015;c.x+=.015});
  clouds=clouds.filter(c=>c.life>0);
  updateUI();
}
function cameraScale(){
  return zoom*displayScale;
}
function worldToScreen(x,y){
  const s=cameraScale();
  return{x:(x-camX)*s+canvas.width/2,y:(y-camY)*s+canvas.height/2};
}
function screenToWorld(x,y){
  const s=cameraScale();
  return{x:(x-canvas.width/2)/s+camX,y:(y-canvas.height/2)/s+camY};
}
function viewportWorldSize(){
  const s=cameraScale();
  return{w:canvas.width/s,h:canvas.height/s};
}
function clampCamera(){
  const v=viewportWorldSize();
  if(v.w>=WORLD_W) camX=WORLD_W/2;
  else camX=clamp(camX,v.w/2,WORLD_W-v.w/2);
  if(v.h>=WORLD_H) camY=WORLD_H/2;
  else camY=clamp(camY,v.h/2,WORLD_H-v.h/2);
}
function visibleBounds(pad=6){
  const v=viewportWorldSize();
  return{
    l:camX-v.w/2-pad,
    r:camX+v.w/2+pad,
    t:camY-v.h/2-pad,
    b:camY+v.h/2+pad
  };
}
function drawWaterAnimation(){
  const b=visibleBounds(2),step=zoom<3?5:zoom<5?3:2;
  ctx.save();ctx.globalAlpha=.23;ctx.strokeStyle="#d8f0f0";ctx.lineWidth=Math.max(1,zoom*.12);
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const t=terrain[idx(x,y)];if(t!==T.WATER&&t!==T.DEEP)continue;
      const h=hash(x,y,worldSeed+331);if(h<.58)continue;
      const s=worldToScreen(x+.5,y+.5),wob=Math.sin(tick*.065+x*.55+y*.37)*zoom*.22,len=zoom*(1.1+h*1.4);
      ctx.beginPath();ctx.moveTo(s.x-len/2,s.y+wob);ctx.lineTo(s.x+len/2,s.y+wob);ctx.stroke();
    }
  }
  ctx.restore();
}
function drawGrassDetails(){
  const b=visibleBounds(3),step=zoom<4?3:1;
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y),t=terrain[i];if(t!==T.GRASS&&t!==T.FOREST)continue;
      const s=worldToScreen(x+.5,y+.5),h=hash(x,y,worldSeed+411);
      if(t===T.GRASS&&h>.86&&zoom>=3){
        ctx.fillStyle=h>.94?"#d8c95f":"#4d813e";
        ctx.fillRect(s.x,s.y,Math.max(1,zoom*.18),Math.max(1,zoom*.35));
      }
      if(food[i]>0&&h>.48){
        ctx.fillStyle="#c74443";
        const rr=Math.max(1.5,zoom*.32);
        ctx.beginPath();ctx.arc(s.x-rr*.6,s.y,rr,0,Math.PI*2);ctx.arc(s.x+rr*.6,s.y-rr*.3,rr*.9,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#406a36";ctx.fillRect(s.x-1,s.y-rr*1.8,2,rr);
      }
    }
  }
}
function drawTree(x,y){
  const s=worldToScreen(x+.5,y+.55),z=clamp(zoom,2.2,7);
  if(s.x<-30||s.y<-40||s.x>canvas.width+30||s.y>canvas.height+30)return;
  const sway=Math.sin(tick*.025+x*.7+y*.31)*z*.08;
  ctx.fillStyle="rgba(0,0,0,.22)";
  ctx.beginPath();ctx.ellipse(s.x+z*.25,s.y+z*1.25,z*1.05,z*.38,-.1,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#68482d";ctx.fillRect(s.x-z*.2,s.y-z*.05,z*.42,z*1.35);
  ctx.fillStyle=hash(x,y,worldSeed+501)>.5?"#2d6335":"#2a5b32";
  ctx.beginPath();ctx.arc(s.x+sway,s.y-z*.55,z*1.05,0,Math.PI*2);ctx.arc(s.x-z*.65+sway,s.y-z*.12,z*.72,0,Math.PI*2);ctx.arc(s.x+z*.67+sway,s.y-z*.12,z*.75,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=hash(x,y,worldSeed+502)>.5?"#4b8b4c":"#438244";
  ctx.beginPath();ctx.arc(s.x-z*.28+sway,s.y-z*.75,z*.55,0,Math.PI*2);ctx.arc(s.x+z*.28+sway,s.y-z*.65,z*.48,0,Math.PI*2);ctx.fill();
}
function drawMountains(){
  const b=visibleBounds(4),step=zoom<4?2:1;
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y),t=terrain[i];if(t!==T.MOUNTAIN&&t!==T.SNOW)continue;if(hash(x,y,worldSeed+610)<.38)continue;
      const s=worldToScreen(x+.5,y+.7),z=clamp(zoom,2,6.5)*(t===T.SNOW?1.05:.9);
      ctx.fillStyle="rgba(0,0,0,.18)";ctx.beginPath();ctx.ellipse(s.x+z*.3,s.y+z*.8,z*.9,z*.25,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=t===T.SNOW?"#aeb6b1":"#686e6b";ctx.beginPath();ctx.moveTo(s.x-z,s.y+z*.7);ctx.lineTo(s.x,s.y-z*1.25);ctx.lineTo(s.x+z,s.y+z*.7);ctx.fill();
      ctx.fillStyle=t===T.SNOW?"#cfd6d1":"#858b87";ctx.beginPath();ctx.moveTo(s.x,s.y-z*1.25);ctx.lineTo(s.x+z,s.y+z*.7);ctx.lineTo(s.x+z*.22,s.y+z*.55);ctx.fill();
      ctx.fillStyle="#e7ebe7";ctx.beginPath();ctx.moveTo(s.x,s.y-z*1.25);ctx.lineTo(s.x-z*.25,s.y-z*.68);ctx.lineTo(s.x+z*.05,s.y-z*.82);ctx.lineTo(s.x+z*.28,s.y-z*.55);ctx.fill();
    }
  }
}
function drawForest(){
  const b=visibleBounds(4),step=zoom<3?3:zoom<4?2:1;
  for(let y=Math.max(0,Math.floor(b.t));y<Math.min(WORLD_H,Math.ceil(b.b));y+=step){
    for(let x=Math.max(0,Math.floor(b.l));x<Math.min(WORLD_W,Math.ceil(b.r));x+=step){
      const i=idx(x,y);if(terrain[i]!==T.FOREST||trees[i]===0)continue;
      if(hash(x,y,worldSeed+88)>.31)drawTree(x,y);
    }
  }
}
function drawHut(h){
  const s=worldToScreen(h.x,h.y),z=clamp(zoom,3,7);
  if(s.x<-50||s.y<-60||s.x>canvas.width+50||s.y>canvas.height+50)return;
  const stage=h.age<140?0:1;
  ctx.fillStyle="rgba(0,0,0,.27)";ctx.beginPath();ctx.ellipse(s.x+z*.4,s.y+z*1.5,z*2,z*.55,-.05,0,Math.PI*2);ctx.fill();
  if(stage===0){
    ctx.fillStyle="#8c653e";ctx.fillRect(s.x-z*1.25,s.y-z*.35,z*2.5,z*1.9);
    ctx.fillStyle="#c29555";ctx.beginPath();ctx.moveTo(s.x-z*1.65,s.y-z*.25);ctx.lineTo(s.x,s.y-z*1.8);ctx.lineTo(s.x+z*1.65,s.y-z*.25);ctx.fill();
  }else{
    ctx.fillStyle="#8b633d";ctx.fillRect(s.x-z*1.5,s.y-z*.55,z*3,z*2.15);
    ctx.fillStyle="#5f412d";ctx.fillRect(s.x-z*1.55,s.y-z*.52,z*.2,z*2.1);ctx.fillRect(s.x+z*1.35,s.y-z*.52,z*.2,z*2.1);
    ctx.fillStyle="#c39a54";ctx.beginPath();ctx.moveTo(s.x-z*1.9,s.y-z*.48);ctx.lineTo(s.x,s.y-z*2.05);ctx.lineTo(s.x+z*1.9,s.y-z*.48);ctx.fill();
    ctx.strokeStyle="#856634";ctx.lineWidth=Math.max(1,z*.12);
    for(let n=-1;n<=1;n++){ctx.beginPath();ctx.moveTo(s.x-z*1.45,s.y-z*.25+n*z*.45);ctx.lineTo(s.x+z*1.45,s.y-z*.25+n*z*.45);ctx.stroke()}
  }
  ctx.fillStyle="#4f3828";ctx.fillRect(s.x-z*.35,s.y+z*.48,z*.72,z*1.15);
  ctx.fillStyle="#e6bc68";ctx.fillRect(s.x+z*.68,s.y+z*.05,z*.42,z*.42);
  h.smoke+=.035;ctx.fillStyle="rgba(218,222,214,.22)";
  for(let n=0;n<3;n++){ctx.beginPath();ctx.arc(s.x+z*1.2+Math.sin(h.smoke+n)*z*.25,s.y-z*1.85-n*z*.9,z*(.28+n*.11),0,Math.PI*2);ctx.fill()}
}
function drawPerson(p){
  if(!p.alive)return;
  const s=worldToScreen(p.px,p.py),z=clamp(zoom,3,7);
  if(s.x<-35||s.y<-45||s.x>canvas.width+35||s.y>canvas.height+45)return;
  const bob=Math.sin(p.phase)*z*.10;
  const skins=["#f0c18b","#d9a06d","#b9784f","#7d4e35"],shirts=["#775a42","#4c7280","#737846","#7e5b67","#41685c","#6f5b83"],hairs=["#36251d","#65452f","#1e1c1b","#956f3d","#6d342c"];
  ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(s.x+z*.18,s.y+z*1.55,z*.85,z*.32,0,0,Math.PI*2);ctx.fill();
  if(p.cape){ctx.fillStyle="rgba(72,53,50,.9)";ctx.beginPath();ctx.moveTo(s.x-p.dir*z*.35,s.y+bob);ctx.lineTo(s.x-p.dir*z*.95,s.y+z*1.15);ctx.lineTo(s.x,s.y+z*.9);ctx.fill()}
  ctx.fillStyle=shirts[p.shirt];ctx.fillRect(s.x-z*.68,s.y-z*.15+bob,z*1.36,z*1.55);
  ctx.fillStyle=skins[p.skin];ctx.fillRect(s.x-z*.5,s.y-z*1.2+bob,z,z);
  ctx.fillStyle=hairs[p.hair];ctx.fillRect(s.x-z*.53,s.y-z*1.35+bob,z*1.06,z*.38);
  if(p.hair===1||p.hair===4)ctx.fillRect(s.x+(p.dir>0?-z*.52:z*.28),s.y-z*1.1+bob,z*.25,z*.72);
  ctx.fillStyle="#27211e";ctx.fillRect(s.x+(p.dir>0?z*.17:-z*.34),s.y-z*.82+bob,Math.max(1,z*.16),Math.max(1,z*.16));
  ctx.fillStyle="#4b382d";ctx.fillRect(s.x-z*.54,s.y+z*1.1+bob,z*.36,z*.7);ctx.fillRect(s.x+z*.18,s.y+z*1.1-bob,z*.36,z*.7);
  if(p.id===selected){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,z*2.15,0,Math.PI*2);ctx.stroke()}
  if(zoom>=6){
    ctx.font=`600 ${Math.round(z*1.35)}px -apple-system,system-ui`;ctx.textAlign="center";ctx.textBaseline="bottom";
    ctx.fillStyle="rgba(0,0,0,.6)";ctx.fillText(p.name,s.x+1,s.y-z*2.15+1);ctx.fillStyle="#fff";ctx.fillText(p.name,s.x,s.y-z*2.15);
  }
}
function drawParticles(){
  for(const p of particles){
    const s=worldToScreen(p.x,p.y),q=Math.max(1.5,zoom*.32);
    ctx.fillStyle=p.type==="spark"?"#fff0a4":p.type==="heal"?"#b9efb1":"#69a95b";
    ctx.fillRect(s.x-q/2,s.y-q/2,q,q);
  }
}
function drawClouds(){
  for(const c of clouds){
    const s=worldToScreen(c.x,c.y),z=Math.max(10,c.r*zoom*.55);
    if(s.x<-z*2||s.y<-z*2||s.x>canvas.width+z*2||s.y>canvas.height+z*2)continue;
    ctx.fillStyle="rgba(30,42,47,.16)";ctx.beginPath();ctx.ellipse(s.x+z*.4,s.y+z*.85,z*1.9,z*.65,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(198,209,210,.48)";
    for(let n=0;n<5;n++){ctx.beginPath();ctx.arc(s.x+(n-2)*z*.46,s.y+Math.sin(c.phase+n)*z*.13,z*(.52+(n%2)*.12),0,Math.PI*2);ctx.fill()}
    ctx.strokeStyle="rgba(176,214,232,.43)";ctx.lineWidth=Math.max(1,zoom*.12);
    for(let n=0;n<14;n++){
      const rx=s.x-z*1.4+(n/13)*z*2.8+Math.sin(tick*.1+n)*z*.08;
      ctx.beginPath();ctx.moveTo(rx,s.y+z*.35);ctx.lineTo(rx-z*.12,s.y+z*.98);ctx.stroke();
    }
  }
}
function drawLighting(){
  const cycle=(tick%2600)/2600;
  let alpha=0;
  if(cycle<.18)alpha=.36*(1-cycle/.18);
  else if(cycle>.78)alpha=.36*((cycle-.78)/.22);
  if(alpha>0){ctx.fillStyle=`rgba(10,22,48,${alpha})`;ctx.fillRect(0,0,canvas.width,canvas.height)}
  const dawn=Math.max(0,1-Math.abs(cycle-.20)/.06),dusk=Math.max(0,1-Math.abs(cycle-.76)/.06),warm=Math.max(dawn,dusk);
  if(warm>0){ctx.fillStyle=`rgba(140,72,40,${warm*.11})`;ctx.fillRect(0,0,canvas.width,canvas.height)}
}
function drawVignette(){
  const g=ctx.createRadialGradient(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)*.30,canvas.width/2,canvas.height/2,Math.max(canvas.width,canvas.height)*.66);
  g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,.16)");
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
}
function render(){
  if(dirty)rebuildTerrain();
  clampCamera();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // The area outside the finite generated map is ocean.
  // Never ask drawImage() to sample outside terrainCanvas; Safari can clip
  // that source rectangle and make the world appear to stretch/morph.
  ctx.fillStyle="#1c4f6f";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const s=cameraScale();
  const v=viewportWorldSize();
  const viewLeft=camX-v.w/2;
  const viewTop=camY-v.h/2;

  const worldLeft=Math.max(0,viewLeft);
  const worldTop=Math.max(0,viewTop);
  const worldRight=Math.min(WORLD_W,viewLeft+v.w);
  const worldBottom=Math.min(WORLD_H,viewTop+v.h);

  if(worldRight>worldLeft && worldBottom>worldTop){
    const sw=(worldRight-worldLeft)*TEX;
    const sh=(worldBottom-worldTop)*TEX;
    const dx=(worldLeft-viewLeft)*s;
    const dy=(worldTop-viewTop)*s;
    const dw=(worldRight-worldLeft)*s;
    const dh=(worldBottom-worldTop)*s;

    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(
      terrainCanvas,
      worldLeft*TEX,worldTop*TEX,sw,sh,
      dx,dy,dw,dh
    );
  }

  drawWaterAnimation();drawGrassDetails();drawMountains();drawForest();
  huts.forEach(drawHut);
  people.slice().sort((a,b)=>a.py-b.py).forEach(drawPerson);
  drawParticles();drawClouds();drawLighting();drawVignette();
}
function showCitizen(p){
  selected=p.id;citizenName.textContent=p.name;citizenSub.textContent=Math.floor(p.age)+" · "+(p.sex==="F"?"Female":"Male");
  citizenBody.innerHTML=`
    <div class="stats">
      <div class="stat">❤️ Health<b>${Math.round(p.health)}%</b></div>
      <div class="stat">⚡ Energy<b>${Math.round(p.energy)}%</b></div>
      <div class="stat">🍖 Hunger<b>${Math.round(p.hunger)}%</b></div>
      <div class="stat">💧 Thirst<b>${Math.round(p.thirst)}%</b></div>
    </div>
    <div class="citizenRow"><b>Goal:</b> ${escapeHtml(p.goal)}<br><b>Mood:</b> ${escapeHtml(p.mood)}<br><b>Food:</b> ${p.carryFood} · <b>Wood:</b> ${p.wood}</div>
    <div class="memory">Latest memory: ${escapeHtml(p.memory[0]||"None")}</div>`;
  citizen.classList.remove("hidden");
}
function applyTool(wx,wy,continuous=false){
  wx=Math.round(wx);wy=Math.round(wy);
  if(wx<0||wy<0||wx>=WORLD_W||wy>=WORLD_H)return;
  if(tool==="inspect"){
    if(continuous)return;
    const p=people.filter(q=>q.alive).sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];
    if(p&&Math.hypot(p.x-wx,p.y-wy)<5)showCitizen(p);
    return;
  }
  if(tool==="heal"){
    const p=people.filter(q=>q.alive).sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];
    if(p&&Math.hypot(p.x-wx,p.y-wy)<brush){
      p.health=100;p.hunger=clamp(p.hunger-20,0,100);p.thirst=clamp(p.thirst-20,0,100);
      p.memory.unshift("Touched by divine healing");spawnHeal(p.x,p.y);
      if(!continuous)addEvent(p.name+" was healed.","divine");
    }
    return;
  }
  paint(wx,wy,brush,tool,!continuous);
  if(tool==="rain")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush)p.thirst=clamp(p.thirst-18,0,100)});
  if(tool==="lightning")people.forEach(p=>{if(p.alive&&Math.hypot(p.x-wx,p.y-wy)<brush*.35){p.health-=30;p.memory.unshift("Survived divine lightning")}});
}
function updateUI(){
  const alive=people.filter(p=>p.alive).length;
  popEl.textContent=alive;dayEl.textContent=Math.floor(day);
  eraEl.textContent=huts.length>=7?"Tribal Village":huts.length>=3?"Growing Camp":huts.length?"Early Settlement":"Primitive";
  pauseBtn.textContent=paused?"▶":"⏸";speedBtn.textContent="×"+speed;
  status.textContent=tool==="inspect"?"Inspect · drag map · pinch to zoom":`${tool[0].toUpperCase()+tool.slice(1)} · brush ${brush} · drag to paint`;
  if(selected){
    const p=people.find(q=>q.id===selected);
    if(p&&!citizen.classList.contains("hidden"))showCitizen(p);
  }
}
function resizeCanvas(){
  const rect=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  displayScale=dpr;
  const w=Math.max(320,Math.round(rect.width*dpr));
  const h=Math.max(320,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){
    canvas.width=w;
    canvas.height=h;
  }
  clampCamera();
}
function canvasPoint(e){
  const r=canvas.getBoundingClientRect();
  return{x:(e.clientX-r.left)/r.width*canvas.width,y:(e.clientY-r.top)/r.height*canvas.height};
}
function centerOnSettlement(){
  const live=people.filter(p=>p.alive);
  if(live.length){
    camX=live.reduce((s,p)=>s+p.x,0)/live.length;
    camY=live.reduce((s,p)=>s+p.y,0)/live.length;
  }else if(huts.length){
    camX=huts.reduce((s,h)=>s+h.x,0)/huts.length;
    camY=huts.reduce((s,h)=>s+h.y,0)/huts.length;
  }
  clampCamera();
}

canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,canvasPoint(e));
  if(pointers.size===1){
    const p=canvasPoint(e);last=p;dragging=false;const w=screenToWorld(p.x,p.y);
    if(tool!=="inspect")applyTool(w.x,w.y,true);
  }else if(pointers.size===2){
    const a=[...pointers.values()];pinchStart={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),z:zoom};
  }
});
canvas.addEventListener("pointermove",e=>{
  const p=canvasPoint(e);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);
  if(pointers.size===2&&pinchStart){
    const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    zoom=clamp(pinchStart.z*(d/pinchStart.d),2,10);clampCamera();return;
  }
  if(!pointers.has(e.pointerId)||pointers.size!==1)return;
  const dx=p.x-last.x,dy=p.y-last.y;if(Math.abs(dx)+Math.abs(dy)>2)dragging=true;
  if(tool==="inspect"){
    const s=cameraScale();
    camX-=dx/s;
    camY-=dy/s;
    clampCamera();
  }else if(Date.now()-paintStamp>24){
    const w=screenToWorld(p.x,p.y);applyTool(w.x,w.y,true);paintStamp=Date.now();
  }
  last=p;
});
canvas.addEventListener("pointerup",e=>{
  const p=canvasPoint(e),w=screenToWorld(p.x,p.y);
  if(pointers.size===1){
    if(tool==="inspect"&&!dragging)applyTool(w.x,w.y,false);
    else if(tool!=="inspect")applyTool(w.x,w.y,false);
  }
  pointers.delete(e.pointerId);pinchStart=null;
});
canvas.addEventListener("pointercancel",e=>{pointers.delete(e.pointerId);pinchStart=null});

document.querySelectorAll(".tool[data-tool]").forEach(b=>b.addEventListener("click",()=>{
  tool=b.dataset.tool;
  document.querySelectorAll(".tool[data-tool]").forEach(x=>x.classList.toggle("active",x===b));
  brushPanel.classList.add("hidden");updateUI();
}));
document.querySelectorAll(".brush").forEach(b=>b.addEventListener("click",()=>{
  brush=Number(b.dataset.size);brushLabel.textContent=brush;
  document.querySelectorAll(".brush").forEach(x=>x.classList.toggle("active",x===b));
  brushPanel.classList.add("hidden");updateUI();
}));
brushBtn.addEventListener("click",()=>brushPanel.classList.toggle("hidden"));
document.getElementById("historyBtn").addEventListener("click",()=>{
  citizen.classList.add("hidden");brushPanel.classList.add("hidden");history.classList.toggle("hidden");
});
document.getElementById("centerBtn").addEventListener("click",()=>{centerOnSettlement();showToast("Centered on settlement")});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).classList.add("hidden")));
pauseBtn.addEventListener("click",()=>{paused=!paused;updateUI()});
speedBtn.addEventListener("click",()=>{speed=speed===1?2:speed===2?5:1;updateUI()});
window.addEventListener("resize",resizeCanvas);
window.addEventListener("orientationchange",()=>setTimeout(resizeCanvas,120));

generate();
resizeCanvas();

function frame(now){
  if(now-lastSim>=75){simulate();lastSim=now}
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setTimeout(()=>document.getElementById("splash").classList.add("hide"),650);

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("service-worker.js").catch(()=>{});
}
})();
