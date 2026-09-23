const canvas = document.getElementById('gameCanvas');
const scoreEl = document.getElementById('score');
const missionEl = document.getElementById('mission');
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
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.58;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8ee);
scene.fog = new THREE.Fog(0x9fd2ec, 420, 1050);

const camera = new THREE.PerspectiveCamera(62, 960 / 600, 0.1, 1500);

const hemi = new THREE.HemisphereLight(0xdaf3ff, 0x4a584c, 0.62);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d2, 0.72);
sun.position.set(180, 260, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -300;
sun.shadow.camera.right = 300;
sun.shadow.camera.top = 300;
sun.shadow.camera.bottom = -300;
scene.add(sun);

const CITY_HALF = 505;
const ROAD_SPACING = 92;
const ROAD_WIDTH = 22;
const GRID_RADIUS = 5;
const roadLines = [];
for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) roadLines.push(i * ROAD_SPACING);

const keys = Object.create(null);
const buildingBoxes = [];
const buildingEntrances = [];
const traffic = [];

const cityGroup = new THREE.Group();
scene.add(cityGroup);

const interiorGroup = new THREE.Group();
interiorGroup.visible = false;
scene.add(interiorGroup);
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

let speed2 = 0;
let heading2 = 0;
let mode2 = 'drive';
let walkHeading2 = 0;
let walkBob2 = 0;

