// Dar Al-Fursan / دارة الفرسان for Vertex City 3D.
// Adapted to Three.js 0.128 from the user's complete Blender bpy project.
// Uses its compressed master-plan contours, plots and four villa specifications,
// not the rough rectangular district from the earlier prototype.
// This is a playable visual interpretation, not a surveyed construction plan.
(function () {
  'use strict';

  const OFFSET_X = 1250;
  const OFFSET_Z = 0;
  const SITE_X = 475.83;
  const SITE_Y = 336.56;
  const VILLA_FLOOR = .34;
  const TYPE_NAMES = ['1a', '1b', '2', '3'];
  const SCENERY_TREE_STEP = 5; // light enough for local split-screen + integrated GPUs
  const TYPE_PALETTE = {
    '1a': 0xe7dfd3, '1b': 0xddd6cd, '2': 0xdfdbd3, '3': 0xc9c5bd
  };

  async function inflateSignedValues(b64) {
    // Original Python format: base64(zlib(zigzag signed varints)).
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (typeof DecompressionStream !== 'function') {
      throw new Error('هذا المتصفح لا يدعم فك بيانات مخطط دارة الفرسان.');
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const result = [];
    let value = 0, shift = 0;
    for (const byte of bytes) {
      value += (byte & 127) * Math.pow(2, shift);
      if (byte & 128) shift += 7;
      else {
        result.push(value % 2 === 0 ? value / 2 : -(value + 1) / 2);
        value = 0;
        shift = 0;
      }
    }
    if (shift) throw new Error('Invalid Darah geometry encoding');
    return result;
  }

  function unpackPolygons(a) {
    const out = [];
    let k = 1;
    for (let p = 0; p < a[0]; p++) {
      const nr = a[k++];
      const rings = [];
      for (let r = 0; r < nr; r++) {
        const n = a[k++];
        let x = 0, y = 0;
        const ring = [];
        for (let i = 0; i < n; i++) {
          if (i === 0) { x = a[k++]; y = a[k++]; }
          else { x += a[k++]; y += a[k++]; }
          ring.push([x * .1, y * .1]);
        }
        rings.push(ring);
      }
      out.push(rings);
    }
    return out;
  }

  function unpackPlots(a) {
    const out = [];
    for (let i = 0; i < a[0]; i++) {
      const j = 1 + i * 6;
      out.push({
        type: TYPE_NAMES[a[j]], x: a[j + 1] * .01, y: a[j + 2] * .01,
        theta: a[j + 3] * Math.PI / 18000,
        mirror: a[j + 4] === 1, number: a[j + 5]
      });
    }
    return out;
  }

  function unpackLots(a) {
    const types = ['mosque','parking','school_p','school_m','school_s','library','post'];
    const out = [];
    let k = 1;
    for (let i = 0; i < a[0]; i++) {
      const kind = types[a[k++]];
      const angle = a[k++] * Math.PI / 18000;
      const cx = a[k++] * .1, cy = a[k++] * .1;
      const w = a[k++] * .1, h = a[k++] * .1, n = a[k++];
      let x = 0, y = 0;
      const poly = [];
      for (let j = 0; j < n; j++) {
        if (j === 0) { x = a[k++]; y = a[k++]; }
        else { x += a[k++]; y += a[k++]; }
        poly.push([x * .1, y * .1]);
      }
      out.push({kind, angle, cx, cy, w, h, poly});
    }
    return out;
  }

  function unpackPoints(a, extra = 1) {
    const pts = [];
    for (let i = 0; i < a[0]; i++) {
      const j = 1 + i * (2 + extra);
      pts.push([a[j] * .1, a[j + 1] * .1, a[j + 2]]);
    }
    return pts;
  }

  const boxMats = new Map();
  function material(THREE, hex, rough = .86) {
    const key = hex + ':' + rough;
    if (!boxMats.has(key))
      boxMats.set(key, new THREE.MeshStandardMaterial({color:hex,roughness:rough,metalness:rough<.5?.13:0,side:THREE.DoubleSide}));
    return boxMats.get(key);
  }

  function makeCombinedBoxes(THREE, boxes) {
    const p = [], n = [], ids = [];
    const faceInfo = [
      [[1,2,6,5],[1,0,0]], [[4,7,3,0],[-1,0,0]],
      [[3,7,6,2],[0,1,0]], [[0,1,5,4],[0,-1,0]],
      [[0,3,2,1],[0,0,-1]], [[5,6,7,4],[0,0,1]]
    ];
    for (const b of boxes) {
      const [x,y,z,w,h,d] = b;
      if (Math.min(w,h,d) <= .005) continue;
      const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
      const corners=[
        [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
        [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]
      ];
      for(const [indices,norm] of faceInfo){
        const base=p.length/3;
        for(const vi of indices){p.push(...corners[vi]);n.push(...norm);}
        ids.push(base,base+1,base+2,base,base+2,base+3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
    g.setIndex(ids);
    g.computeBoundingSphere();
    return g;
  }

  function plotPrototype(THREE, type, spec, garden) {
    const width = spec.W;
    const pieces = new Map();
    const pal = {
      wall: material(THREE,TYPE_PALETTE[type]),
      plaster: material(THREE,0xe7e3da),
      slab: material(THREE,0xbdbab3),
      glass: material(THREE,0x3c5766,.27),
      window: material(THREE,0x25292c,.55),
      wood: material(THREE,0x665044,.66),
      copper: material(THREE,0xb98049,.44),
      screenBack: material(THREE,0x474750),
      grass: material(THREE,0x659060),
      pavers: material(THREE,0xc3b8a7),
      roof: material(THREE,0x989690),
      tree: material(THREE,0x4c7d49),
      trunk: material(THREE,0x795d42)
    };

    function box(mat,x0,y0,z0,x1,y1,z1) {
      if(!(x1>x0 && y1>y0 && z1>z0))return;
      // Blender: plot x=(0..W), y=(0..25), z=height.
      // Three:  x centered, y vertical, z positive toward the street.
      const entry=[
        (x0+x1)/2-width/2,(z0+z1)/2,12.5-(y0+y1)/2,
        x1-x0,z1-z0,y1-y0
      ];
      if(!pieces.has(mat))pieces.set(mat,[]);
      pieces.get(mat).push(entry);
    }

    const elevations=[0,3.35,6.60];
    const storey=[3.05,2.95,2.95];
    function openingDecor(open,horiz,c,base) {
      const [typ,,center,,widthOpen,sill,height] = open;
      const a0=center-widthOpen/2, a1=center+widthOpen/2;
      const thick=.075;
      function band(u0,b0,z0,u1,b1,z1,mat) {
        if(horiz)box(mat,u0,b0,z0,u1,b1,z1);
        else box(mat,b0,u0,z0,b1,u1,z1);
      }
      const bottom=base+sill,top=bottom+height;
      const used = typ==='door' ? pal.wood : pal.glass;
      band(a0+.035,c-thick/2,bottom+.045,a1-.035,c+thick/2,top-.045,used);
      band(a0,c-.066,bottom,a0+.045,c+.066,top,pal.window);
      band(a1-.045,c-.066,bottom,a1,c+.066,top,pal.window);
      band(a0,c-.066,top-.045,a1,c+.066,top,pal.window);
      if(typ!=='door'){
        band(a0,c-.066,bottom,a1,c+.066,bottom+.045,pal.window);
        if(widthOpen>1.3)band(center-.025,c-.075,bottom,center+.025,c+.075,top,pal.window);
      }
    }

    function wall(rect,kind,f,opens) {
      let [x0,y0,x1,y1] = rect;
      const horiz=(x1-x0)>=(y1-y0);
      const tMin=kind==='I'?.12:.20;
      if(horiz && y1-y0<tMin){const mid=(y0+y1)/2;y0=mid-tMin/2;y1=mid+tMin/2;}
      if(!horiz && x1-x0<tMin){const mid=(x0+x1)/2;x0=mid-tMin/2;x1=mid+tMin/2;}
      let from=f===0?0:elevations[f], height=storey[f];
      let mat=pal.wall;
      if(kind==='B'){from=-.15;height=2.55;}
      if(kind==='L'){
        height=f===2 && y1<=5.0?storey[f]:.95;
      }
      if(kind==='S'){mat=pal.screenBack;height=1.8;}
      const zbot=from,ztop=from+height;
      const a0=horiz?x0:y0,a1=horiz?x1:y1;
      const b0=horiz?y0:x0,b1=horiz?y1:x1;
      function add(u0,u1,h0,h1){if(horiz)box(mat,u0,b0,h0,u1,b1,h1);else box(mat,b0,u0,h0,b1,u1,h1);}
      const hits=(kind==='B'||kind==='L'||kind==='S'?[]:opens.filter(o=>{
        const same=horiz?o[1]==='x':o[1]==='y';
        return same && o[3]>=b0-.13 && o[3]<=b1+.13 && o[2]>=a0-.05 && o[2]<=a1+.05;
      })).sort((a,b)=>a[2]-b[2]);
      if(!hits.length){add(a0,a1,zbot,ztop);return;}
      let cursor=a0;
      for(const o of hits){
        const low=Math.max(cursor,a0,o[2]-o[4]/2);
        const high=Math.min(a1,o[2]+o[4]/2);
        if(low>cursor+.005)add(cursor,low,zbot,ztop);
        if(high>low){
          if(o[5]>0)add(low,high,zbot,zbot+o[5]);
          if(zbot+o[5]+o[6]<ztop)add(low,high,zbot+o[5]+o[6],ztop);
          if(o[0]!=='arch')openingDecor(o,horiz,(b0+b1)/2,zbot);
          cursor=Math.max(cursor,high);
        }
      }
      if(cursor<a1)add(cursor,a1,zbot,ztop);
    }

    // A true site-specific outline: four plans, three storeys, roof
    // terraces and openings are derived from their Python spec arrays.
    for(let f=0;f<3;f++){
      const floor=spec.floors[f];
      for(const [x0,y0,x1,y1,kind] of floor.walls){
        if(kind==='I')continue; // omit hidden interior partitions for web performance
        wall([x0,y0,x1,y1],kind,f,floor.opens);
      }
      for(const rect of (spec.slabs[f]||[])){
        box(pal.slab,rect[0],rect[1],elevations[f]-.15,rect[2],rect[3],elevations[f]+.04);
      }
      for(const rect of (spec.roofs[f]||[])){
        const bottom=elevations[f]+storey[f];
        box(pal.roof,rect[0],rect[1],bottom,rect[2],rect[3],bottom+.27);
      }
      for(const rect of (spec.terr[f]||[])){
        box(pal.pavers,rect[0],rect[1],elevations[f]+.03,rect[2],rect[3],elevations[f]+.085);
      }
      for(const rect of (spec.para_t[f]||[])){
        box(pal.plaster,rect[0],rect[1],elevations[f],rect[2],rect[3],elevations[f]+.95);
      }
      for(const rect of (spec.para_r[f]||[])){
        const base=elevations[f]+storey[f]+.3;
        box(pal.plaster,rect[0],rect[1],base,rect[2],rect[3],base+.55);
      }
    }

    // Plot surfaces and landscaping from the provided GARDENS data.
    box(pal.pavers,0,0,-.19,width,25,-.10);
    for(const r of garden.grass)box(pal.grass,r[0],r[1],-.13,r[2],r[3],-.085);
    for(const r of garden.paving)box(pal.pavers,r[0],r[1],-.12,r[2],r[3],-.075);
    for(const [x,y,diameter] of garden.trees.slice(0,2)){
      const rr=Math.max(.35,Math.min(1.1,diameter*.31));
      box(pal.trunk,x-.13,y-.13,-.1,x+.13,y+.13,2.3);
      box(pal.tree,x-rr,y-rr,1.82,x+rr,y+rr,4.5);
    }

    const metalTriangles=[];
    // Copper triangular panels in the original facade positions.
    for(const [x0,x1,yf,z0,z1,nc,nr,oc,orr] of spec.screens){
      box(pal.screenBack,x0,yf+.055,z0-.04,x1,yf+.10,z1);
      for(let r=0;r<nr;r++){
        for(let c=0;c<nc;c++){
          // Concentric triangular negative space, inspired by the source
          // Sierpinski-screen algorithm; far fewer faces for game performance.
          const skip=((c+r+oc+orr)%7===0)||((c&3)===(r&3)&&r%3===0);
          if(skip)continue;
          const x=x0+(c+.5)*(x1-x0)/nc, yy=z0+(r+.5)*(z1-z0)/nr;
          const hw=(x1-x0)/nc*.47,hh=(z1-z0)/nr*.44;
          const faceZ=12.5-yf+.06;
          metalTriangles.push(
            x-width/2-hw,yy-hh,faceZ,
            x-width/2+hw,yy-hh,faceZ,
            x-width/2,yy+hh,faceZ
          );
        }
      }
    }

    const geometryByMat=[];
    for(const [mat,bxs] of pieces){
      if(bxs.length)geometryByMat.push({geo:makeCombinedBoxes(THREE,bxs),mat});
    }
    if(metalTriangles.length){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(metalTriangles,3));
      geo.computeVertexNormals();
      geometryByMat.push({geo,mat:pal.copper});
    }
    return geometryByMat;
  }

  function areaPolygon(THREE,rings,mat,elevation,root) {
    if(!rings.length||!rings[0]||rings[0].length<3)return null;
    function pth(list,ctor){
      const p = new ctor();
      list.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));
      p.closePath();
      return p;
    }
    const shape=pth(rings[0],THREE.Shape);
    for(const hole of rings.slice(1))if(hole.length>=3)shape.holes.push(pth(hole,THREE.Path));
    const obj=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);
    obj.rotation.x=-Math.PI/2;
    obj.position.set(OFFSET_X,elevation,OFFSET_Z);
    obj.receiveShadow=true;
    obj.frustumCulled=true;
    root.add(obj);
    return obj;
  }

  function serviceBuildings(THREE,root,lots) {
    const schoolMat=material(THREE,0xdec9a8),mosqueMat=material(THREE,0xe9dfc9);
    const roofMat=material(THREE,0xbcb39f),dark=material(THREE,0x415e69,.35);
    const labels={
      mosque:'مسجد',school_p:'مدرسة ابتدائية',school_m:'مدرسة متوسطة',
      school_s:'مدرسة ثانوية',library:'مكتبة',post:'بريد',parking:'مواقف'
    };
    for(const lot of lots){
      areaPolygon(THREE,[lot.poly],material(THREE,lot.kind==='parking'?0x6b6c69:0xcfc9bb),.24,root);
      const group=new THREE.Group();
      group.position.set(OFFSET_X+lot.cx,.26,OFFSET_Z-lot.cy);
      group.rotation.y=lot.angle;
      root.add(group);
      const w=Math.max(6,Math.min(lot.w*.65,40));
      const d=Math.max(6,Math.min(lot.h*.58,30));
      const isMosque=lot.kind==='mosque',isSchool=lot.kind.startsWith('school');
      if(lot.kind!=='parking'){
        const h=isSchool?9:isMosque?7:lot.kind==='library'?5.5:5;
        const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),isMosque?mosqueMat:schoolMat);
        body.position.y=h/2;body.castShadow=false;group.add(body);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.24,d+.35),roofMat);
        cap.position.y=h+.15;group.add(cap);
        const windowG=new THREE.BoxGeometry(2.0,1.30,.1);
        for(let x=-w/2+4;x<w/2-2;x+=5){
          const window=new THREE.Mesh(windowG,dark);
          window.position.set(x,Math.min(h-1.2,3.2),-d/2-.085);
          group.add(window);
        }
        if(isMosque){
          const dome=new THREE.Mesh(new THREE.SphereGeometry(Math.min(w,d)*.19,14,9,0,Math.PI*2,0,Math.PI/2),mosqueMat);
          dome.position.y=h+.28;group.add(dome);
          const minaret=new THREE.Mesh(new THREE.CylinderGeometry(.75,.95,15,9),mosqueMat);
          minaret.position.set(w*.37,7.5,d*.32);group.add(minaret);
        }
      } else {
        for(let k=-2;k<=2;k++){
          const lane=new THREE.Mesh(new THREE.BoxGeometry(.11,.035,Math.min(8,d*.65)),roofMat);
          lane.position.set(k*w/6,.08,0);group.add(lane);
        }
      }
      group.userData.darahService=labels[lot.kind];
    }
  }

  function signage(THREE,root) {
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=144;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#28584b';ctx.fillRect(0,0,512,144);
    ctx.fillStyle='#ffffff';ctx.textAlign='center';
    ctx.font='bold 54px Tahoma,Arial';ctx.fillText('دارة الفرسان',256,80);
    ctx.font='26px Arial';ctx.fillText('DAR AL FURSAN',256,123);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(26,7.3),new THREE.MeshBasicMaterial({
      map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide
    }));
    sign.position.set(OFFSET_X-SITE_X+44,10,OFFSET_Z-20);
    sign.rotation.y=Math.PI/2;
    root.add(sign);
  }

  function createTreeInstances(THREE,root,treeArrays) {
    const trees=[];
    for(const pts of treeArrays){
      for(let i=0;i<pts.length;i+=SCENERY_TREE_STEP){
        const [x,y,type]=pts[i];
        if(Math.abs(x)>SITE_X-2||Math.abs(y)>SITE_Y-2)continue;
        trees.push({x:x+OFFSET_X,z:OFFSET_Z-y,size:.85+(Math.abs(type)%4)*.15});
      }
    }
    if(!trees.length)return;
    const trunk=new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.12,.20,3.2,6),material(THREE,0x75604c),trees.length);
    const canopy=new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(2.1,0),material(THREE,0x487847),trees.length);
    const dummy=new THREE.Object3D();
    trees.forEach((t,i)=>{
      dummy.position.set(t.x,1.6,t.z);
      dummy.scale.set(t.size,t.size,t.size);
      dummy.rotation.set(0,0,0);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
      dummy.position.y=4.08;
      dummy.updateMatrix();canopy.setMatrixAt(i,dummy.matrix);
    });
    trunk.instanceMatrix.needsUpdate=true;canopy.instanceMatrix.needsUpdate=true;
    trunk.frustumCulled=false;canopy.frustumCulled=false;
    root.add(trunk,canopy);
  }

  function addRoadMarkings(THREE,root,arr) {
    const n=arr[0],dummy=new THREE.Object3D();
    const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(3,.035,.16),material(THREE,0xe0cf91),n);
    for(let i=0;i<n;i++){
      const j=1+3*i;
      dummy.position.set(OFFSET_X+arr[j]*.1,.08,OFFSET_Z-arr[j+1]*.1);
      dummy.rotation.set(0,arr[j+2]*Math.PI/18000,0);
      dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix);
    }
    marks.instanceMatrix.needsUpdate=true;marks.frustumCulled=false;
    root.add(marks);
  }

  function addEntrance(THREE,group,p,W,boxes,entrances) {
    const theta=p.theta, cx=OFFSET_X+p.x, cz=OFFSET_Z-p.y;
    // Source's 'street' runs along the local x axis at lot-local Y = 0.
    // A point one metre before the front of the plot can be reached on foot.
    const entryX=cx-13.7*Math.cos(theta);
    const entryZ=cz+13.7*Math.sin(theta);
    const doorX=cx-9.1*Math.cos(theta);
    const doorZ=cz+9.1*Math.sin(theta);
    entrances.push({x:entryX,z:entryZ,doorX,doorZ,
      district:'دارة الفرسان',villaType:p.type,plotNumber:p.number});
    // Approximate collision for the occupied building (not the front garden).
    const exx=Math.sin(theta), exz=Math.cos(theta);
    const yx=Math.cos(theta), yz=-Math.sin(theta);
    const halfW=W*.35,halfD=8.4;
    const houseCX=cx+yx*.8,houseCZ=cz+yz*.8;
    const rx=Math.abs(exx)*halfW+Math.abs(yx)*halfD;
    const rz=Math.abs(exz)*halfW+Math.abs(yz)*halfD;
    boxes.push({minX:houseCX-rx,maxX:houseCX+rx,minZ:houseCZ-rz,maxZ:houseCZ+rz});
  }

  window.buildDarahFursan = async function ({THREE,scene,buildingBoxes,buildingEntrances}) {
    const data=window.DARAH_SOURCE_DATA;
    if(!data||!THREE||!scene)throw new Error('Darah data or THREE missing');
    const names=Object.keys(data.blobs);
    const decoded=await Promise.all(names.map(n=>inflateSignedValues(data.blobs[n])));
    const raw=Object.fromEntries(names.map((n,i)=>[n,decoded[i]]));
    const plots=unpackPlots(raw.PLOTS);
    const lots=unpackLots(raw.LOTS);
    if(plots.length!==606)throw new Error('Expected 606 villas; found '+plots.length);
    const district=new THREE.Group();
    district.name='Darah Al Fursan — brochure master plan';
    district.visible=false;
    scene.add(district);
    const ground=new THREE.Mesh(
      new THREE.BoxGeometry(SITE_X*2,.12,SITE_Y*2),
      material(THREE,0x4f5553)
    );
    ground.position.set(OFFSET_X,-.09,OFFSET_Z);
    district.add(ground);

    // Road widths emerge from the source outline: asphalt is revealed between
    // actual 28 paved-block polygons, instead of a fictional 6x8 grid.
    for(const rings of unpackPolygons(raw.BLOCKS))
      areaPolygon(THREE,rings,material(THREE,0xd3cfca),.16,district);
    for(const rings of unpackPolygons(raw.PARKS))
      areaPolygon(THREE,rings,material(THREE,0x648b5a),.22,district);
    for(const rings of unpackPolygons(raw.PATHS))
      areaPolygon(THREE,rings,material(THREE,0xc1b9a7),.25,district);
    serviceBuildings(THREE,district,lots);
    addRoadMarkings(THREE,district,raw.DASHES);
    createTreeInstances(THREE,district,[
      unpackPoints(raw.TREES_PARK),unpackPoints(raw.TREES_STREET)
    ]);
    signage(THREE,district);

    // Exactly 4 shared villa prototypes, each rendered using InstancedMesh.
    const byType=Object.fromEntries(TYPE_NAMES.map(k=>[k,[]]));
    plots.forEach(p=>byType[p.type].push(p));
    const dummy=new THREE.Object3D();
    let batchCount=0;
    for(const type of TYPE_NAMES) {
      const list=byType[type];
      const proto=plotPrototype(THREE,type,data.specs[type],data.gardens[type]);
      for(const {geo,mat} of proto){
        const inst=new THREE.InstancedMesh(geo,mat,list.length);
        inst.name='Darah Villa '+type+' — shared geometry';
        inst.frustumCulled=false;
        inst.castShadow=false;inst.receiveShadow=false;
        list.forEach((p,i)=>{
          dummy.position.set(OFFSET_X+p.x,VILLA_FLOOR,OFFSET_Z-p.y);
          dummy.rotation.set(0,p.theta-Math.PI/2,0);
          dummy.scale.set(p.mirror?-1:1,1,1);
          dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate=true;
        district.add(inst);batchCount++;
      }
    }
    // Store collision / entrances with stable index suffixes. Existing
    // Vertex City house indices are NOT changed.
    plots.forEach(p=>addEntrance(THREE,district,p,data.specs[p.type].W,buildingBoxes,buildingEntrances));

    // Link-road from Vertex City's existing east exit to the plot's west edge.
    const connector=new THREE.Mesh(new THREE.BoxGeometry(287,.08,21.5),material(THREE,0x383d41));
    connector.position.set((505+792)/2,.01,0);
    scene.add(connector);
    connector.receiveShadow=true;
    const line=new THREE.Mesh(new THREE.BoxGeometry(287,.025,.2),material(THREE,0xe9dfbe));
    line.position.set((505+792)/2,.07,0);
    scene.add(line);

    window.DARAH_PLOTS=plots.map(p=>({
      type:p.type, x:OFFSET_X+p.x, z:OFFSET_Z-p.y, number:p.number
    }));
    console.info('Darah ready:', plots.length, 'plots;',batchCount,'instanced villa draw batches;',lots.length,'service parcels.');
    return {
      group:district, plots:plots.length, sites:lots.length,
      mapBlocks:unpackPolygons(raw.BLOCKS),
      bounds:{minX:OFFSET_X-SITE_X,maxX:OFFSET_X+SITE_X,minZ:-SITE_Y,maxZ:SITE_Y},
      arrival:{x:OFFSET_X-SITE_X+20,z:0}
    };
  };
})();
