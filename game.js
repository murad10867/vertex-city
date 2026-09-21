(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const missionEl = document.getElementById('mission');
  const timeEl = document.getElementById('time');
  const speedEl = document.getElementById('speed');
  const bestEl = document.getElementById('best');

  const overlay = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  const W = canvas.width;
  const H = canvas.height;
  const HORIZON = 178;
  const ROAD_NEAR = 430;
  const ROAD_FAR = 72;
  const VIEW_DISTANCE = 1900;

  const keys = {};
  const lanes = [-0.62, 0, 0.62];

  let running = false;
  let last = 0;
  let speed = 0;
  let playerX = 0;
  let score = 0;
  let mission = 1;
  let timeLeft = 90;
  let distance = 0;
  let shake = 0;
  let target = { z: 760, x: 0 };
  let traffic = [];
  let buildings = [];
  let stars = [];

  function randomLane() {
    return lanes[Math.floor(Math.random() * lanes.length)];
  }

  function makeWorld() {
    buildings = [];
    for (let z = 260; z < 2700; z += 125) {
      const h = 70 + Math.random() * 180;
      buildings.push({
        z: z + Math.random() * 50,
        side: Math.random() < 0.5 ? -1 : 1,
        offset: 1.38 + Math.random() * 0.55,
        width: 0.33 + Math.random() * 0.24,
        height: h,
        color: ['#405b72','#69506a','#496657','#725b46','#4f5578'][Math.floor(Math.random()*5)]
      });
    }

    stars = Array.from({ length: 65 }, () => ({
      x: Math.random() * W,
      y: Math.random() * 125,
      r: Math.random() * 1.2 + .3,
      a: Math.random() * .45 + .12
    }));

    traffic = [];
    for (let i = 0; i < 10; i++) {
      traffic.push(makeTraffic(500 + i * 180 + Math.random() * 120));
    }
  }

  function makeTraffic(z) {
    return {
      z,
      x: randomLane(),
      speed: 120 + Math.random() * 105,
      color: ['#ff5b68','#3ec8ff','#9a79ff','#5ee69a','#ffd45e'][Math.floor(Math.random()*5)]
    };
  }

  function showOverlay(icon, title, text, button, fn) {
    overlayIcon.textContent = icon;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    startBtn.onclick = fn;
    overlay.classList.add('show');
  }

  function hud() {
    scoreEl.textContent = Math.floor(score);
    missionEl.textContent = mission;
    timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
    speedEl.textContent = Math.round(speed);
    bestEl.textContent = localStorage.getItem('vertexCity3DBest') || '0';
  }

  function reset() {
    running = false;
    speed = 0;
    playerX = 0;
    score = 0;
    mission = 1;
    timeLeft = 90;
    distance = 0;
    shake = 0;
    target = { z: 760, x: randomLane() };
    makeWorld();
    hud();
    showOverlay(
      '🏎️',
      'جاهز لـ Vertex City 3D؟',
      'قد داخل المدينة، تجنب السيارات، ومر من بوابات المهمات.',
      'ابدأ القيادة',
      start
    );
    draw();
  }

  function start() {
    overlay.classList.remove('show');
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function finish() {
    running = false;
    const finalScore = Math.floor(score);
    const best = Number(localStorage.getItem('vertexCity3DBest') || 0);
    if (finalScore > best) localStorage.setItem('vertexCity3DBest', String(finalScore));
    hud();

    showOverlay(
      '🌆',
      'انتهى الوقت',
      'أنجزت ' + (mission - 1) + ' مهمة. نتيجتك: ' + finalScore,
      'العب مرة ثانية',
      () => {
        reset();
        start();
      }
    );
  }

  function project(z, worldX, height = 0) {
    const clamped = Math.max(1, z);
    const t = 1 - Math.min(1, clamped / VIEW_DISTANCE);
    const curve = Math.pow(t, 1.65);
    const y = HORIZON + curve * (H - HORIZON + 40);
    const roadHalf = ROAD_FAR + curve * (ROAD_NEAR - ROAD_FAR);
    const scale = 0.08 + curve * 1.18;
    const x = W / 2 + worldX * roadHalf - playerX * roadHalf * 0.72;
    return { x, y: y - height * scale, scale, roadHalf, curve };
  }

  function roadPoint(z, side) {
    const p = project(z, 0);
    return { x: W/2 - playerX*p.roadHalf*.72 + side*p.roadHalf, y:p.y };
  }

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      finish();
      return;
    }

    const accelerate = keys.ArrowUp || keys.w;
    const brake = keys.ArrowDown || keys.s;
    const left = keys.ArrowLeft || keys.a;
    const right = keys.ArrowRight || keys.d;

    if (accelerate) speed += 190 * dt;
    else speed -= 42 * dt;

    if (brake) speed -= 260 * dt;

    speed = Math.max(0, Math.min(360, speed));

    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    if (steer) {
      const steerPower = 1.05 + speed / 420;
      playerX += steer * steerPower * dt;
    }
    playerX = Math.max(-1.35, Math.min(1.35, playerX));

    const travel = speed * dt * 1.5;
    distance += travel;
    target.z -= travel;

    for (const b of buildings) {
      b.z -= travel;
      if (b.z < 45) b.z += 2550;
    }

    for (let i = 0; i < traffic.length; i++) {
      const car = traffic[i];
      car.z -= Math.max(25, speed - car.speed) * dt * 1.4;

      if (car.z < 24) {
        car.z = VIEW_DISTANCE + 180 + Math.random() * 500;
        car.x = randomLane();
        car.speed = 120 + Math.random() * 105;
      }

      if (car.z < 92 && car.z > 25 && Math.abs(car.x - playerX) < 0.31) {
        speed *= 0.42;
        score = Math.max(0, score - 80);
        shake = 0.35;
        car.z = 300 + Math.random() * 350;
        car.x = randomLane();
      }
    }

    if (target.z < 82) {
      if (Math.abs(target.x - playerX) < 0.34) {
        score += 320 + Math.ceil(timeLeft) * 2;
        mission++;
      } else {
        score = Math.max(0, score - 35);
      }
      target.z = 760 + Math.random() * 420;
      target.x = randomLane();
    }

    score += speed * dt * 0.018;
    shake = Math.max(0, shake - dt);
    hud();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 80);
    sky.addColorStop(0, '#77b9e8');
    sky.addColorStop(.55, '#b9dcf4');
    sky.addColorStop(1, '#f6c27c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HORIZON + 80);

    ctx.globalAlpha = .32;
    ctx.fillStyle = '#fff';
    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#ffd58a';
    ctx.beginPath();
    ctx.arc(W*.78, 82, 34, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#536878';
    for (let i=0;i<16;i++) {
      const bw = 32 + (i%4)*13;
      const bh = 45 + ((i*37)%95);
      const x = i * 68 - 20;
      ctx.fillRect(x, HORIZON-bh+16, bw, bh);
    }
  }

  function drawGroundAndRoad() {
    ctx.fillStyle = '#2e5f39';
    ctx.fillRect(0, HORIZON, W, H-HORIZON);

    const farL = roadPoint(VIEW_DISTANCE, -1);
    const farR = roadPoint(VIEW_DISTANCE, 1);
    const nearL = roadPoint(1, -1);
    const nearR = roadPoint(1, 1);

    ctx.fillStyle = '#30343a';
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#d7d7d7';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y);
    ctx.lineTo(nearL.x, nearL.y);
    ctx.moveTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.stroke();

    for (let lane = -1; lane <= 1; lane += 2) {
      const wx = lane * 0.333;
      for (let z = 80 - (distance % 160); z < VIEW_DISTANCE; z += 160) {
        if (z < 20) continue;
        const a = project(z, wx);
        const b = project(z + 72, wx);
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = Math.max(1, a.scale * 5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function drawBuilding(b) {
    if (b.z <= 28 || b.z > VIEW_DISTANCE) return;
    const base = project(b.z, b.side * b.offset);
    const top = project(b.z, b.side * b.offset, b.height);
    const width = Math.max(3, b.width * base.roadHalf);
    const h = Math.max(4, base.y - top.y);

    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.moveTo(base.x-width/2, base.y);
    ctx.lineTo(base.x+width/2, base.y);
    ctx.lineTo(base.x+width*.72, base.y+Math.max(2,base.scale*10));
    ctx.lineTo(base.x-width*.28, base.y+Math.max(2,base.scale*10));
    ctx.fill();

    ctx.fillStyle = b.color;
    ctx.fillRect(base.x-width/2, base.y-h, width, h);

    ctx.fillStyle = 'rgba(255,255,255,.16)';
    const rows = Math.max(1, Math.floor(h/18));
    const cols = Math.max(1, Math.floor(width/15));
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        if ((r+c)%2===0) {
          ctx.fillRect(base.x-width/2+5+c*(width/cols), base.y-h+7+r*(h/rows), Math.max(2,width/cols-7), 4);
        }
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath();
    ctx.moveTo(base.x-width/2, base.y-h);
    ctx.lineTo(base.x-width/2+width*.16, base.y-h-Math.max(2,base.scale*12));
    ctx.lineTo(base.x+width/2+width*.16, base.y-h-Math.max(2,base.scale*12));
    ctx.lineTo(base.x+width/2, base.y-h);
    ctx.closePath();
    ctx.fill();
  }

  function drawTrafficCar(car) {
    if (car.z <= 22 || car.z > VIEW_DISTANCE) return;
    const p = project(car.z, car.x);
    const w = Math.max(5, 42 * p.scale);
    const h = Math.max(8, 74 * p.scale);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = car.color;
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = Math.max(2, p.scale*10);
    ctx.beginPath();
    ctx.roundRect(-w/2, -h, w, h, Math.max(2, p.scale*7));
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#14202a';
    ctx.fillRect(-w*.28, -h*.72, w*.56, h*.23);
    ctx.fillStyle = '#ffefb0';
    ctx.fillRect(-w*.35, -h+3, w*.16, Math.max(2,p.scale*6));
    ctx.fillRect(w*.19, -h+3, w*.16, Math.max(2,p.scale*6));
    ctx.restore();
  }

  function drawTarget() {
    if (target.z <= 20 || target.z > VIEW_DISTANCE) return;
    const p = project(target.z, target.x);
    const gateW = 120 * p.scale;
    const gateH = 150 * p.scale;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = '#ffd447';
    ctx.lineWidth = Math.max(2, 8*p.scale);
    ctx.shadowColor = '#ffd447';
    ctx.shadowBlur = Math.max(6, 18*p.scale);
    ctx.beginPath();
    ctx.moveTo(-gateW/2, 0);
    ctx.lineTo(-gateW/2, -gateH);
    ctx.lineTo(gateW/2, -gateH);
    ctx.lineTo(gateW/2, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff2a4';
    ctx.font = 'bold ' + Math.max(10, 23*p.scale) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION', 0, -gateH-8*p.scale);
    ctx.restore();
  }

  function drawPlayerCar() {
    const x = W/2 + playerX * 215;
    const y = H - 98;
    const w = 78;
    const h = 118;

    ctx.save();
    ctx.translate(x, y);
    const tilt = ((keys.ArrowLeft||keys.a)?-.05:0) + ((keys.ArrowRight||keys.d)?.05:0);
    ctx.rotate(tilt);

    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 47, 15, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ffb32f';
    ctx.shadowColor = '#ff8a32';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 18);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#132330';
    ctx.beginPath();
    ctx.roundRect(-w*.29, -h*.31, w*.58, h*.28, 8);
    ctx.fill();

    ctx.fillStyle = '#1d2d38';
    ctx.fillRect(-w*.31, h*.05, w*.62, h*.2);

    ctx.fillStyle = '#ff394f';
    ctx.fillRect(-w*.35, h*.31, 15, 9);
    ctx.fillRect(w*.35-15, h*.31, 15, 9);

    if (speed > 40) {
      ctx.fillStyle = '#59e8ff';
      ctx.shadowColor = '#59e8ff';
      ctx.shadowBlur = 14;
      const flame = 12 + Math.random()*16 + speed/28;
      ctx.beginPath();
      ctx.moveTo(-13, h/2-2);
      ctx.lineTo(-5, h/2+flame);
      ctx.lineTo(1, h/2-2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, h/2-2);
      ctx.lineTo(16, h/2+flame);
      ctx.lineTo(22, h/2-2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  function drawSpeedLines() {
    if (speed < 180) return;
    const alpha = Math.min(.28, (speed-180)/500);
    ctx.strokeStyle = 'rgba(255,255,255,'+alpha+')';
    ctx.lineWidth = 2;
    for (let i=0;i<14;i++) {
      const x = (i*83 + distance*2.1) % W;
      const y = HORIZON + 120 + ((i*47 + distance*1.5) % (H-HORIZON-100));
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x+(x-W/2)*.06,y+25);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random()-.5)*8, (Math.random()-.5)*6);
    }

    drawSky();
    drawGroundAndRoad();

    const visibleBuildings = buildings.filter(b => b.z > 25 && b.z < VIEW_DISTANCE).sort((a,b)=>b.z-a.z);
    visibleBuildings.forEach(drawBuilding);

    drawTarget();

    const visibleCars = traffic.filter(c => c.z > 22 && c.z < VIEW_DISTANCE).sort((a,b)=>b.z-a.z);
    visibleCars.forEach(drawTrafficCar);

    drawSpeedLines();
    drawPlayerCar();
    ctx.restore();
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now-last)/1000, .033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
    keys[event.key] = true;
    keys[key] = true;
  }, { passive:false });

  document.addEventListener('keyup', event => {
    keys[event.key] = false;
    keys[event.key.toLowerCase()] = false;
  });

  document.querySelectorAll('[data-dir]').forEach(button => {
    const map = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight' };
    const key = map[button.dataset.dir];
    button.addEventListener('pointerdown', () => keys[key] = true);
    ['pointerup','pointercancel','pointerleave'].forEach(type => {
      button.addEventListener(type, () => keys[key] = false);
    });
  });

  restartBtn.addEventListener('click', reset);
  reset();
})();