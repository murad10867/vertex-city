(() => {
  'use strict';
  const canvas=document.getElementById('gameCanvas'),ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('score'),missionEl=document.getElementById('mission'),timeEl=document.getElementById('time'),bestEl=document.getElementById('best');
  const overlay=document.getElementById('overlay'),overlayIcon=document.getElementById('overlayIcon'),overlayTitle=document.getElementById('overlayTitle'),overlayText=document.getElementById('overlayText');
  const startBtn=document.getElementById('startBtn'),restartBtn=document.getElementById('restartBtn');
  const keys={}; const car={x:450,y:520,w:34,h:56,speed:215,angle:0}; let target={x:450,y:100}; let score=0,mission=1,timeLeft=90,running=false,last=0;
  const roadW=105;
  const roadXs=[150,450,750],roadYs=[120,325,530];
  const buildings=[
    {x:0,y:0,w:95,h:75,c:'#34506a'},{x:210,y:0,w:185,h:75,c:'#5e475f'},{x:505,y:0,w:190,h:75,c:'#3d5d4c'},{x:810,y:0,w:90,h:75,c:'#5c5140'},
    {x:0,y:175,w:95,h:95,c:'#4d5f72'},{x:210,y:175,w:185,h:95,c:'#6b4c43'},{x:505,y:175,w:190,h:95,c:'#455b72'},{x:810,y:175,w:90,h:95,c:'#506341'},
    {x:0,y:380,w:95,h:95,c:'#4a6170'},{x:210,y:380,w:185,h:95,c:'#614b6e'},{x:505,y:380,w:190,h:95,c:'#3f6254'},{x:810,y:380,w:90,h:95,c:'#675744'},
    {x:0,y:585,w:95,h:65,c:'#46596a'},{x:210,y:585,w:185,h:65,c:'#584d6f'},{x:505,y:585,w:190,h:65,c:'#476551'},{x:810,y:585,w:90,h:65,c:'#6a5544'}
  ];

  function hud(){scoreEl.textContent=Math.floor(score);missionEl.textContent=mission;timeEl.textContent=Math.max(0,Math.ceil(timeLeft));bestEl.textContent=localStorage.getItem('vertexCityBest')||'0'}
  function showOverlay(icon,title,text,button,fn){overlayIcon.textContent=icon;overlayTitle.textContent=title;overlayText.textContent=text;startBtn.textContent=button;startBtn.onclick=fn;overlay.classList.add('show')}
  function randomTarget(){const choices=[];for(const x of roadXs)for(const y of roadYs)choices.push({x,y});let next=choices[Math.floor(Math.random()*choices.length)];while(Math.hypot(next.x-car.x,next.y-car.y)<150)next=choices[Math.floor(Math.random()*choices.length)];target=next}
  function reset(){running=false;car.x=450;car.y=530;car.angle=0;score=0;mission=1;timeLeft=90;randomTarget();hud();showOverlay('🚕','جاهز للمدينة؟','نفذ أكبر عدد من التوصيلات خلال 90 ثانية.','ابدأ',start);draw()}
  function start(){overlay.classList.remove('show');running=true;last=performance.now();requestAnimationFrame(loop)}
  function finish(){running=false;const best=Number(localStorage.getItem('vertexCityBest')||0);if(score>best)localStorage.setItem('vertexCityBest',String(Math.floor(score)));hud();showOverlay('🏙️','انتهى الوقت','أنجزت '+(mission-1)+' مهمة. نتيجتك: '+Math.floor(score),'العب مرة ثانية',()=>{reset();start()})}
  function onRoad(x,y){const onV=roadXs.some(rx=>Math.abs(x-rx)<=roadW/2-12);const onH=roadYs.some(ry=>Math.abs(y-ry)<=roadW/2-12);return onV||onH}
  function update(dt){
    timeLeft-=dt;if(timeLeft<=0){finish();return}
    let dx=0,dy=0;if(keys.ArrowLeft||keys.a)dx--;if(keys.ArrowRight||keys.d)dx++;if(keys.ArrowUp||keys.w)dy--;if(keys.ArrowDown||keys.s)dy++;
    if(dx||dy){const m=Math.hypot(dx,dy),nx=car.x+dx/m*car.speed*dt,ny=car.y+dy/m*car.speed*dt;if(onRoad(nx,ny)){car.x=nx;car.y=ny;car.angle=Math.atan2(dy,dx)+Math.PI/2}}
    car.x=Math.max(20,Math.min(canvas.width-20,car.x));car.y=Math.max(20,Math.min(canvas.height-20,car.y));
    if(Math.hypot(car.x-target.x,car.y-target.y)<34){score+=100+Math.ceil(timeLeft);mission++;randomTarget()}
    score+=dt*2;hud()
  }
  function drawBuilding(b){
    ctx.fillStyle=b.c;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle='rgba(255,225,120,.6)';for(let y=b.y+14;y<b.y+b.h-8;y+=24)for(let x=b.x+12;x<b.x+b.w-10;x+=26)ctx.fillRect(x,y,9,10)
  }
  function drawRoads(){
    ctx.fillStyle='#2d3236';roadXs.forEach(x=>ctx.fillRect(x-roadW/2,0,roadW,canvas.height));roadYs.forEach(y=>ctx.fillRect(0,y-roadW/2,canvas.width,roadW));
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=3;ctx.setLineDash([18,18]);roadXs.forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()});roadYs.forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()});ctx.setLineDash([])
  }
  function drawTarget(){
    ctx.save();ctx.translate(target.x,target.y);const pulse=16+Math.sin(performance.now()/180)*4;ctx.strokeStyle='#ffd447';ctx.lineWidth=4;ctx.shadowColor='#ffd447';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,pulse,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffd447';ctx.font='bold 24px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',0,1);ctx.restore()
  }
  function drawCar(){
    ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle);ctx.fillStyle='#ffb22d';ctx.shadowColor='#ffb22d';ctx.shadowBlur=14;ctx.beginPath();ctx.roundRect(-car.w/2,-car.h/2,car.w,car.h,8);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#101820';ctx.fillRect(-car.w*.3,-car.h*.23,car.w*.6,14);ctx.fillRect(-car.w*.3,car.h*.06,car.w*.6,14);ctx.fillStyle='#fff1bd';ctx.fillRect(-car.w*.35,-car.h/2+4,7,8);ctx.fillRect(car.w*.35-7,-car.h/2+4,7,8);ctx.restore()
  }
  function draw(){ctx.fillStyle='#24462f';ctx.fillRect(0,0,canvas.width,canvas.height);buildings.forEach(drawBuilding);drawRoads();drawTarget();drawCar()}
  function loop(now){if(!running)return;const dt=Math.min((now-last)/1000,.033);last=now;update(dt);draw();requestAnimationFrame(loop)}
  document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();keys[e.key]=true;keys[e.key.toLowerCase()]=true},{passive:false});
  document.addEventListener('keyup',e=>{keys[e.key]=false;keys[e.key.toLowerCase()]=false});
  document.querySelectorAll('[data-dir]').forEach(b=>{const map={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'},k=map[b.dataset.dir];b.addEventListener('pointerdown',()=>keys[k]=true);['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false))});
  restartBtn.addEventListener('click',reset);reset();
})();