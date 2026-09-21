import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(960, 600, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8ee);
scene.fog = new THREE.Fog(0x9fd2ec, 260, 720);

const camera = new THREE.PerspectiveCamera(62, 960 / 600, 0.1, 1500);

const hemi = new THREE.HemisphereLight(0xdaf3ff, 0x5d6c58, 2.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d2, 2.5);
sun.position.set(180, 260, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -300;
sun.shadow.camera.right = 300;
sun.shadow.camera.top = 300;
sun.shadow.camera.bottom = -300;
scene.add(sun);

const CITY_HALF = 495;
const ROAD_SPACING = 110;
const ROAD_WIDTH = 28;
const GRID_RADIUS = 4;
const roadLines = [];
for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) roadLines.push(i * ROAD_SPACING);

const keys = Object.create(null);
const buildingBoxes = [];
const traffic = [];
let running = false;
let last = 0;
let elapsed = 0;
let score = 0;
let mission = 1;
let speed = 0;
let heading = 0;
let mode = 'drive';
let walkHeading = 0;
let walkBob = 0;
let playerCar;
let walker;
let missionMarker;
let currentMission = new THREE.Vector3(0, 0, 0);
let cameraYawOffset = 0;

function seededRandom(seed) {
  const x = Math.sin(seed * 999.91) * 43758.5453;
  return x - Math.floor(x);
}

function buildingTexture(base, seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');

  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,.20)');
  grad.addColorStop(.5, 'rgba(255,255,255,.07)');
  grad.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);

  const cols = 5;
  const rows = 10;
  const cellW = 128 / cols;
  const cellH = 256 / rows;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = seededRandom(seed + r * 9 + col * 17) > .64;
      g.fillStyle = lit ? '#d9d39b' : '#29414f';
      g.fillRect(col * cellW + 6, r * cellH + 6, cellW - 12, cellH - 11);
      g.strokeStyle = 'rgba(255,255,255,.10)';
      g.strokeRect(col * cellW + 6, r * cellH + 6, cellW - 12, cellH - 11);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

const facadeTextures = [
  buildingTexture('#72899b', 1),
  buildingTexture('#71848d', 2),
  buildingTexture('#9b7c6b', 3),
  buildingTexture('#778a76', 4),
  buildingTexture('#7d718c', 5),
  buildingTexture('#9a9276', 6)
];

function addCity() {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshStandardMaterial({ color: 0x60825f, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x303438, roughness: .95 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb4b7b5, roughness: 1 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d5 });

  for (const line of roadLines) {
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(1100, .18, ROAD_WIDTH), roadMat);
    roadZ.position.set(0, .10, line);
    roadZ.receiveShadow = true;
    scene.add(roadZ);

    const roadX = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, .18, 1100), roadMat);
    roadX.position.set(line, .11, 0);
    roadX.receiveShadow = true;
    scene.add(roadX);

    const centerZ = new THREE.Mesh(new THREE.BoxGeometry(1100, .03, .35), lineMat);
    centerZ.position.set(0, .22, line);
    scene.add(centerZ);

    const centerX = new THREE.Mesh(new THREE.BoxGeometry(.35, .03, 1100), lineMat);
    centerX.position.set(line, .23, 0);
    scene.add(centerX);
  }

  let seed = 20;
  for (let gx = -GRID_RADIUS; gx < GRID_RADIUS; gx++) {
    for (let gz = -GRID_RADIUS; gz < GRID_RADIUS; gz++) {
      const x0 = gx * ROAD_SPACING + ROAD_WIDTH / 2 + 3;
      const x1 = (gx + 1) * ROAD_SPACING - ROAD_WIDTH / 2 - 3;
      const z0 = gz * ROAD_SPACING + ROAD_WIDTH / 2 + 3;
      const z1 = (gz + 1) * ROAD_SPACING - ROAD_WIDTH / 2 - 3;
      const blockW = x1 - x0;
      const blockD = z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(blockW + 6, .55, blockD + 6),
        sidewalkMat
      );
      sidewalk.position.set(cx, .28, cz);
      sidewalk.receiveShadow = true;
      scene.add(sidewalk);

      const count = seededRandom(seed++) > .42 ? 4 : 3;
      const slots = [
        [-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]
      ];

      for (let i = 0; i < count; i++) {
        const rand = seededRandom(seed * 19 + i * 7);
        const slot = slots[i];
        const bw = 27 + seededRandom(seed + i) * 13;
        const bd = 27 + seededRandom(seed + i + 30) * 13;
        const bh = 42 + rand * 120;
        const bx = cx + slot[0] * blockW * 1.35;
        const bz = cz + slot[1] * blockD * 1.35;
        const tex = facadeTextures[Math.floor(seededRandom(seed + i * 3) * facadeTextures.length)];

        const sideMat = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0xffffff,
          roughness: .82,
          metalness: .02
        });
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0x667078,
          roughness: .95
        });

        const geom = new THREE.BoxGeometry(bw, bh, bd);
        const building = new THREE.Mesh(geom, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]);
        building.position.set(bx, bh / 2 + .58, bz);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);

        buildingBoxes.push({
          minX: bx - bw / 2 - 1.3,
          maxX: bx + bw / 2 + 1.3,
          minZ: bz - bd / 2 - 1.3,
          maxZ: bz + bd / 2 + 1.3
        });
      }
    }
  }

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(25, 25, .7, 48),
    new THREE.MeshStandardMaterial({ color: 0xa8b6bd, roughness: .9 })
  );
  plaza.position.set(0, .45, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);

  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 10, 2, 32),
    new THREE.MeshStandardMaterial({ color: 0x7f8c95, roughness: .8 })
  );
  fountain.position.set(0, 1.3, 0);
  scene.add(fountain);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, .4, 32),
    new THREE.MeshStandardMaterial({ color: 0x46bfe8, transparent: true, opacity: .78, roughness: .25 })
  );
  water.position.set(0, 2.3, 0);
  scene.add(water);
}

