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
    const w = Math.max(7, 54 * p.scale);
    const h = Math.max(10, 82 * p.scale);

    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(0, 3, w*.58, h*.12, 0, 0, Math.PI*2);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#0b0d10';
    const wheelW = Math.max(2, w*.16);
    const wheelH = Math.max(3, h*.23);
    ctx.fillRect(-w*.58, -h*.28, wheelW, wheelH);
    ctx.fillRect(w*.42, -h*.28, wheelW, wheelH);
    ctx.fillRect(-w*.58, -h*.74, wheelW, wheelH);
    ctx.fillRect(w*.42, -h*.74, wheelW, wheelH);

    // Main body - tapered like a real car
    ctx.fillStyle = car.color;
    ctx.shadowColor = 'rgba(0,0,0,.32)';
    ctx.shadowBlur = Math.max(2, p.scale*9);
    ctx.beginPath();
    ctx.moveTo(-w*.47, 0);
    ctx.lineTo(-w*.54, -h*.28);
    ctx.lineTo(-w*.40, -h*.67);
    ctx.lineTo(-w*.26, -h*.94);
    ctx.lineTo(w*.26, -h*.94);
    ctx.lineTo(w*.40, -h*.67);
    ctx.lineTo(w*.54, -h*.28);
    ctx.lineTo(w*.47, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rear window
    ctx.fillStyle = '#172633';
    ctx.beginPath();
    ctx.moveTo(-w*.27, -h*.78);
    ctx.lineTo(-w*.18, -h*.94);
    ctx.lineTo(w*.18, -h*.94);
    ctx.lineTo(w*.27, -h*.78);
    ctx.closePath();
    ctx.fill();

    // Trunk / bumper
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(-w*.36, -h*.42, w*.72, h*.08);
    ctx.fillStyle = '#151a20';
    ctx.fillRect(-w*.45, -h*.12, w*.90, h*.09);

    // Tail lights
    ctx.fillStyle = '#ff3548';
    ctx.shadowColor = '#ff3548';
    ctx.shadowBlur = Math.max(2, p.scale*7);
    ctx.fillRect(-w*.40, -h*.31, w*.19, h*.10);
    ctx.fillRect(w*.21, -h*.31, w*.19, h*.10);
    ctx.shadowBlur = 0;

    // License plate
    ctx.fillStyle = '#e7edf4';
    ctx.fillRect(-w*.13, -h*.19, w*.26, h*.07);

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
    const y = H - 84;
    const w = 112;
    const h = 142;

    ctx.save();
    ctx.translate(x, y);

    const tilt = ((keys.ArrowLeft||keys.a)?-.055:0) + ((keys.ArrowRight||keys.d)?.055:0);
    ctx.rotate(tilt);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 68, 18, 0, 0, Math.PI*2);
    ctx.fill();

    // Tires
    ctx.fillStyle = '#090b0e';
    ctx.fillRect(-w*.57, -h*.23, w*.17, h*.34);
    ctx.fillRect(w*.40, -h*.23, w*.17, h*.34);
    ctx.fillRect(-w*.54, -h*.76, w*.15, h*.28);
    ctx.fillRect(w*.39, -h*.76, w*.15, h*.28);

    // Body silhouette
    const body = ctx.createLinearGradient(0, -h, 0, 10);
    body.addColorStop(0, '#ffd05a');
    body.addColorStop(.48, '#ffad24');
    body.addColorStop(1, '#df7d13');
    ctx.fillStyle = body;
    ctx.shadowColor = '#ff9b22';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(-w*.46, 4);
    ctx.lineTo(-w*.54, -h*.24);
    ctx.lineTo(-w*.45, -h*.57);
    ctx.lineTo(-w*.28, -h*.91);
    ctx.quadraticCurveTo(0, -h*1.02, w*.28, -h*.91);
    ctx.lineTo(w*.45, -h*.57);
    ctx.lineTo(w*.54, -h*.24);
    ctx.lineTo(w*.46, 4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rear windshield
    ctx.fillStyle = '#102432';
    ctx.beginPath();
    ctx.moveTo(-w*.29, -h*.74);
    ctx.lineTo(-w*.20, -h*.91);
    ctx.quadraticCurveTo(0, -h*.97, w*.20, -h*.91);
    ctx.lineTo(w*.29, -h*.74);
    ctx.closePath();
    ctx.fill();

    // Glass reflection
    ctx.fillStyle = 'rgba(113,209,255,.20)';
    ctx.beginPath();
    ctx.moveTo(-w*.19, -h*.87);
    ctx.lineTo(-w*.05, -h*.92);
    ctx.lineTo(w*.09, -h*.76);
    ctx.lineTo(-w*.10, -h*.76);
    ctx.closePath();
    ctx.fill();

    // Rear deck
    ctx.fillStyle = 'rgba(255,255,255,.11)';
    ctx.beginPath();
    ctx.moveTo(-w*.37, -h*.56);
    ctx.lineTo(w*.37, -h*.56);
    ctx.lineTo(w*.43, -h*.38);
    ctx.lineTo(-w*.43, -h*.38);
    ctx.closePath();
    ctx.fill();

    // Tail lights
    ctx.fillStyle = '#ff3348';
    ctx.shadowColor = '#ff3348';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(-w*.42, -h*.31, w*.24, h*.11, 5);
    ctx.roundRect(w*.18, -h*.31, w*.24, h*.11, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rear bumper + diffuser
    ctx.fillStyle = '#24282e';
    ctx.fillRect(-w*.45, -h*.10, w*.90, h*.10);
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(-w*.29, -h*.055, w*.58, h*.07);

    // Exhausts
    ctx.fillStyle = '#b7bdc4';
    ctx.beginPath();
    ctx.ellipse(-w*.30, h*.005, 7, 4, 0, 0, Math.PI*2);
    ctx.ellipse(w*.30, h*.005, 7, 4, 0, 0, Math.PI*2);
    ctx.fill();

    // Plate
    ctx.fillStyle = '#f1f4f6';
    ctx.fillRect(-w*.14, -h*.18, w*.28, h*.08);
    ctx.fillStyle = '#1d2831';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VERTEX', 0, -h*.14);

    // Small spoiler
    ctx.fillStyle = '#252a30';
    ctx.fillRect(-w*.34, -h*.61, w*.68, 7);
    ctx.fillRect(-w*.28, -h*.64, 6, 12);
    ctx.fillRect(w*.22, -h*.64, 6, 12);

    // Exhaust flame at high speed
    if (speed > 235) {
      const flame = 10 + Math.random()*12 + (speed-235)/15;
      ctx.fillStyle = '#56e8ff';
      ctx.shadowColor = '#56e8ff';
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.moveTo(-w*.30-5, 3);
      ctx.lineTo(-w*.30, 3+flame);
      ctx.lineTo(-w*.30+5, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w*.30-5, 3);
      ctx.lineTo(w*.30, 3+flame);
      ctx.lineTo(w*.30+5, 3);
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