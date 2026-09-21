(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const missionEl = document.getElementById('mission');
  const timeEl = document.getElementById('time');
  const speedEl = document.getElementById('speed');
  const bestEl = document.getElementById('best');
  const modeEl = document.getElementById('modeValue');
  const actionBtn = document.getElementById('actionBtn');

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
  let mode = 'drive';
  let parkedCar = null;
  let walkBob = 0;

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
    speedEl.textContent = mode === 'drive' ? Math.round(speed) : 0;
    modeEl.textContent = mode === 'drive' ? 'قيادة' : 'مشي';
    actionBtn.textContent = mode === 'drive' ? 'E نزول' : 'E ركوب';
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
    mode = 'drive';
    parkedCar = null;
    walkBob = 0;
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

  function distanceToParkedCar() {
    if (!parkedCar) return Infinity;
    return Math.hypot((playerX - parkedCar.x) * 180, parkedCar.z - 70);
  }

  function toggleMode() {
    if (!running) return;

    if (mode === 'drive') {
      speed = 0;
      mode = 'walk';
      parkedCar = {
        x: playerX,
        z: 92,
        speed: 0,
        color: '#dfe5ea'
      };
      walkBob = 0;
      hud();
      return;
    }

    if (parkedCar && parkedCar.z > 18 && parkedCar.z < 155 && Math.abs(playerX - parkedCar.x) < 0.46) {
      mode = 'drive';
      playerX = parkedCar.x;
      parkedCar = null;
      speed = 0;
      hud();
    }
  }

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      finish();
      return;
    }

    const up = keys.ArrowUp || keys.w;
    const down = keys.ArrowDown || keys.s;
    const left = keys.ArrowLeft || keys.a;
    const right = keys.ArrowRight || keys.d;

    let travel = 0;

    if (mode === 'drive') {
      if (up) speed += 190 * dt;
      else speed -= 42 * dt;

      if (down) speed -= 260 * dt;

      speed = Math.max(0, Math.min(360, speed));

      const steer = (left ? -1 : 0) + (right ? 1 : 0);
      if (steer) {
        const steerPower = 1.05 + speed / 420;
        playerX += steer * steerPower * dt;
      }
      playerX = Math.max(-1.35, Math.min(1.35, playerX));

      travel = speed * dt * 1.5;
      score += speed * dt * 0.018;
    } else {
      speed = 0;

      const forward = (up ? 1 : 0) + (down ? -1 : 0);
      const sideways = (right ? 1 : 0) + (left ? -1 : 0);

      travel = forward * 105 * dt;
      playerX += sideways * 1.38 * dt;
      playerX = Math.max(-2.35, Math.min(2.35, playerX));

      if (forward || sideways) {
        walkBob += dt * 10;
        score += Math.abs(travel) * 0.012;
      }
    }

    distance += travel;
    target.z -= travel;

    for (const b of buildings) {
      b.z -= travel;
      if (b.z < 45) b.z += 2550;
      if (b.z > 2700) b.z -= 2550;
    }

    if (parkedCar) {
      parkedCar.z -= travel;
    }

    for (let i = 0; i < traffic.length; i++) {
      const car = traffic[i];

      if (mode === 'drive') {
        car.z -= Math.max(25, speed - car.speed) * dt * 1.4;
      } else {
        car.z -= car.speed * dt * 0.18 + travel;
      }

      if (car.z < 24) {
        car.z = VIEW_DISTANCE + 180 + Math.random() * 500;
        car.x = randomLane();
        car.speed = 120 + Math.random() * 105;
      }

      if (car.z > VIEW_DISTANCE + 700) {
        car.z = 180 + Math.random() * 500;
        car.x = randomLane();
      }

      if (mode === 'drive' && car.z < 92 && car.z > 25 && Math.abs(car.x - playerX) < 0.31) {
        speed *= 0.42;
        score = Math.max(0, score - 80);
        shake = 0.35;
        car.z = 300 + Math.random() * 350;
        car.x = randomLane();
      }
    }

    if (target.z < 82) {
      if (Math.abs(target.x - playerX) < (mode === 'walk' ? 0.42 : 0.34)) {
        score += 320 + Math.ceil(timeLeft) * 2;
        mission++;
      } else {
        score = Math.max(0, score - 35);
      }
      target.z = 760 + Math.random() * 420;
      target.x = randomLane();
    }

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

    // Sidewalks
    const farLL = roadPoint(VIEW_DISTANCE, -1.18);
    const farRR = roadPoint(VIEW_DISTANCE, 1.18);
    const nearLL = roadPoint(1, -1.18);
    const nearRR = roadPoint(1, 1.18);

    ctx.fillStyle = '#a8adb1';
    ctx.beginPath();
    ctx.moveTo(farLL.x, farLL.y);
    ctx.lineTo(farL.x, farL.y);
    ctx.lineTo(nearL.x, nearL.y);
    ctx.lineTo(nearLL.x, nearLL.y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(farR.x, farR.y);
    ctx.lineTo(farRR.x, farRR.y);
    ctx.lineTo(nearRR.x, nearRR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.closePath();
    ctx.fill();

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

  function shadeColor(hex, amount) {
    const value = hex.replace('#','');
    const num = parseInt(value,16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (num & 255) + amount));
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }

  function drawTrafficCar(car) {
    if (car.z <= 22 || car.z > VIEW_DISTANCE) return;

    const p = project(car.z, car.x);
    const s = Math.max(.12, p.scale);
    const w = 132 * s;
    const h = 158 * s;

    ctx.save();
    ctx.translate(p.x, p.y);

    // نفس شكل سيارة اللاعب تماماً، لكن بلون السيارة.
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(0, 3, w*.58, h*.11, 0, 0, Math.PI*2);
    ctx.fill();

    const wheelR = 19 * s;
    ctx.fillStyle = '#08090b';
    ctx.beginPath();
    ctx.ellipse(-w*.47, -h*.17, 15*s, wheelR, -.08, 0, Math.PI*2);
    ctx.ellipse(w*.47, -h*.17, 15*s, wheelR, .08, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#aeb6bf';
    ctx.beginPath();
    ctx.ellipse(-w*.47, -h*.17, 6.5*s, 10*s, -.08, 0, Math.PI*2);
    ctx.ellipse(w*.47, -h*.17, 6.5*s, 10*s, .08, 0, Math.PI*2);
    ctx.fill();

    const body = ctx.createLinearGradient(-w/2, -h, w/2, 5);
    body.addColorStop(0, shadeColor(car.color, 45));
    body.addColorStop(.48, car.color);
    body.addColorStop(1, shadeColor(car.color, -36));

    ctx.fillStyle = body;
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = Math.max(2, 12*s);
    ctx.beginPath();
    ctx.moveTo(-w*.48, 4*s);
    ctx.lineTo(-w*.55, -h*.25);
    ctx.lineTo(-w*.47, -h*.55);
    ctx.lineTo(-w*.34, -h*.84);
    ctx.lineTo(-w*.24, -h*.96);
    ctx.lineTo(w*.24, -h*.96);
    ctx.lineTo(w*.34, -h*.84);
    ctx.lineTo(w*.47, -h*.55);
    ctx.lineTo(w*.55, -h*.25);
    ctx.lineTo(w*.48, 4*s);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = shadeColor(car.color, -48);
    ctx.beginPath();
    ctx.moveTo(-w*.48, 4*s);
    ctx.lineTo(-w*.55, -h*.25);
    ctx.lineTo(-w*.47, -h*.55);
    ctx.lineTo(-w*.33, -h*.48);
    ctx.lineTo(-w*.38, -h*.10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeColor(car.color, 22);
    ctx.beginPath();
    ctx.moveTo(w*.48, 4*s);
    ctx.lineTo(w*.55, -h*.25);
    ctx.lineTo(w*.47, -h*.55);
    ctx.lineTo(w*.33, -h*.48);
    ctx.lineTo(w*.38, -h*.10);
    ctx.closePath();
    ctx.fill();

    // نفس سقف وزجاج سيارة اللاعب.
    ctx.fillStyle = '#11171d';
    ctx.beginPath();
    ctx.moveTo(-w*.31, -h*.57);
    ctx.lineTo(-w*.22, -h*.88);
    ctx.lineTo(-w*.16, -h*.98);
    ctx.lineTo(w*.16, -h*.98);
    ctx.lineTo(w*.22, -h*.88);
    ctx.lineTo(w*.31, -h*.57);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#132a38';
    ctx.beginPath();
    ctx.moveTo(-w*.25, -h*.61);
    ctx.lineTo(-w*.18, -h*.86);
    ctx.lineTo(w*.18, -h*.86);
    ctx.lineTo(w*.25, -h*.61);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(112,208,255,.20)';
    ctx.beginPath();
    ctx.moveTo(-w*.16, -h*.82);
    ctx.lineTo(-w*.04, -h*.85);
    ctx.lineTo(w*.09, -h*.64);
    ctx.lineTo(-w*.08, -h*.64);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#2f363d';
    ctx.lineWidth = Math.max(1, 5*s);
    ctx.beginPath();
    ctx.moveTo(-w*.23, -h*.90);
    ctx.lineTo(-w*.28, -h*.63);
    ctx.moveTo(w*.23, -h*.90);
    ctx.lineTo(w*.28, -h*.63);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(-w*.36, -h*.48, w*.72, h*.09);

    ctx.fillStyle = '#ff243d';
    ctx.shadowColor = '#ff243d';
    ctx.shadowBlur = Math.max(2, 10*s);
    ctx.beginPath();
    ctx.roundRect(-w*.42, -h*.38, w*.22, h*.11, Math.max(1, 6*s));
    ctx.roundRect(w*.20, -h*.38, w*.22, h*.11, Math.max(1, 6*s));
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#1a1f24';
    ctx.beginPath();
    ctx.moveTo(-w*.47, -h*.14);
    ctx.lineTo(w*.47, -h*.14);
    ctx.lineTo(w*.40, -h*.03);
    ctx.lineTo(-w*.40, -h*.03);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f4f6f7';
    ctx.fillRect(-w*.15, -h*.24, w*.30, h*.09);

    ctx.fillStyle = '#c7ccd1';
    ctx.beginPath();
    ctx.ellipse(-w*.30, -h*.01, 8*s, 4.5*s, 0, 0, Math.PI*2);
    ctx.ellipse(w*.30, -h*.01, 8*s, 4.5*s, 0, 0, Math.PI*2);
    ctx.fill();

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
    const y = H - 70;
    const w = 132;
    const h = 158;

    ctx.save();
    ctx.translate(x, y);

    const tilt = ((keys.ArrowLeft||keys.a)?-.055:0) + ((keys.ArrowRight||keys.d)?.055:0);
    ctx.rotate(tilt);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 76, 22, 0, 0, Math.PI*2);
    ctx.fill();

    // Rear wheels
    const wheelR = 19;
    ctx.fillStyle = '#08090b';
    ctx.beginPath();
    ctx.ellipse(-w*.47, -h*.17, 15, wheelR, -.08, 0, Math.PI*2);
    ctx.ellipse(w*.47, -h*.17, 15, wheelR, .08, 0, Math.PI*2);
    ctx.fill();

    // Rims
    ctx.fillStyle = '#aeb6bf';
    ctx.beginPath();
    ctx.ellipse(-w*.47, -h*.17, 6.5, 10, -.08, 0, Math.PI*2);
    ctx.ellipse(w*.47, -h*.17, 6.5, 10, .08, 0, Math.PI*2);
    ctx.fill();

    // Main SUV body
    const body = ctx.createLinearGradient(-w/2, -h, w/2, 5);
    body.addColorStop(0, '#f6f8fa');
    body.addColorStop(.48, '#dfe5ea');
    body.addColorStop(1, '#aeb8c1');

    ctx.fillStyle = body;
    ctx.shadowColor = 'rgba(255,255,255,.22)';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(-w*.48, 4);
    ctx.lineTo(-w*.55, -h*.25);
    ctx.lineTo(-w*.47, -h*.55);
    ctx.lineTo(-w*.34, -h*.84);
    ctx.lineTo(-w*.24, -h*.96);
    ctx.lineTo(w*.24, -h*.96);
    ctx.lineTo(w*.34, -h*.84);
    ctx.lineTo(w*.47, -h*.55);
    ctx.lineTo(w*.55, -h*.25);
    ctx.lineTo(w*.48, 4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Dark side surfaces to sell the 3D shape
    ctx.fillStyle = '#8f9aa4';
    ctx.beginPath();
    ctx.moveTo(-w*.48, 4);
    ctx.lineTo(-w*.55, -h*.25);
    ctx.lineTo(-w*.47, -h*.55);
    ctx.lineTo(-w*.33, -h*.48);
    ctx.lineTo(-w*.38, -h*.10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#c9d1d8';
    ctx.beginPath();
    ctx.moveTo(w*.48, 4);
    ctx.lineTo(w*.55, -h*.25);
    ctx.lineTo(w*.47, -h*.55);
    ctx.lineTo(w*.33, -h*.48);
    ctx.lineTo(w*.38, -h*.10);
    ctx.closePath();
    ctx.fill();

    // Roof / cabin
    ctx.fillStyle = '#11171d';
    ctx.beginPath();
    ctx.moveTo(-w*.31, -h*.57);
    ctx.lineTo(-w*.22, -h*.88);
    ctx.lineTo(-w*.16, -h*.98);
    ctx.lineTo(w*.16, -h*.98);
    ctx.lineTo(w*.22, -h*.88);
    ctx.lineTo(w*.31, -h*.57);
    ctx.closePath();
    ctx.fill();

    // Rear windshield
    ctx.fillStyle = '#132a38';
    ctx.beginPath();
    ctx.moveTo(-w*.25, -h*.61);
    ctx.lineTo(-w*.18, -h*.86);
    ctx.lineTo(w*.18, -h*.86);
    ctx.lineTo(w*.25, -h*.61);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(112,208,255,.20)';
    ctx.beginPath();
    ctx.moveTo(-w*.16, -h*.82);
    ctx.lineTo(-w*.04, -h*.85);
    ctx.lineTo(w*.09, -h*.64);
    ctx.lineTo(-w*.08, -h*.64);
    ctx.closePath();
    ctx.fill();

    // Roof rails
    ctx.strokeStyle = '#2f363d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-w*.23, -h*.90);
    ctx.lineTo(-w*.28, -h*.63);
    ctx.moveTo(w*.23, -h*.90);
    ctx.lineTo(w*.28, -h*.63);
    ctx.stroke();

    // Tailgate details
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(-w*.36, -h*.48, w*.72, h*.09);

    ctx.fillStyle = '#ff243d';
    ctx.shadowColor = '#ff243d';
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.roundRect(-w*.42, -h*.38, w*.22, h*.11, 6);
    ctx.roundRect(w*.20, -h*.38, w*.22, h*.11, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rear bumper + diffuser
    ctx.fillStyle = '#1a1f24';
    ctx.beginPath();
    ctx.moveTo(-w*.47, -h*.14);
    ctx.lineTo(w*.47, -h*.14);
    ctx.lineTo(w*.40, -h*.03);
    ctx.lineTo(-w*.40, -h*.03);
    ctx.closePath();
    ctx.fill();

    // Plate
    ctx.fillStyle = '#f4f6f7';
    ctx.fillRect(-w*.15, -h*.24, w*.30, h*.09);
    ctx.fillStyle = '#1c2a32';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VERTEX', 0, -h*.195);

    // Exhausts
    ctx.fillStyle = '#c7ccd1';
    ctx.beginPath();
    ctx.ellipse(-w*.30, -h*.01, 8, 4.5, 0, 0, Math.PI*2);
    ctx.ellipse(w*.30, -h*.01, 8, 4.5, 0, 0, Math.PI*2);
    ctx.fill();

    // Exhaust flame at high speed
    if (speed > 250) {
      const flame = 12 + Math.random()*14 + (speed-250)/14;
      ctx.fillStyle = '#52e8ff';
      ctx.shadowColor = '#52e8ff';
      ctx.shadowBlur = 15;
      [-1,1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(side*w*.30-5, 3);
        ctx.lineTo(side*w*.30, 3+flame);
        ctx.lineTo(side*w*.30+5, 3);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
  function drawWalker() {
    const x = W / 2;
    const bob = Math.sin(walkBob) * 3;
    const y = H - 72 + bob;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0,0,0,.30)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 24, 8, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = '#17212a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 5);
    ctx.lineTo(-11, 27);
    ctx.moveTo(7, 5);
    ctx.lineTo(11, 27);
    ctx.stroke();

    ctx.fillStyle = '#4c79ff';
    ctx.beginPath();
    ctx.roundRect(-18, -42, 36, 50, 12);
    ctx.fill();

    ctx.fillStyle = '#f0c7a4';
    ctx.beginPath();
    ctx.arc(0, -57, 15, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#17212a';
    ctx.beginPath();
    ctx.arc(0, -61, 15, Math.PI, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = '#f0c7a4';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-15, -28);
    ctx.lineTo(-25, -6);
    ctx.moveTo(15, -28);
    ctx.lineTo(25, -6);
    ctx.stroke();

    ctx.restore();
  }

  function drawWalkHint() {
    if (mode !== 'walk') return;

    const nearCar = parkedCar &&
      parkedCar.z > 18 &&
      parkedCar.z < 155 &&
      Math.abs(playerX - parkedCar.x) < 0.46;

    ctx.save();
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = nearCar
      ? 'اضغط E للركوب'
      : 'تمشَّ بالأسهم أو WASD — ارجع لسيارتك للركوب';

    const width = Math.min(W - 40, ctx.measureText(text).width + 36);
    ctx.fillStyle = 'rgba(7,16,24,.76)';
    ctx.beginPath();
    ctx.roundRect(W/2-width/2, 20, width, 42, 14);
    ctx.fill();

    ctx.fillStyle = nearCar ? '#ffd447' : '#ffffff';
    ctx.fillText(text, W/2, 41);
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

    if (mode === 'walk' && parkedCar && parkedCar.z > 22 && parkedCar.z < VIEW_DISTANCE) {
      drawTrafficCar(parkedCar);
    }

    drawSpeedLines();

    if (mode === 'drive') {
      drawPlayerCar();
    } else {
      drawWalker();
      drawWalkHint();
    }

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

    if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
      event.preventDefault();
    }

    if (key === 'e' && !event.repeat) {
      event.preventDefault();
      toggleMode();
      return;
    }

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

  actionBtn.addEventListener('click', toggleMode);
  restartBtn.addEventListener('click', reset);
  reset();
})();