function createCar(color = 0xffffff) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: .38, metalness: .18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .35, metalness: .15 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x183847,
    roughness: .16,
    metalness: .15,
    transparent: true,
    opacity: .88
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: .95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c0, roughness: .3, metalness: .7 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff233c, emissive: 0x5f0008 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.25, 8.4), bodyMat);
  body.position.y = 1.25;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(4.15, .55, 2.2), bodyMat);
  hood.position.set(0, 2.03, 2.65);
  hood.castShadow = true;
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.65, 1.65, 3.8), glassMat);
  cabin.position.set(0, 2.35, -.45);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, .22, 3.65), darkMat);
  roof.position.set(0, 3.24, -.45);
  roof.castShadow = true;
  group.add(roof);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(4.4, .42, .55), darkMat);
  bumper.position.set(0, .8, -4.23);
  group.add(bumper);

  const wheelGeo = new THREE.CylinderGeometry(.78, .78, .72, 18);
  const rimGeo = new THREE.CylinderGeometry(.36, .36, .74, 18);
  const wheelPositions = [
    [-2.22, .78, 2.45], [2.22, .78, 2.45],
    [-2.22, .78, -2.55], [2.22, .78, -2.55]
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
  }

  for (const x of [-1.45, 1.45]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(.85, .34, .18), redMat);
    light.position.set(x, 1.38, -4.31);
    group.add(light);
  }

  group.userData.radius = 3.5;
  return group;
}

function createWalker() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4e77ff, roughness: .8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8bc98, roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2832, roughness: .9 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.65, 1.45, 5, 10), shirt);
  body.position.y = 1.85;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.52, 16, 12), skin);
  head.position.y = 3.35;
  head.castShadow = true;
  g.add(head);

  const legGeo = new THREE.CapsuleGeometry(.18, 1.0, 4, 8);
  const leg1 = new THREE.Mesh(legGeo, dark);
  leg1.position.set(-.28, .63, 0);
  g.add(leg1);
  const leg2 = leg1.clone();
  leg2.position.x = .28;
  g.add(leg2);

  g.visible = false;
  return g;
}

function randomRoadPoint() {
  const axisZ = Math.random() < .5;
  const fixed = roadLines[Math.floor(Math.random() * roadLines.length)];
  const moving = -CITY_HALF + 35 + Math.random() * (CITY_HALF * 2 - 70);
  return axisZ
    ? new THREE.Vector3(fixed + (Math.random() < .5 ? -6 : 6), 0, moving)
    : new THREE.Vector3(moving, 0, fixed + (Math.random() < .5 ? -6 : 6));
}

function createMissionMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, .45, 12, 36),
    new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: 0x7a4b00,
      roughness: .45,
      metalness: .15
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .6;
  g.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 4.5, 18, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd447,
      transparent: true,
      opacity: .12,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  beam.position.y = 9;
  g.add(beam);

  scene.add(g);
  return g;
}

function isInsideBuilding(x, z, margin = 0) {
  for (const b of buildingBoxes) {
    if (
      x > b.minX - margin &&
      x < b.maxX + margin &&
      z > b.minZ - margin &&
      z < b.maxZ + margin
    ) return true;
  }
  return false;
}

function clampCity(v) {
  v.x = THREE.MathUtils.clamp(v.x, -CITY_HALF, CITY_HALF);
  v.z = THREE.MathUtils.clamp(v.z, -CITY_HALF, CITY_HALF);
}