let playerCar;
let walker;
let playerCar2;
let walker2;
let missionMarker;
let currentMission = new THREE.Vector3(0, 0, 0);
let cameraYawOffset = 0;
let outsideReturn = null;

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
      g.fillStyle = lit ? '#9f9868' : '#223642';
      g.fillRect(col * cellW + 6, r * cellH + 6, cellW - 12, cellH - 11);
      g.strokeStyle = 'rgba(255,255,255,.10)';
      g.strokeRect(col * cellW + 6, r * cellH + 6, cellW - 12, cellH - 11);
    }
  }

  const texture = new THREE.CanvasTexture(c);
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
  buildingBoxes.length = 0;
  buildingEntrances.length = 0;

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(1180, 1180),
    new THREE.MeshStandardMaterial({ color: 0x6f8e69, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  cityGroup.add(grass);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x34393e, roughness: .98 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x8e9594, roughness: .98 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xc9c8c0 });

  // Draw every road first. Buildings are generated only inside the blocks BETWEEN roads.
  for (const line of roadLines) {
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(1180, .18, ROAD_WIDTH), roadMat);
    roadZ.position.set(0, .10, line);
    roadZ.receiveShadow = true;
    cityGroup.add(roadZ);

    const roadX = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, .18, 1180), roadMat);
    roadX.position.set(line, .11, 0);
    roadX.receiveShadow = true;
    cityGroup.add(roadX);

    const centerZ = new THREE.Mesh(new THREE.BoxGeometry(1180, .025, .28), lineMat);
    centerZ.position.set(0, .22, line);
    cityGroup.add(centerZ);

    const centerX = new THREE.Mesh(new THREE.BoxGeometry(.28, .025, 1180), lineMat);
    centerX.position.set(line, .23, 0);
    cityGroup.add(centerX);
  }

  const facadeMats = facadeTextures.map(tex => new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: .84,
    metalness: .02
  }));

  const roofMats = [
    new THREE.MeshStandardMaterial({ color: 0x777b7d, roughness: .96 }),
    new THREE.MeshStandardMaterial({ color: 0x9b7a67, roughness: .96 }),
    new THREE.MeshStandardMaterial({ color: 0x626c73, roughness: .96 }),
    new THREE.MeshStandardMaterial({ color: 0x887f73, roughness: .96 })
  ];

  let seed = 41;
  const ROAD_EDGE = ROAD_WIDTH / 2;
  const SIDEWALK = 7;
  const BUILDING_MARGIN = 4;

  // One safe rectangle per city block. Nothing is allowed to cross this rectangle.
  for (let gx = -GRID_RADIUS; gx < GRID_RADIUS; gx++) {
    for (let gz = -GRID_RADIUS; gz < GRID_RADIUS; gz++) {
      const roadLeft = gx * ROAD_SPACING;
      const roadRight = (gx + 1) * ROAD_SPACING;
      const roadTop = gz * ROAD_SPACING;
      const roadBottom = (gz + 1) * ROAD_SPACING;

      const blockMinX = roadLeft + ROAD_EDGE;
      const blockMaxX = roadRight - ROAD_EDGE;
      const blockMinZ = roadTop + ROAD_EDGE;
      const blockMaxZ = roadBottom - ROAD_EDGE;

      const blockCX = (blockMinX + blockMaxX) / 2;
      const blockCZ = (blockMinZ + blockMaxZ) / 2;
      const blockW = blockMaxX - blockMinX;
      const blockD = blockMaxZ - blockMinZ;

      // Sidewalk fills the whole non-road block.
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(blockW, .48, blockD),
        sidewalkMat
      );
      sidewalk.position.set(blockCX, .29, blockCZ);
      sidewalk.receiveShadow = true;
      cityGroup.add(sidewalk);

      // Leave a wide pavement ring around all buildings.
      const safeMinX = blockMinX + SIDEWALK + BUILDING_MARGIN;
      const safeMaxX = blockMaxX - SIDEWALK - BUILDING_MARGIN;
      const safeMinZ = blockMinZ + SIDEWALK + BUILDING_MARGIN;
      const safeMaxZ = blockMaxZ - SIDEWALK - BUILDING_MARGIN;

      const safeW = safeMaxX - safeMinX;
      const safeD = safeMaxZ - safeMinZ;
      if (safeW < 20 || safeD < 20) continue;

      const centerBoost = 1 - Math.min(1, Math.hypot(blockCX, blockCZ) / 520);

      // 2x2 layout only. This prevents any façade from entering a road.
      const gap = 4;
      const cellW = (safeW - gap) / 2;
      const cellD = (safeD - gap) / 2;

      const cellCenters = [
        [safeMinX + cellW / 2, safeMinZ + cellD / 2],
        [safeMaxX - cellW / 2, safeMinZ + cellD / 2],
        [safeMinX + cellW / 2, safeMaxZ - cellD / 2],
        [safeMaxX - cellW / 2, safeMaxZ - cellD / 2]
      ];

      const count = 3 + (seededRandom(seed++) > .45 ? 1 : 0);

      for (let i = 0; i < count; i++) {
        const [cx, cz] = cellCenters[i];

        // Building size is always smaller than its cell.
        const bw = Math.min(cellW - 3, 16 + seededRandom(seed + i * 7) * 5);
        const bd = Math.min(cellD - 3, 16 + seededRandom(seed + i * 11) * 5);

        let bh = 48 + seededRandom(seed + i * 17) * 72 + centerBoost * 30;
        if (seededRandom(seed + i * 29) > .86) {
          bh += 55 + seededRandom(seed + i * 37) * 55;
        }

        const mat = facadeMats[Math.floor(seededRandom(seed + i * 23) * facadeMats.length)];
        const roofMat = roofMats[Math.floor(seededRandom(seed + i * 31) * roofMats.length)];

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          [mat, mat, roofMat, roofMat, mat, mat]
        );
        building.position.set(cx, bh / 2 + .58, cz);
        building.castShadow = true;
        building.receiveShadow = true;
        cityGroup.add(building);

        if (bh > 105 && seededRandom(seed + i * 43) > .45) {
          const capH = 3 + seededRandom(seed + i * 47) * 4;
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(bw * .45, capH, bd * .45),
            roofMat
          );
          cap.position.set(cx, bh + .58 + capH / 2, cz);
          cap.castShadow = true;
          cityGroup.add(cap);
        }

        buildingBoxes.push({
          minX: cx - bw / 2 - .7,
          maxX: cx + bw / 2 + .7,
          minZ: cz - bd / 2 - .7,
          maxZ: cz + bd / 2 + .7
        });

        // Entrance faces the nearest outside edge of this city block.
        const relX = cx - blockCX;
        const relZ = cz - blockCZ;
        const doorMat = new THREE.MeshStandardMaterial({
          color: 0x382a20,
          roughness: .75,
          metalness: .05
        });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd447 });

        let doorX = cx;
        let doorZ = cz;
        let enterX = cx;
        let enterZ = cz;
        let door;

        if (Math.abs(relX) >= Math.abs(relZ)) {
          const side = relX >= 0 ? 1 : -1;
          doorX = cx + side * (bw / 2 + .10);
          enterX = cx + side * (bw / 2 + 2.35);
          door = new THREE.Mesh(new THREE.BoxGeometry(.24, 3.2, 1.8), doorMat);
          door.position.set(doorX, 2.18, cz);
        } else {
          const side = relZ >= 0 ? 1 : -1;
          doorZ = cz + side * (bd / 2 + .10);
          enterZ = cz + side * (bd / 2 + 2.35);
          door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, .24), doorMat);
          door.position.set(cx, 2.18, doorZ);
        }

        cityGroup.add(door);

        const sign = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), glowMat);
        sign.position.set(doorX, 4.05, doorZ);
        cityGroup.add(sign);

        buildingEntrances.push({
          x: enterX,
          z: enterZ,
          doorX,
          doorZ
        });
      }

      seed += 9;
    }
  }

  // Tall landmarks are also snapped to BLOCK CENTERS, never placed on a road.
  const landmarkBlocks = [
    [-4,-4,205,0],
    [3,-4,190,1],
    [-4,3,178,2],
    [3,3,215,3],
    [1,-3,165,4],
    [-2,2,172,5]
  ];

  landmarkBlocks.forEach(([gx,gz,h,m], idx) => {
    const x = (gx + .5) * ROAD_SPACING;
    const z = (gz + .5) * ROAD_SPACING;
    const w = 19;
    const d = 19;
    const mat = facadeMats[m % facadeMats.length];
    const roofMat = roofMats[idx % roofMats.length];

    // Remove overlap visually by making landmarks narrow enough to stay well inside their block.
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [mat, mat, roofMat, roofMat, mat, mat]
    );
    tower.position.set(x, h / 2 + .58, z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    cityGroup.add(tower);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(w * .55, 6, d * .55),
      roofMat
    );
    crown.position.set(x, h + 3.6, z);
    cityGroup.add(crown);

    buildingBoxes.push({
      minX: x - w/2 - .7,
      maxX: x + w/2 + .7,
      minZ: z - d/2 - .7,
      maxZ: z + d/2 + .7
    });
  });

  // Distant skyline stays outside the playable road grid.
  for (let i = 0; i < 80; i++) {
    const angle = (i / 80) * Math.PI * 2;
    const radius = 575 + seededRandom(800 + i) * 115;
    const bx = Math.cos(angle) * radius;
    const bz = Math.sin(angle) * radius;
    const bw = 24 + seededRandom(900 + i) * 22;
    const bd = 22 + seededRandom(1000 + i) * 22;
    const bh = 65 + seededRandom(1100 + i) * 140;
    const mat = facadeMats[i % facadeMats.length];
    const roofMat = roofMats[i % roofMats.length];

    const b = new THREE.Mesh(
      new THREE.BoxGeometry(bw, bh, bd),
      [mat, mat, roofMat, roofMat, mat, mat]
    );
    b.position.set(bx, bh / 2, bz);
    cityGroup.add(b);
  }
}
function createInterior() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b7f72, roughness: .95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2ded6, roughness: .92 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x3b4652, roughness: .75 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x76513d, roughness: .9 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(22, .4, 22), floorMat);
  floor.position.y = -.2;
  floor.receiveShadow = true;
  interiorGroup.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(22, 7, .5), wallMat);
  back.position.set(0, 3.5, -11);
  interiorGroup.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(.5, 7, 22), wallMat);
  left.position.set(-11, 3.5, 0);
  interiorGroup.add(left);

  const right = left.clone();
  right.position.x = 11;
  interiorGroup.add(right);

  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(8.4, 7, .5), wallMat);
  frontLeft.position.set(-6.8, 3.5, 11);
  interiorGroup.add(frontLeft);

  const frontRight = frontLeft.clone();
  frontRight.position.x = 6.8;
  interiorGroup.add(frontRight);

  const topDoor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.2, .5), wallMat);
  topDoor.position.set(0, 5.9, 11);
  interiorGroup.add(topDoor);

  const exitDoor = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 4.5, .22),
    new THREE.MeshStandardMaterial({ color: 0x382a20, roughness: .75 })
  );
  exitDoor.position.set(0, 2.25, 10.72);
  interiorGroup.add(exitDoor);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2), woodMat);
  counter.position.set(0, .6, -6.6);
  counter.castShadow = true;
  interiorGroup.add(counter);

  const sofa = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.4, 2.2), accentMat);
  sofa.position.set(-5.2, .7, 1.8);
  sofa.castShadow = true;
  interiorGroup.add(sofa);

  const table = new THREE.Mesh(new THREE.BoxGeometry(3, .35, 2), woodMat);
  table.position.set(4.8, 1.1, 2.1);
  table.castShadow = true;
  interiorGroup.add(table);

  const lamp = new THREE.PointLight(0xffe4b5, 1.15, 32);
  lamp.position.set(0, 5.5, 0);
  interiorGroup.add(lamp);

  const lamp2 = new THREE.PointLight(0xc9e8ff, 0.7, 22);
  lamp2.position.set(-7, 4.8, -5);
  interiorGroup.add(lamp2);
}

