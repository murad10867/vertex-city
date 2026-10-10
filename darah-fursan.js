// Darah Al Fursan district for Vertex City 3D.
// Conceptual placement based on the supplied marketing brochure, not surveyed coordinates.
// Villas are InstancedMesh prototypes (606 houses, four styles) to reduce WebGL load.
(function () {
  'use strict';

  const CIVIC = {
    '-1,-5': ['حديقة الحي', 'park'],
    '-1,-1': ['مسجد دارة الفرسان', 'mosque'],
    '-1,2':  ['البريد والخدمات', 'office'],
    '4,-5':  ['حديقة شمالية', 'park'],
    '4,2':   ['المسجد الجامع', 'mosque'],
    '2,-2':  ['الحديقة المركزية', 'park'],
    '1,-3':  ['المكتبة', 'library'],
    '2,1':   ['مدرسة البنات المتوسطة', 'school'],
    '0,1':   ['مدرسة البنات الابتدائية', 'school'],
    '3,-4':  ['مدرسة البنات الثانوية', 'school']
  };
  const allBlocks = [];
  const villaBlocks = [];
  for (let gz = -5; gz <= 2; gz++) {
    for (let gx = -1; gx <= 4; gx++) {
      const code = gx + ',' + gz;
      allBlocks.push({ gx, gz, code });
      if (!CIVIC[code]) villaBlocks.push({ gx, gz, code });
    }
  }
  // These codes preserve the brochure-derived proportions of the four types:
  // A=Villa 1a (53), B=Villa 1b (60), 2=Villa 2 (70), 3=Villa 3 (423).
  // '-' denotes the two spare plot positions in the 38*16 layout.
  const SITES = [
    '333333333333333333333333333333333333333333333333333233323222222B',
    '3333333333333333333333333333333333333333333333333333333233233322',
    'BBBB3BBB3BB3BB3333333333333333333333333333333333322323232223323B',
    'BBB3BB3BBBBBBBB333A33333B3333A3333333333333333333333333333333333',
    '3333333333333333B3A3BAAABAAAAAAA333333333A333A33333333333B3333B3',
    '33B3333B3BB222223BB3BBBBBBB32B3AAAAAAAAAAAAAAAAAA333A33333333333',
    '3333333333333333B33B3B3232223222222222222222222223AABBBA323A2B33',
    'AAAAAAAA3AA3AAA333333333333333333332B3B23B22-22222B323B33333B333',
    '33333333333333333333333AA3333333222B22232233-3333333333333333333',
    '33333333333333333333333333333333'
  ].join('');
  window.DARAH_BLOCKS = new Set(allBlocks.map(b => b.code));
  window.DARAH_CENTER = { x: 125, z: -90 };

  window.addDarahFursanDistrict = function (cfg) {
    const { THREE, cityGroup, buildingBoxes, buildingEntrances, ROAD_SPACING, ROAD_WIDTH } = cfg;
    if (!THREE || !THREE.InstancedMesh) return;
    if (SITES.length !== villaBlocks.length * 16) {
      console.error('Darah layout is incomplete:', SITES.length);
      return;
    }

    const materials = {
      base: new THREE.MeshStandardMaterial({color: 0xd4d0c8, roughness: .94}),
      ivory: new THREE.MeshStandardMaterial({color: 0xe8e3d9, roughness: .89}),
      grey: new THREE.MeshStandardMaterial({color: 0xaaa9a6, roughness: .94}),
      bronze: new THREE.MeshStandardMaterial({color: 0x8e6f51, roughness: .8}),
      trim: new THREE.MeshStandardMaterial({color: 0x282a2c, roughness: .55}),
      glass: new THREE.MeshStandardMaterial({color: 0x42616a, roughness: .28, metalness: .15}),
      wood: new THREE.MeshStandardMaterial({color: 0x604b3b, roughness: .75}),
      lawn: new THREE.MeshStandardMaterial({color: 0x59855b, roughness: 1}),
      paths: new THREE.MeshStandardMaterial({color: 0xc9c4b7, roughness: .96}),
      school: new THREE.MeshStandardMaterial({color: 0xcbb695, roughness: .92}),
      mosque: new THREE.MeshStandardMaterial({color: 0xf0e7d3, roughness: .84}),
      park: new THREE.MeshStandardMaterial({color: 0x61925e, roughness: 1}),
      leaf: new THREE.MeshStandardMaterial({color: 0x346f47, roughness: 1})
    };
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 128;
    patternCanvas.height = 128;
    const pen = patternCanvas.getContext('2d');
    pen.fillStyle = '#856a50'; pen.fillRect(0,0,128,128);
    for (let r=0;r<8;r++) {
      for (let c=0;c<8;c++) {
        const x=c*16+(r%2)*8, y=r*16;
        pen.fillStyle = (r+c)%4 ? '#d3b794' : '#5c4739';
        pen.beginPath();
        pen.moveTo(x,y+14);pen.lineTo(x+8,y);pen.lineTo(x+16,y+14);
        pen.closePath();pen.fill();
      }
    }
    const latticeTexture = new THREE.CanvasTexture(patternCanvas);
    latticeTexture.colorSpace = THREE.SRGBColorSpace || undefined;
    const latticeMaterial = new THREE.MeshStandardMaterial({map:latticeTexture, roughness:.90});

    const lots = {'A':[], 'B':[], '2':[], '3':[]};
    let index=0;
    for (const b of villaBlocks) {
      for (let row=0;row<4;row++) {
        for (let col=0;col<4;col++) {
          const type=SITES.charAt(index++);
          if (!lots[type]) continue;
          const x = (b.gx + .5)*ROAD_SPACING + (col-1.5)*15;
          const z = (b.gz + .5)*ROAD_SPACING + (row-1.5)*15;
          const angle = row===0 ? 0 : row===3 ? Math.PI :
            col===0 ? Math.PI/2 : col===3 ? -Math.PI/2 :
            row===1 ? 0 : Math.PI;
          lots[type].push({x,z,angle});
        }
      }
    }

    const dummy=new THREE.Object3D();
    const boxGeometry=(w,h,d,x,y,z)=>{
      const g=new THREE.BoxGeometry(w,h,d);
      g.translate(x,y,z);
      return g;
    };

    Object.keys(lots).forEach((type)=>{
      const homes=lots[type];
      if (!homes.length) return;
      const big=(type==='A'||type==='B');
      const width=big?9.7:8.8, depth=big?12:11.2;
      const featureX=(type==='2'||type==='3') ? width*.27 : -width*.27;
      const bodyColor=type==='3'?materials.grey:materials.ivory;
      const faceColor=(type==='A'||type==='B')?materials.base:materials.grey;
      const front=-depth/2;
      const parts=[
        [width,2.96,depth,0,2.02,0,materials.base],
        [width+.18,3.06,depth+.10,0,5.03,0,bodyColor],
        [width+.40,.22,depth+.32,0,6.66,0,materials.ivory],
        [width*.63,2.35,.18,(type==='2'||type==='3')?-width*.18:width*.18,5.06,front-.18,faceColor],
        [width*.32,2.32,.12,featureX,5.13,front-.29,latticeMaterial],
        [width*.30,1.03,.10,featureX,4.49,front-.38,materials.trim],
        [width*.27,.85,.105,featureX,4.50,front-.45,materials.glass],
        [width*.31,1.40,.095,width*.22,2.00,front-.20,materials.trim],
        [width*.28,1.27,.10,width*.22,2.02,front-.27,materials.glass],
        [1.32,2.30,.14,-width*.27,1.76,front-.21,materials.wood],
        [width*.45,2.28,depth*.36,width*.24,7.91,depth*.23,bodyColor],
        [width*.48,.19,depth*.38,width*.24,9.17,depth*.23,materials.ivory],
        [1.35,1.25,.09,width/2+.15,4.73,0,materials.glass],
        [1.35,1.25,.09,width/2+.15,2.10,depth*.22,materials.glass],
        [width*.45,.08,2.2,0,.63,front-1.3,materials.paths],
        [2.30,.10,2.1,width*.31,.63,front-1.4,materials.lawn]
      ];
      parts.forEach((p,pidx)=>{
        const [w,h,d,ox,oy,oz,mat]=p;
        const geo=boxGeometry(w,h,d,ox,oy,oz);
        const mesh=new THREE.InstancedMesh(geo,mat,homes.length);
        mesh.name='Darah '+type+' | part '+pidx;
        mesh.frustumCulled=false;
        // No per-villa dynamic shadows: keeps the two-player game responsive.
        mesh.castShadow=false;
        mesh.receiveShadow=pidx<3;
        for(let i=0;i<homes.length;i++){
          const home=homes[i];
          dummy.position.set(home.x,0,home.z);
          dummy.rotation.set(0,home.angle,0);
          dummy.scale.set(1,1,1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i,dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate=true;
        cityGroup.add(mesh);
      });
      homes.forEach(home=>{
        const oriented=Math.abs(Math.sin(home.angle))>.5;
        const halfX=(oriented?depth:width)/2;
        const halfZ=(oriented?width:depth)/2;
        buildingBoxes.push({
          minX:home.x-halfX-.25,maxX:home.x+halfX+.25,
          minZ:home.z-halfZ-.25,maxZ:home.z+halfZ+.25
        });
        const lx=-width*.27;
        const frontZ=-depth/2;
        const cos=Math.cos(home.angle),sin=Math.sin(home.angle);
        const doorX=home.x+lx*cos+frontZ*sin;
        const doorZ=home.z-lx*sin+frontZ*cos;
        buildingEntrances.push({
          x:doorX-1.5*sin,
          z:doorZ-1.5*cos,
          doorX,doorZ,
          district:'Darah Al Fursan',
          villaType:type
        });
      });
    });

    function cube(name,w,h,d,x,y,z,mat) {
      const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      obj.name=name;
      obj.position.set(x,y,z);
      obj.receiveShadow=true;
      cityGroup.add(obj);
      return obj;
    }

    // Park, civic and education anchors are simplified positions, not GIS data.
    const amenities=Object.entries(CIVIC);
    amenities.forEach(([key,entry])=>{
      const pair=key.split(',').map(Number);
      const x=(pair[0]+.5)*ROAD_SPACING, z=(pair[1]+.5)*ROAD_SPACING;
      const label=entry[0], kind=entry[1];
      cube('Darah '+label+' plot',62,.10,62,x,.64,z,
        kind==='park'?materials.park:materials.paths);
      if(kind==='park'){
        cube(label+' promenade',5,.05,54,x,.73,z,materials.paths);
        cube(label+' cross path',54,.05,5,x,.74,z,materials.paths);
      } else {
        const width=kind==='school'?41:kind==='mosque'?32:kind==='library'?24:28;
        const height=kind==='school'?9.5:kind==='mosque'?7:5;
        const depth=kind==='school'?29:kind==='mosque'?27:21;
        cube(label,width,height,depth,x,.70+height/2,z,
          kind==='school'?materials.school:kind==='mosque'?materials.mosque:materials.ivory);
        cube(label+' roof',width+.6,.28,depth+.6,x,.75+height,z,materials.ivory);
        buildingBoxes.push({minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2});
        if(kind==='mosque'){
          const dome=new THREE.Mesh(
            new THREE.SphereGeometry(6,16,10,0,Math.PI*2,0,Math.PI/2),
            materials.mosque
          );
          dome.position.set(x,height+.84,z);
          cityGroup.add(dome);
          cube(label+' minaret',2.4,18,2.4,x+width/2-4,9.8,z+depth/2-4,materials.mosque);
        }
      }
      // Reduced tree count: non-interactive ornamental plants.
      for(let n=0;n<4;n++){
        const az=n*Math.PI/2+.35;
        const tx=x+Math.cos(az)*24,tz=z+Math.sin(az)*24;
        cube(label+' tree trunk',.45,2.6,.45,tx,1.95,tz,materials.wood);
        const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.3,0),materials.leaf);
        crown.position.set(tx,4.2,tz);cityGroup.add(crown);
      }
    });

    // Entrance billboard toward the main city streets.
    const signCanvas=document.createElement('canvas');
    signCanvas.width=512;signCanvas.height=128;
    const c=signCanvas.getContext('2d');
    c.fillStyle='#42624d';c.fillRect(0,0,512,128);
    c.fillStyle='#ffffff';c.textAlign='center';
    c.font='bold 58px Tahoma,Arial,sans-serif';
    c.fillText('دارة الفرسان',256,75);
    c.font='25px Arial';c.fillText('DARAH AL FURSAN',256,112);
    const sign=new THREE.Mesh(
      new THREE.PlaneGeometry(22,5.5),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(signCanvas),side:THREE.DoubleSide})
    );
    sign.position.set(-15,8,-100);
    cityGroup.add(sign);
    cube('Darah entrance sign pillar',1.2,8,.9,-25,4.2,-100,materials.ivory);
    cube('Darah entrance sign pillar',1.2,8,.9,-5,4.2,-100,materials.ivory);
    const total=Object.values(lots).reduce((a,b)=>a+b.length,0);
    console.info('Darah Al Fursan district added:',total,'villas,',amenities.length,'civic/park blocks.');
  };
})();