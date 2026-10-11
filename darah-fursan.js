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
    latticeTexture.encoding = THREE.sRGBEncoding;
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

    // A whole neighborhood of detailed-looking villas, without creating hundreds
    // of individual THREE.Mesh objects. Each villa TYPE stores one shared mesh
    // per material, and the 606 houses are positioned through instance matrices.
    // Coordinates: X=frontage width, Y=height, Z=depth; the front faces -Z.
    const dummy=new THREE.Object3D();
    const HOUSES_ON_GROUND=0.56; // Vertex City's sidewalk stands at ~0.53m.
    const detailMats={
      darkGlass:new THREE.MeshStandardMaterial({color:0x435861,roughness:.23,metalness:.22}),
      garden:new THREE.MeshStandardMaterial({color:0x376b3c,roughness:1}),
      foliage:new THREE.MeshStandardMaterial({color:0x467d47,roughness:1}),
      pavers:new THREE.MeshStandardMaterial({color:0xbab8ae,roughness:.95}),
      white:new THREE.MeshStandardMaterial({color:0xe8e5df,roughness:.81}),
      tyre:new THREE.MeshStandardMaterial({color:0x22272a,roughness:1}),
      car:new THREE.MeshStandardMaterial({color:0x737d81,roughness:.56,metalness:.18}),
      light:new THREE.MeshStandardMaterial({color:0xffdf96,roughness:.28})
    };
    // Share all six faces in one geometrical batch for each material. Unlike
    // an ordinary instanced cube, the entire facade (many architectural boxes)
    // is one instanced mesh and therefore has only ONE draw call per material.
    function combinedBoxGeometry(boxes){
      const vertices=[],normals=[],indices=[];
      const faces=[
        [[1,5,6,2],[1,0,0]],[[4,0,3,7],[-1,0,0]],
        [[3,2,6,7],[0,1,0]],[[0,4,5,1],[0,-1,0]],
        [[5,4,7,6],[0,0,1]],[[0,1,2,3],[0,0,-1]]
      ];
      for(const q of boxes){
        const [w,h,d,x,y,z]=q;
        const xmin=x-w/2,xmax=x+w/2,ymin=y-h/2,ymax=y+h/2,zmin=z-d/2,zmax=z+d/2;
        const corners=[
          [xmin,ymin,zmin],[xmax,ymin,zmin],[xmax,ymax,zmin],[xmin,ymax,zmin],
          [xmin,ymin,zmax],[xmax,ymin,zmax],[xmax,ymax,zmax],[xmin,ymax,zmax]
        ];
        for(const face of faces){
          const base=vertices.length/3;
          for(const k of face[0]) {
            vertices.push(...corners[k]);
            normals.push(...face[1]);
          }
          indices.push(base,base+1,base+2,base,base+2,base+3);
        }
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      geo.setIndex(indices);
      geo.computeBoundingSphere();
      return geo;
    }

    // All decorative triangles belonging to a facade share one geometry.
    // Leave intentional empty triangles so the pattern feels perforated.
    function latticeGeometry(cx,front,height,width,patternVariant) {
      const positions=[],normals=[],indices=[];
      const rows=7,cols=9;
      const stepx=width/(cols+.6), stepy=height/(rows+.55);
      const bottom=5.08;
      const z=front-.47;
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          if((r*3+c+patternVariant)%9===0)continue;
          // A small field of omitted tiles adds the larger triangular openings.
          if(r===3&&c>=3&&c<=5)continue;
          const x=cx-width/2+(c+.55)*stepx+(r%2)*stepx*.18;
          const y=bottom+(r+.5)*stepy;
          const sx=stepx*.86,hy=stepy*.84;
          const up=(r+c)%2===0;
          const tri=up?
            [[x-sx/2,y-hy/2,z],[x,y+hy/2,z],[x+sx/2,y-hy/2,z]]:
            [[x-sx/2,y+hy/2,z],[x,y-hy/2,z],[x+sx/2,y+hy/2,z]];
          const base=positions.length/3;
          for(const v of tri){positions.push(...v);normals.push(0,0,-1);}
          indices.push(base,base+1,base+2);
        }
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      g.setIndex(indices);
      return g;
    }

    const typeLabels={A:'Villa 1a',B:'Villa 1b','2':'Villa 2','3':'Villa 3'};
    const houseDetailCounts={};
    for(const [type,homes] of Object.entries(lots)){
      if(!homes.length)continue;
      const big=(type==='A'||type==='B');
      const w=big?9.7:9.1;
      const d=big?11.7:11.15;
      const front=-d/2;
      const back=d/2;
      const patternRight=(type==='2'||type==='3');
      const patternX=patternRight?w*.315:-w*.315;
      const solidX=-patternX*.72;
      const facadeMat=type==='3'?materials.grey:materials.ivory;
      const trimMat=type==='B'?materials.bronze:materials.grey;
      const groupByMaterial=new Map();
      function add(mat,w0,h0,d0,x0,y0,z0){
        if(Math.min(w0,h0,d0)<=0)return;
        if(!groupByMaterial.has(mat))groupByMaterial.set(mat,[]);
        groupByMaterial.get(mat).push([w0,h0,d0,x0,y0,z0]);
      }
      // Ground and second-floor massing. Left-front carport remains visible
      // beneath the projecting upper volume just like the supplied Blender views.
      add(materials.base,w,2.94,d,0,2.06,0);
      add(facadeMat,w+.15,3.18,d+.08,0,5.15,.0);
      add(materials.ivory,w+.40,.24,d+.42,0,6.85,0);
      add(materials.grey,w*.59,2.48,.18,solidX,5.33,front-.18);
      // The main overhang casts a front shadow on the driveway.
      add(materials.grey,w*.92,.25,1.15,-.04,3.53,front-.28);
      add(trimMat,w*.24,3.02,.14,patternX,5.36,front-.26);
      add(materials.trim,w*.32,2.45,.08,patternX,5.38,front-.36);
      // Bronze lattice border and real, individually shaped open triangles.
      add(materials.bronze,w*.34,.085,.13,patternX,6.68,front-.42);
      add(materials.bronze,w*.34,.085,.13,patternX,4.17,front-.42);
      for(const sx of [-1,1])
        add(materials.bronze,.085,2.50,.14,patternX+sx*w*.17,5.42,front-.42);
      // Upper feature picture window beneath the triangular relief.
      add(materials.trim,w*.30,1.23,.095,patternX,4.40,front-.53);
      add(detailMats.darkGlass,w*.27,1.05,.099,patternX,4.41,front-.60);
      add(materials.trim,.052,1.05,.11,patternX,4.41,front-.66);
      add(materials.trim,w*.30,.052,.12,patternX,4.00,front-.66);
      // Vertical concrete seams and upper facade trim.
      add(materials.grey,.07,2.60,.16,-w*.01,5.27,front-.28);
      add(detailMats.white,w+.46,.13,.19,0,6.95,front-.08);
      // Main door and the recessed porch.
      add(materials.trim,1.53,2.68,.12,-w*.09,1.93,front-.16);
      add(materials.wood,1.34,2.45,.13,-w*.09,1.85,front-.26);
      add(materials.bronze,.045,.58,.12,-w*.09+.42,1.88,front-.35);
      add(detailMats.light,.10,.27,.10,-w*.09+1.04,2.25,front-.25);
      // Picture windows with dark horizontal/vertical aluminum mullions.
      function windowFrame(x,y,z,sx,sy) {
        add(materials.trim,sx+.10,sy+.12,.11,x,y,z);
        add(detailMats.darkGlass,sx-.08,sy-.07,.12,x,y,z-.07);
        add(materials.trim,.045,sy,.14,x,y,z-.15);
        add(materials.trim,sx+.10,.055,.14,x,y+sy*.05,z-.15);
      }
      windowFrame(w*.285,2.04,front-.29,w*.33,1.76);
      // Tall side light beside the entry, framed separately.
      windowFrame(-w*.34,2.03,front-.31,w*.13,2.27);
      // Side windows embedded in facade (dark frames face right).
      for(const zz of [-d*.16,d*.26]){
        add(materials.trim,.10,1.60,1.34,w/2+.10,4.95,zz);
        add(detailMats.darkGlass,.11,1.46,1.21,w/2+.17,4.94,zz);
        add(materials.trim,.13,.054,1.35,w/2+.18,4.96,zz);
      }
      // Rooftop service room on the rear, with an open terrace to the front.
      const topW=w*.52,topD=d*.42,topX=w*.21,topZ=d*.245;
      add(facadeMat,topW,2.22,topD,topX,8.10,topZ);
      add(materials.grey,topW+.15,.23,topD+.15,topX,9.33,topZ);
      add(materials.ivory,w*.47,.56,.20,-w*.255,7.21,front+.27);
      add(materials.ivory,.20,.56,d*.28,-w*.48,7.21,front+d*.15);
      // Roof room narrow glazing.
      add(materials.trim,.12,1.18,1.04,topX+topW/2+.07,8.15,topZ);
      add(detailMats.darkGlass,.12,1.05,.90,topX+topW/2+.15,8.15,topZ);
      // Boundary fences are short so the facade is visible from street.
      const plotW=big?13.7:13.3,plotD=14.4;
      const left=-plotW/2+.15,right=plotW/2-.15,sideDepth=-.02;
      add(detailMats.pavers,plotW,.13,plotD,0,.63,0);
      add(materials.grey,.16,1.50,plotD,left,1.43,sideDepth);
      add(materials.grey,.16,1.50,plotD,right,1.43,sideDepth);
      add(materials.grey,plotW,.90,.16,0,1.13,plotD/2-.09);
      // Front fencing has open driveway and pedestrian gate.
      add(materials.grey,1.22,1.13,.16,right-.60,1.24,-plotD/2+.09);
      add(materials.grey,2.7,1.13,.16,left+1.35,1.24,-plotD/2+.09);
      // Front-car paved strip, vehicle slightly left of the entrance.
      add(detailMats.pavers,3.8,.08,3.05,-w*.34,.76,front-1.00);
      add(detailMats.garden,2.3,.13,2.60,w*.34,.78,front-1.20);
      // Low hedges and a small tree at the planted strip.
      add(detailMats.foliage,1.22,.46,.72,w*.39,1.07,front-1.10);
      add(detailMats.foliage,.78,.39,.78,w*.18,1.02,front-2.01);
      add(materials.wood,.20,1.4,.20,w*.33,1.51,front-1.66);
      add(detailMats.foliage,1.32,1.25,1.32,w*.33,2.47,front-1.66);
      // Lightweight vehicle in the carport. Shared body/glazing geometry
      // gives all houses a sense of scale without separate car meshes.
      const cx=-w*.35,cz=front-.86;
      add(detailMats.car,2.05,.66,3.32,cx,1.15,cz);
      add(detailMats.car,1.72,.54,1.76,cx,1.68,cz+.14);
      add(detailMats.darkGlass,1.48,.36,.08,cx,1.74,cz-.81);
      for(const xx of [-.89,.89])
        for(const zz of [-1.04,1.04])
          add(detailMats.tyre,.21,.54,.54,cx+xx,1.01,cz+zz);
      // Fine horizontal facade lines for a more detailed architectural look.
      add(materials.grey,w*.56,.075,.075,solidX,4.02,front-.32);

      // A single architectural mesh for every MATERIAL and VILLA TYPE.
      for(const [mat,parts] of groupByMaterial){
        const geo=combinedBoxGeometry(parts);
        const inst=new THREE.InstancedMesh(geo,mat,homes.length);
        inst.name='Darah '+typeLabels[type]+' | facades + architecture';
        // Explicit world-space bounds are difficult for hundreds of instances
        // in three.js r128; disable culling to avoid disappearing rows.
        inst.frustumCulled=false;
        inst.castShadow=false;inst.receiveShadow=false;
        for(let i=0;i<homes.length;i++){
          const p=homes[i];
          dummy.position.set(p.x,HOUSES_ON_GROUND,p.z);
          dummy.rotation.set(0,p.angle,0);
          dummy.scale.set(1,1,1);
          dummy.updateMatrix();
          inst.setMatrixAt(i,dummy.matrix);
        }
        inst.instanceMatrix.needsUpdate=true;
        cityGroup.add(inst);
      }

      // Bronze 3D triangular pattern, not a flat printed rectangle.
      const tileGeo=latticeGeometry(patternX,front,1.55,w*.29,type.charCodeAt(0)%5);
      const tileMesh=new THREE.InstancedMesh(tileGeo,materials.bronze,homes.length);
      tileMesh.frustumCulled=false;
      tileMesh.castShadow=false;
      tileMesh.name='Darah '+typeLabels[type]+' | triangular screen';
      for(let i=0;i<homes.length;i++){
        const p=homes[i];
        dummy.position.set(p.x,HOUSES_ON_GROUND,p.z);
        dummy.rotation.set(0,p.angle,0);
        dummy.updateMatrix();
        tileMesh.setMatrixAt(i,dummy.matrix);
      }
      tileMesh.instanceMatrix.needsUpdate=true;
      cityGroup.add(tileMesh);

      // Collision uses the principal built form. Keep the front gate outside
      // that collision box so residents can actually approach the entry.
      homes.forEach(home=>{
        const sideways=Math.abs(Math.sin(home.angle))>.5;
        const halfX=(sideways?d:w)/2+.18;
        const halfZ=(sideways?w:d)/2+.18;
        buildingBoxes.push({
          minX:home.x-halfX,maxX:home.x+halfX,
          minZ:home.z-halfZ,maxZ:home.z+halfZ
        });
        const localX=-w*.09,localZ=front-.26;
        const cos=Math.cos(home.angle),sin=Math.sin(home.angle);
        const doorX=home.x+localX*cos+localZ*sin;
        const doorZ=home.z-localX*sin+localZ*cos;
        buildingEntrances.push({
          x:doorX-2.0*sin,
          z:doorZ-2.0*cos,
          doorX,doorZ,
          district:'Darah Al Fursan',
          villaType:typeLabels[type]
        });
      });
      houseDetailCounts[type]=groupByMaterial.size+1;
    }
    console.info('Darah villa prototypes (instanced batches per style):',houseDetailCounts);

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
    sign.position.set(-46,8,-78);
    cityGroup.add(sign);
    cube('Darah entrance sign pillar',1.2,8,.9,-56,4.2,-78,materials.ivory);
    cube('Darah entrance sign pillar',1.2,8,.9,-36,4.2,-78,materials.ivory);
    const total=Object.values(lots).reduce((a,b)=>a+b.length,0);
    console.info('Darah Al Fursan district added:',total,'villas,',amenities.length,'civic/park blocks.');
  };
})();