function nearestEntrance(maxDistance = 3.5) {
  if (!walker || !walker.visible) return null;

  let nearest = null;
  let best = maxDistance;

  for (const entry of buildingEntrances) {
    const dx = walker.position.x - entry.x;
    const dz = walker.position.z - entry.z;
    const d = Math.hypot(dx, dz);

    if (d < best) {
      best = d;
      nearest = entry;
    }
  }

  return nearest;
}

function enterBuilding(entry) {
  if (!entry || mode !== 'walk') return;

  outsideReturn = {
    position: walker.position.clone(),
    heading: walkHeading
  };

  mode = 'interior';
  speed = 0;

  cityGroup.visible = false;
  playerCar.visible = false;
  missionMarker.visible = false;
  traffic.forEach(t => t.mesh.visible = false);

  interiorGroup.visible = true;
  walker.visible = true;
  walker.position.set(0, 0, 7.2);
  walkHeading = Math.PI;
  walker.rotation.y = walkHeading;

  updateHud();
  updateCamera(true);
}

function exitBuilding() {
  if (mode !== 'interior') return;

  interiorGroup.visible = false;
  cityGroup.visible = true;
  playerCar.visible = true;
  missionMarker.visible = true;
  traffic.forEach(t => t.mesh.visible = true);

  mode = 'walk';
  walker.visible = true;

  if (outsideReturn) {
    walker.position.copy(outsideReturn.position);
    walkHeading = outsideReturn.heading;
    walker.rotation.y = walkHeading;
  }

  updateHud();
  updateCamera(true);
}