function makeTraffic() {
  const colors = [0xf34f57, 0x4bbfff, 0x9f79ff, 0x64d894, 0xf1c24d];
  for (let i = 0; i < 6; i++) {
    const alongZ = i % 2 === 0;
    const road = roadLines[(i * 3 + 1) % roadLines.length];
    const dir = i % 4 < 2 ? 1 : -1;
    const car = createCar(colors[i % colors.length]);

    if (alongZ) {
      car.position.set(road + (dir > 0 ? -6 : 6), 0, -CITY_HALF + 70 + i * 125);
      car.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      car.position.set(-CITY_HALF + 90 + i * 115, 0, road + (dir > 0 ? 6 : -6));
      car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    scene.add(car);
    traffic.push({
      mesh: car,
      alongZ,
      dir,
      road,
      speed: 11 + (i % 3) * 2.3
    });
  }
}

function placeMission() {
  currentMission.copy(randomRoadPoint());
  missionMarker.position.set(currentMission.x, .2, currentMission.z);
}

function updateHud() {
  scoreEl.textContent = Math.floor(score);
  missionEl.textContent = mission;
  timeEl.textContent = Math.floor(elapsed);
  speedEl.textContent = mode === 'drive' ? Math.round(Math.abs(speed) * 4.2) : 0;
  modeEl.textContent = mode === 'drive' ? 'قيادة' : 'مشي';

  const near = walker.visible && walker.position.distanceTo(playerCar.position) < 7;
  actionBtn.textContent = mode === 'drive' ? 'E نزول' : (near ? 'E ركوب' : 'E السيارة بعيدة');

  const best = Number(localStorage.getItem('vertexCity3DBest') || 0);
  if (score > best) localStorage.setItem('vertexCity3DBest', String(Math.floor(score)));
  bestEl.textContent = localStorage.getItem('vertexCity3DBest') || '0';
}

function showOverlay(icon, title, text, buttonText, fn) {
  overlayIcon.textContent = icon;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startBtn.textContent = buttonText;
  startBtn.onclick = fn;
  overlay.classList.add('show');
}

function reset() {
  running = false;
  elapsed = 0;
  score = 0;
  mission = 1;
  speed = 0;
  heading = 0;
  walkHeading = 0;
  walkBob = 0;
  mode = 'drive';
  cameraYawOffset = 0;

  playerCar.position.set(0, 0, -36);
  playerCar.rotation.y = heading;
  playerCar.visible = true;

  walker.visible = false;
  walker.position.copy(playerCar.position);

  placeMission();
  updateHud();
  updateCamera(true);
  renderer.render(scene, camera);

  showOverlay(
    '🏙️',
    'Vertex City 3D',
    'مدينة واسعة مثل الفيديو: شوارع متعددة، مبانٍ عالية، قيادة ومشي حر.',
    'ابدأ الاستكشاف',
    start
  );
}

function start() {
  overlay.classList.remove('show');
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function toggleMode() {
  if (!running) return;

  if (mode === 'drive') {
    speed = 0;
    mode = 'walk';

    const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(4.8);
    walker.position.copy(playerCar.position).add(side);
    walkHeading = heading;
    walker.rotation.y = walkHeading;
    walker.visible = true;
  } else {
    if (walker.position.distanceTo(playerCar.position) > 7) return;
    mode = 'drive';
    walker.visible = false;
    heading = playerCar.rotation.y;
    speed = 0;
  }

  updateHud();
}

function updateDrive(dt) {
  const forward = keys.w || keys.ArrowUp;
  const backward = keys.s || keys.ArrowDown;
  const left = keys.a || keys.ArrowLeft;
  const right = keys.d || keys.ArrowRight;

  if (forward) speed += 24 * dt;
  else if (backward) speed -= 21 * dt;
  else speed *= Math.pow(.23, dt);

  speed = THREE.MathUtils.clamp(speed, -13, 38);

  if (Math.abs(speed) > .35) {
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    heading += steer * dt * (1.25 + Math.min(Math.abs(speed) / 24, .8)) * Math.sign(speed);
  }

  const forwardVec = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const candidate = playerCar.position.clone().addScaledVector(forwardVec, speed * dt);

  if (!isInsideBuilding(candidate.x, candidate.z, 2.7)) {
    playerCar.position.copy(candidate);
  } else {
    speed *= -.16;
  }

  clampCity(playerCar.position);
  playerCar.rotation.y = heading;

  score += Math.abs(speed) * dt * .38;
}

function updateWalk(dt) {
  const forward = keys.w || keys.ArrowUp;
  const backward = keys.s || keys.ArrowDown;
  const left = keys.a || keys.ArrowLeft;
  const right = keys.d || keys.ArrowRight;

  const turn = (left ? 1 : 0) - (right ? 1 : 0);
  walkHeading += turn * dt * 2.2;

  let move = 0;
  if (forward) move += 1;
  if (backward) move -= .72;

  if (move) {
    const dir = new THREE.Vector3(Math.sin(walkHeading), 0, Math.cos(walkHeading));
    const candidate = walker.position.clone().addScaledVector(dir, move * 8.4 * dt);
    if (!isInsideBuilding(candidate.x, candidate.z, .8)) {
      walker.position.copy(candidate);
    }
    walkBob += dt * 10;
    score += Math.abs(move) * dt * .22;
  }

  clampCity(walker.position);
  walker.rotation.y = walkHeading;
  walker.position.y = Math.sin(walkBob) * .035;
}

function updateTraffic(dt) {
  for (const t of traffic) {
    if (t.alongZ) {
      t.mesh.position.z += t.dir * t.speed * dt;
      if (t.mesh.position.z > CITY_HALF + 35) t.mesh.position.z = -CITY_HALF - 35;
      if (t.mesh.position.z < -CITY_HALF - 35) t.mesh.position.z = CITY_HALF + 35;
    } else {
      t.mesh.position.x += t.dir * t.speed * dt;
      if (t.mesh.position.x > CITY_HALF + 35) t.mesh.position.x = -CITY_HALF - 35;
      if (t.mesh.position.x < -CITY_HALF - 35) t.mesh.position.x = CITY_HALF + 35;
    }

    if (
      mode === 'drive' &&
      t.mesh.position.distanceTo(playerCar.position) < 6.2
    ) {
      speed *= -.28;
      score = Math.max(0, score - 40);
      const push = playerCar.position.clone().sub(t.mesh.position).setY(0);
      if (push.lengthSq() > .001) {
        push.normalize().multiplyScalar(2.2);
        playerCar.position.add(push);
      }
    }
  }
}

function updateMission(dt) {
  missionMarker.rotation.y += dt * .7;
  missionMarker.position.y = .2 + Math.sin(elapsed * 2.4) * .25;

  const active = mode === 'drive' ? playerCar : walker;
  if (active.position.distanceTo(currentMission) < (mode === 'drive' ? 8 : 5)) {
    score += mode === 'drive' ? 240 : 300;
    mission += 1;
    placeMission();
  }
}

function updateCamera(force = false) {
  const active = mode === 'drive' ? playerCar : walker;
  const ang = mode === 'drive' ? heading + cameraYawOffset : walkHeading + cameraYawOffset;
  const dist = mode === 'drive' ? 17 : 8.5;
  const height = mode === 'drive' ? 8.4 : 5.8;

  const offset = new THREE.Vector3(
    -Math.sin(ang) * dist,
    height,
    -Math.cos(ang) * dist
  );

  const desired = active.position.clone().add(offset);
  if (force) camera.position.copy(desired);
  else camera.position.lerp(desired, .10);

  const target = active.position.clone();
  target.y += mode === 'drive' ? 2 : 2.2;
  camera.lookAt(target);
}

function update(dt) {
  elapsed += dt;

  if (mode === 'drive') updateDrive(dt);
  else updateWalk(dt);

  updateTraffic(dt);
  updateMission(dt);
  updateCamera(false);
  updateHud();
}

function loop(now) {
  if (!running) return;

  const dt = Math.min((now - last) / 1000, .033);
  last = now;

  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function bindControls() {
  document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();

    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) {
      e.preventDefault();
    }

    if (key === 'e' && !e.repeat) {
      e.preventDefault();
      toggleMode();
      return;
    }

    if (key === 'q') cameraYawOffset = THREE.MathUtils.clamp(cameraYawOffset + .35, -1.1, 1.1);
    if (key === 'r') cameraYawOffset = THREE.MathUtils.clamp(cameraYawOffset - .35, -1.1, 1.1);
    if (key === 'c') cameraYawOffset = 0;

    keys[key] = true;
    keys[e.key] = true;
  }, { passive: false });

  document.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;
  });

  document.querySelectorAll('[data-dir]').forEach(button => {
    const map = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight' };
    const key = map[button.dataset.dir];

    button.addEventListener('pointerdown', e => {
      e.preventDefault();
      keys[key] = true;
    });

    ['pointerup','pointercancel','pointerleave'].forEach(type => {
      button.addEventListener(type, () => {
        keys[key] = false;
      });
    });
  });

  actionBtn.addEventListener('click', toggleMode);
  restartBtn.addEventListener('click', reset);
}

addCity();
playerCar = createCar(0xe8edf1);
scene.add(playerCar);

walker = createWalker();
scene.add(walker);

missionMarker = createMissionMarker();
makeTraffic();
bindControls();
reset();