function createCar(color = 0xffffff) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: .24,
    metalness: .30
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111820,
    roughness: .42,
    metalness: .34
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x183847,
    roughness: .10,
    metalness: .20,
    transparent: true,
    opacity: .90
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x090a0c,
    roughness: .96
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xbec8d0,
    roughness: .18,
    metalness: .86
  });
  const redMat = new THREE.MeshStandardMaterial({
    color: 0xff2945,
    emissive: 0x650009,
    emissiveIntensity: .72
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xf4fbff,
    emissive: 0xc9efff,
    emissiveIntensity: 1.0,
    roughness: .10
  });

  // Low, wide sports-car body.
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(4.65, .52, 8.15),
    bodyMat
  );
  chassis.position.y = .92;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 30, 16),
    bodyMat
  );
  shell.scale.set(2.45, .63, 3.95);
  shell.position.set(0, 1.26, .10);
  shell.castShadow = true;
  group.add(shell);

  // Front of Vertex City is +Z.
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 14),
    bodyMat
  );
  hood.scale.set(2.28, .38, 2.08);
  hood.position.set(0, 1.48, 2.45);
  hood.castShadow = true;
  group.add(hood);

  const rearDeck = new THREE.Mesh(
    new THREE.BoxGeometry(4.05, .24, 1.55),
    bodyMat
  );
  rearDeck.position.set(0, 1.47, -3.05);
  rearDeck.castShadow = true;
  group.add(rearDeck);

  // No rear wing/spoiler on the Vertex City car.

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 14),
    glassMat
  );
  canopy.scale.set(1.62, .78, 1.68);
  canopy.position.set(0, 2.18, -.25);
  canopy.rotation.x = .035;
  canopy.castShadow = true;
  group.add(canopy);

  const roofSpine = new THREE.Mesh(
    new THREE.BoxGeometry(.24, .10, 2.2),
    bodyMat
  );
  roofSpine.position.set(0, 2.88, -.20);
  group.add(roofSpine);

  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(
      new THREE.BoxGeometry(.12, .42, 1.55),
      darkMat
    );
    intake.position.set(side * 2.38, 1.22, -.85);
    intake.rotation.z = side * .045;
    group.add(intake);

    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(.18, .18, 4.9),
      darkMat
    );
    skirt.position.set(side * 2.37, .68, .05);
    group.add(skirt);
  }

  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(4.20, .12, .52),
    darkMat
  );
  splitter.position.set(0, .62, 4.05);
  group.add(splitter);

  const wheelR = .76;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, .68, 22);
  const rimGeo = new THREE.CylinderGeometry(.40, .40, .72, 20);
  const wheelPositions = [
    [-2.30, .76, 2.55], [2.30, .76, 2.55],
    [-2.30, .76, -2.55], [2.30, .76, -2.55]
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

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(.12, .12, .74, 14),
      darkMat
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, y, z);
    group.add(hub);
  }

  for (const x of [-1.45, 1.45]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(.90, .18, .12),
      headMat
    );
    light.position.set(x, 1.30, 4.16);
    group.add(light);
  }

  for (const x of [-1.45, 1.45]) {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(.82, .20, .13),
      redMat
    );
    tail.position.set(x, 1.25, -4.10);
    group.add(tail);
  }

  const diffuser = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, .16, .34),
    darkMat
  );
  diffuser.position.set(0, .66, -4.05);
  group.add(diffuser);

  group.userData.radius = 3.5;
  return group;
}
function createWalker(shirtColor = 0x4e77ff) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: .8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8bc98, roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2832, roughness: .9 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, 1.8, 12), shirt);
  body.position.y = 1.85;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.52, 16, 12), skin);
  head.position.y = 3.35;
  head.castShadow = true;
  g.add(head);

  const legGeo = new THREE.CylinderGeometry(.16, .18, 1.1, 8);
  const leg1 = new THREE.Mesh(legGeo, dark);
  leg1.position.set(-.28, .62, 0);
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
  const colors = [
    0xf34f57, 0x4bbfff, 0x9f79ff, 0x64d894, 0xf1c24d,
    0xffffff, 0x30363d, 0xff8c42, 0x4fd1c5
  ];

  const totalCars = 18;

  for (let i = 0; i < totalCars; i++) {
    const alongZ = i % 2 === 0;
    const road = roadLines[(i * 5 + 2) % roadLines.length];
    const dir = i % 4 < 2 ? 1 : -1;
    const car = createCar(colors[i % colors.length]);

    // Spread traffic across many streets so the city feels busy
    // without putting all cars in one traffic jam.
    const travelSpan = CITY_HALF * 2 + 70;
    const progress = ((i * 157) % Math.floor(travelSpan)) - CITY_HALF;

    if (alongZ) {
      car.position.set(
        road + (dir > 0 ? -6 : 6),
        0,
        progress
      );
      car.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      car.position.set(
        progress,
        0,
        road + (dir > 0 ? 6 : -6)
      );
      car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    scene.add(car);
    traffic.push({
      mesh: car,
      alongZ,
      dir,
      road,
      speed: 10.5 + (i % 5) * 1.35
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
  speedEl.textContent = mode === 'drive' ? Math.round(Math.abs(speed) * 4.2) : 0;

  const modeName = value => value === 'drive' ? 'قيادة' : (value === 'interior' ? 'داخل مبنى' : 'مشي');
  modeEl.textContent = `P1 ${modeName(mode)} | P2 ${modeName(mode2)}`;

  const nearCar = mode === 'walk' && walker.visible && walker.position.distanceTo(playerCar.position) < 7;

  if (mode === 'drive') actionBtn.textContent = 'P1: E نزول';
  else if (mode === 'interior') actionBtn.textContent = 'P1: E خروج';
  else if (nearCar) actionBtn.textContent = 'P1: E ركوب';
  else actionBtn.textContent = 'P1: E';

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

  speed2 = 0;
  heading2 = 0;
  walkHeading2 = 0;
  walkBob2 = 0;
  mode2 = 'drive';

  cameraYawOffset = 0;
  outsideReturn = null;

  cityGroup.visible = true;
  interiorGroup.visible = false;
  missionMarker.visible = true;
  traffic.forEach(t => t.mesh.visible = true);

  playerCar.position.set(-5, 0, -36);
  playerCar.rotation.y = heading;
  playerCar.visible = true;

  walker.visible = false;
  walker.position.copy(playerCar.position);

  playerCar2.position.set(5, 0, -36);
  playerCar2.rotation.y = heading2;
  playerCar2.visible = true;

  walker2.visible = false;
  walker2.position.copy(playerCar2.position);

  placeMission();
  updateHud();
  updateCamera(true);
  renderer.render(scene, camera);

  showOverlay(
    '🏙️',
    'Vertex City 3D',
    'وضع لاعبين: P1 بـ WASD + E، وP2 بالأسهم + Enter. قد السيارة أو انزل وتمشَّ معاً.',
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

  if (mode === 'interior') {
    exitBuilding();
    return;
  }

  if (mode === 'drive') {
    speed = 0;
    mode = 'walk';

    const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(4.8);
    walker.position.copy(playerCar.position).add(side);
    walkHeading = heading;
    walker.rotation.y = walkHeading;
    walker.visible = true;
    updateHud();
    return;
  }

  if (walker.position.distanceTo(playerCar.position) <= 7) {
    mode = 'drive';
    walker.visible = false;
    heading = playerCar.rotation.y;
    speed = 0;
  }

  updateHud();
}
function updateDrive(dt) {
  const forward = keys.w;
  const backward = keys.s;
  const left = keys.a;
  const right = keys.d;

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
  const forward = keys.w;
  const backward = keys.s;
  const left = keys.a;
  const right = keys.d;

  const turn = (left ? 1 : 0) - (right ? 1 : 0);
  walkHeading += turn * dt * 2.2;

  let move = 0;
  if (forward) move += 1;
  if (backward) move -= .72;

  if (move) {
    const dir = new THREE.Vector3(Math.sin(walkHeading), 0, Math.cos(walkHeading));
    const candidate = walker.position.clone().addScaledVector(dir, move * 8.4 * dt);

    if (mode === 'interior') {
      candidate.x = THREE.MathUtils.clamp(candidate.x, -9.2, 9.2);
      candidate.z = THREE.MathUtils.clamp(candidate.z, -9.2, 9.2);
      walker.position.copy(candidate);
    } else if (!isInsideBuilding(candidate.x, candidate.z, .8)) {
      walker.position.copy(candidate);
    }

    walkBob += dt * 10;
    score += Math.abs(move) * dt * .22;
  }

  if (mode !== 'interior') clampCity(walker.position);
  walker.rotation.y = walkHeading;
  walker.position.y = Math.sin(walkBob) * .035;
}

function toggleMode2() {
  if (!running) return;

  if (mode2 === 'drive') {
    speed2 = 0;
    mode2 = 'walk';

    const side = new THREE.Vector3(Math.cos(heading2), 0, -Math.sin(heading2)).multiplyScalar(4.8);
    walker2.position.copy(playerCar2.position).add(side);
    walkHeading2 = heading2;
    walker2.rotation.y = walkHeading2;
    walker2.visible = true;
    updateHud();
    return;
  }

  if (walker2.position.distanceTo(playerCar2.position) <= 7) {
    mode2 = 'drive';
    walker2.visible = false;
    heading2 = playerCar2.rotation.y;
    speed2 = 0;
  }

  updateHud();
}

function updateDrive2(dt) {
  const forward = keys.ArrowUp;
  const backward = keys.ArrowDown;
  const left = keys.ArrowLeft;
  const right = keys.ArrowRight;

  if (forward) speed2 += 24 * dt;
  else if (backward) speed2 -= 21 * dt;
  else speed2 *= Math.pow(.23, dt);

  speed2 = THREE.MathUtils.clamp(speed2, -13, 38);

  if (Math.abs(speed2) > .35) {
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    heading2 += steer * dt * (1.25 + Math.min(Math.abs(speed2) / 24, .8)) * Math.sign(speed2);
  }

  const forwardVec = new THREE.Vector3(Math.sin(heading2), 0, Math.cos(heading2));
  const candidate = playerCar2.position.clone().addScaledVector(forwardVec, speed2 * dt);

  if (!isInsideBuilding(candidate.x, candidate.z, 2.7)) {
    playerCar2.position.copy(candidate);
  } else {
    speed2 *= -.16;
  }

  clampCity(playerCar2.position);
  playerCar2.rotation.y = heading2;
  score += Math.abs(speed2) * dt * .38;
}

function updateWalk2(dt) {
  const forward = keys.ArrowUp;
  const backward = keys.ArrowDown;
  const left = keys.ArrowLeft;
  const right = keys.ArrowRight;

  const turn = (left ? 1 : 0) - (right ? 1 : 0);
  walkHeading2 += turn * dt * 2.2;

  let move = 0;
  if (forward) move += 1;
  if (backward) move -= .72;

  if (move) {
    const dir = new THREE.Vector3(Math.sin(walkHeading2), 0, Math.cos(walkHeading2));
    const candidate = walker2.position.clone().addScaledVector(dir, move * 8.4 * dt);

    if (!isInsideBuilding(candidate.x, candidate.z, .8)) {
      walker2.position.copy(candidate);
    }

    walkBob2 += dt * 10;
    score += Math.abs(move) * dt * .22;
  }

  clampCity(walker2.position);
  walker2.rotation.y = walkHeading2;
  walker2.position.y = Math.sin(walkBob2) * .035;
}

function updateTraffic(dt) {
  if (mode === 'interior') return;

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

    if (mode === 'drive' && t.mesh.position.distanceTo(playerCar.position) < 6.2) {
      speed *= -.28;
      score = Math.max(0, score - 40);
      const push = playerCar.position.clone().sub(t.mesh.position).setY(0);
      if (push.lengthSq() > .001) {
        push.normalize().multiplyScalar(2.2);
        playerCar.position.add(push);
      }
    }

    if (mode2 === 'drive' && t.mesh.position.distanceTo(playerCar2.position) < 6.2) {
      speed2 *= -.28;
      score = Math.max(0, score - 40);
      const push2 = playerCar2.position.clone().sub(t.mesh.position).setY(0);
      if (push2.lengthSq() > .001) {
        push2.normalize().multiplyScalar(2.2);
        playerCar2.position.add(push2);
      }
    }
  }
}

function updateMission(dt) {
  if (mode === 'interior') return;

  missionMarker.rotation.y += dt * .7;
  missionMarker.position.y = .2 + Math.sin(elapsed * 2.4) * .25;

  const active1 = mode === 'drive' ? playerCar : walker;
  const active2 = mode2 === 'drive' ? playerCar2 : walker2;
  const reached1 = active1.position.distanceTo(currentMission) < (mode === 'drive' ? 8 : 5);
  const reached2 = active2.position.distanceTo(currentMission) < (mode2 === 'drive' ? 8 : 5);

  if (reached1 || reached2) {
    score += (reached1 && mode !== 'drive') || (reached2 && mode2 !== 'drive') ? 300 : 240;
    mission += 1;
    placeMission();
  }
}

function updateCamera(force = false) {
  const active1 = mode === 'drive' ? playerCar : walker;
  const active2 = mode2 === 'drive' ? playerCar2 : walker2;

  const center = active1.position.clone().add(active2.position).multiplyScalar(.5);
  const separation = active1.position.distanceTo(active2.position);
  const ang = (mode === 'drive' ? heading : walkHeading) + cameraYawOffset;

  const dist = THREE.MathUtils.clamp(15 + separation * .35, 15, 38);
  const height = THREE.MathUtils.clamp(8 + separation * .25, 8, 28);

  const offset = new THREE.Vector3(
    -Math.sin(ang) * dist,
    height,
    -Math.cos(ang) * dist
  );

  const desired = center.clone().add(offset);
  if (force) camera.position.copy(desired);
  else camera.position.lerp(desired, .10);

  const target = center.clone();
  target.y += 1.8;
  camera.lookAt(target);
}

function update(dt) {
  elapsed += dt;

  if (mode === 'drive') updateDrive(dt);
  else updateWalk(dt);

  if (mode2 === 'drive') updateDrive2(dt);
  else updateWalk2(dt);

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

    if ((key === 'e' || key === 'ث') && !e.repeat) {
      e.preventDefault();
      toggleMode();
      return;
    }

    if (key === 'enter' && !e.repeat) {
      e.preventDefault();
      toggleMode2();
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
    const map = { up:'w', down:'s', left:'a', right:'d' };
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
createInterior();

playerCar = createCar(0xe8edf1);
scene.add(playerCar);

walker = createWalker(0x4e77ff);
scene.add(walker);

playerCar2 = createCar(0xff7a45);
scene.add(playerCar2);

walker2 = createWalker(0xff7a45);
scene.add(walker2);

missionMarker = createMissionMarker();
makeTraffic();
bindControls();
reset();
