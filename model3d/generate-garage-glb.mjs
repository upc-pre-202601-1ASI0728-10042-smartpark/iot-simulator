// ============================================================================
// generate-garage-glb.mjs  —  Gemelo 3D realista (v9)
// ----------------------------------------------------------------------------
// Cambios v9:
//   - SIN casetas. En ambos niveles, PORTICOS tipo marco de puerta: verde = entrada,
//     rojo = salida.
//   - Flechas de la via RECALIBRADAS para un anillo de sentido unico coherente:
//     lateral der (entra, -Z) -> aisles (-X) -> carril trasero -> rampa (sube) ->
//     lateral izq (sale, +Z). Cruce central +Z.
//   - El muro (drum) de la espiral ya NO choca con los ascensores (x=±8.5).
//   - La AZOTEA se enlosa salvo un POZO pequeno para la rampa: ya no quedan huecos
//     alrededor de los ascensores. Baranda de seguridad en el borde del pozo.
//   - Postes de luz+sensor de la azotea movidos al PERIMETRO (fuera de los carriles).
//
// Nivel 1 = calle/ingreso (cubierto). Azotea = nivel 2 (abierto). Mallas vivas ==
// dtId (Azure Digital Twins). Materiales doubleSided.
//   node model3d/generate-garage-glb.mjs
// ============================================================================

import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildModel, loadLayout, summarize } from '../lib/layout-builder.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- glTF acumuladores -----------------------------------------------------
const bin = []; let binLength = 0;
const bufferViews = [], accessors = [], meshes = [], nodes = [];
const align4 = (b) => { const r=b.length%4; return r===0?b:Buffer.concat([b,Buffer.alloc(4-r)]); };
function pushBV(buf,target){const a=align4(buf);const v={buffer:0,byteOffset:binLength,byteLength:buf.length};if(target)v.target=target;bufferViews.push(v);bin.push(a);binLength+=a.length;return bufferViews.length-1;}
function addMesh(geo,mat){
  const P=new Float32Array(geo.positions),N=new Float32Array(geo.normals),I=new Uint16Array(geo.indices);
  const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<P.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P[i+k]);mx[k]=Math.max(mx[k],P[i+k]);}
  const pv=pushBV(Buffer.from(P.buffer,P.byteOffset,P.byteLength),34962);
  const nv=pushBV(Buffer.from(N.buffer,N.byteOffset,N.byteLength),34962);
  const iv=pushBV(Buffer.from(I.buffer,I.byteOffset,I.byteLength),34963);
  const pa=accessors.push({bufferView:pv,componentType:5126,count:P.length/3,type:'VEC3',min:mn,max:mx})-1;
  const na=accessors.push({bufferView:nv,componentType:5126,count:N.length/3,type:'VEC3'})-1;
  const ia=accessors.push({bufferView:iv,componentType:5123,count:I.length,type:'SCALAR'})-1;
  const attrs={POSITION:pa,NORMAL:na};
  if(geo.uvs){const U=new Float32Array(geo.uvs);const uv=pushBV(Buffer.from(U.buffer,U.byteOffset,U.byteLength),34962);
    attrs.TEXCOORD_0=accessors.push({bufferView:uv,componentType:5126,count:U.length/2,type:'VEC2'})-1;}
  return meshes.push({primitives:[{attributes:attrs,indices:ia,material:mat}]})-1;
}

// ---- Geometrias ------------------------------------------------------------
function box(w,h,d){const x=w/2,y=h/2,z=d/2;
  const F=[[[0,0,1],[[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]],[[0,0,-1],[[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]]],
    [[0,1,0],[[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]]],[[0,-1,0],[[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]]],
    [[1,0,0],[[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]]],[[-1,0,0],[[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]]]];
  const positions=[],normals=[],indices=[];let b=0;
  for(const [n,vs] of F){for(const v of vs){positions.push(...v);normals.push(...n);}indices.push(b,b+1,b+2,b,b+2,b+3);b+=4;}
  return {positions,normals,indices};}
function cylinder(r,h,seg=20){const positions=[],normals=[],indices=[];const y0=-h/2,y1=h/2;
  for(let i=0;i<seg;i++){const a0=i/seg*2*Math.PI,a1=(i+1)/seg*2*Math.PI;const x0=Math.cos(a0)*r,z0=Math.sin(a0)*r,x1=Math.cos(a1)*r,z1=Math.sin(a1)*r;
    const nA=[Math.cos(a0),0,Math.sin(a0)],nB=[Math.cos(a1),0,Math.sin(a1)];const b=positions.length/3;
    positions.push(x0,y0,z0,x1,y0,z1,x1,y1,z1,x0,y1,z0);normals.push(...nA,...nB,...nB,...nA);indices.push(b,b+1,b+2,b,b+2,b+3);}
  for(const [yy,ny,flip] of [[y1,1,false],[y0,-1,true]]){const c=positions.length/3;positions.push(0,yy,0);normals.push(0,ny,0);const ring=[];
    for(let i=0;i<seg;i++){const a=i/seg*2*Math.PI;ring.push(positions.length/3);positions.push(Math.cos(a)*r,yy,Math.sin(a)*r);normals.push(0,ny,0);}
    for(let i=0;i<seg;i++){const a=ring[i],b=ring[(i+1)%seg];flip?indices.push(c,b,a):indices.push(c,a,b);}}
  return {positions,normals,indices};}
function arrow(size){const s=size/2;return {positions:[-s,0,-s,s,0,-s,0,0,s],normals:[0,1,0,0,1,0,0,1,0],indices:[0,2,1]};}
function helixRoad(Rin,Rout,a0,a1,y0,y1,seg){const positions=[],normals=[],indices=[];
  for(let i=0;i<=seg;i++){const t=i/seg,a=a0+(a1-a0)*t,y=y0+(y1-y0)*t,c=Math.cos(a),s=Math.sin(a);positions.push(c*Rin,y,s*Rin,c*Rout,y,s*Rout);normals.push(0,1,0,0,1,0);}
  for(let i=0;i<seg;i++){const b=i*2;indices.push(b,b+1,b+3,b,b+3,b+2);}return {positions,normals,indices};}
function helixWall(R,a0,a1,y0,y1,seg,wh){const positions=[],normals=[],indices=[];
  for(let i=0;i<=seg;i++){const t=i/seg,a=a0+(a1-a0)*t,y=y0+(y1-y0)*t,c=Math.cos(a),s=Math.sin(a);positions.push(c*R,y,s*R,c*R,y+wh,s*R);normals.push(c,0,s,c,0,s);}
  for(let i=0;i<seg;i++){const b=i*2;indices.push(b,b+1,b+3,b,b+3,b+2);}return {positions,normals,indices};}
function arcWall(R,a0,a1,yBot,yTop,seg){const positions=[],normals=[],indices=[];
  for(let i=0;i<=seg;i++){const t=i/seg,a=a0+(a1-a0)*t,c=Math.cos(a),s=Math.sin(a);positions.push(c*R,yBot,s*R,c*R,yTop,s*R);normals.push(c,0,s,c,0,s);}
  for(let i=0;i<seg;i++){const b=i*2;indices.push(b,b+1,b+3,b,b+3,b+2);}return {positions,normals,indices};}
// Panel plano con UVs en la cara +Z (para texturas de texto). Texto legible desde +Z.
function panelUV(w,h){const x=w/2,y=h/2;
  return {positions:[-x,-y,0, x,-y,0, x,y,0, -x,y,0], normals:[0,0,1, 0,0,1, 0,0,1, 0,0,1], uvs:[0,1, 1,1, 1,0, 0,0], indices:[0,1,2,0,2,3]};}

// ---- Texturas de texto (PNG embebido) --------------------------------------
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(buf){let c=0xFFFFFFFF;for(let i=0;i<buf.length;i++)c=CRC_T[(c^buf[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function pngChunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const cd=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(cd),0);return Buffer.concat([len,cd,crc]);}
function pngFromRGBA(w,h,rgba){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(h*(1+w*4));for(let y=0;y<h;y++){raw[y*(1+w*4)]=0;rgba.copy(raw,y*(1+w*4)+1,y*w*4,(y+1)*w*4);}
  return Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);}
const FONT={
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'N':['10001','11001','10101','10101','10011','10001','10001'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
};
function textTexture(text,bg){const sc=6,cw=5,chh=7,gap=1,pad=10;
  const W=(text.length*(cw+gap)-gap)*sc+pad*2, H=chh*sc+pad*2;
  const buf=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){buf[i*4]=bg[0];buf[i*4+1]=bg[1];buf[i*4+2]=bg[2];buf[i*4+3]=255;}
  let cx=pad;
  for(const chr of text){const g=FONT[chr];
    if(g){for(let ry=0;ry<chh;ry++)for(let rx=0;rx<cw;rx++){if(g[ry][rx]==='1'){
      for(let yy=0;yy<sc;yy++)for(let xx=0;xx<sc;xx++){const px=cx+rx*sc+xx,py=pad+ry*sc+yy,idx=(py*W+px)*4;buf[idx]=255;buf[idx+1]=255;buf[idx+2]=255;buf[idx+3]=255;}}}}
    cx+=(cw+gap)*sc;}
  return {png:pngFromRGBA(W,H,buf),W,H};}
const TEX_ENT=textTexture('ENTRADA',[22,150,70]);
const TEX_SAL=textTexture('SALIDA',[205,40,35]);

// ---- Materiales (doubleSided) ----------------------------------------------
const MAT={};const materials=[];
const def=(n,rgba,rough=0.85,metal=0)=>{MAT[n]=materials.push({name:n,doubleSided:true,pbrMetallicRoughness:{baseColorFactor:rgba,metallicFactor:metal,roughnessFactor:rough}})-1;};
def('deck',[0.52,0.52,0.55,1],0.92); def('lane',[0.38,0.38,0.42,1],0.95); def('zone',[0.24,0.26,0.30,1],0.95);
def('space',[0.32,0.74,0.42,1],0.7); def('spaceDis',[0.30,0.50,0.88,1],0.7); def('spaceEv',[0.18,0.74,0.66,1],0.7);
def('bayEmpty',[0.60,0.60,0.58,1],0.85);
def('paintW',[0.95,0.95,0.95,1],0.5); def('paintY',[0.96,0.80,0.16,1],0.5);
def('concrete',[0.70,0.70,0.66,1],0.9); def('concDark',[0.40,0.40,0.43,1],0.9);
def('signG',[0.10,0.56,0.26,1],0.5); def('signR',[0.86,0.16,0.13,1],0.5);
def('signB',[0.09,0.30,0.74,1],0.55); def('post',[0.32,0.32,0.35,1],0.7);
def('smoke',[0.92,0.27,0.17,1],0.5); def('lumen',[0.98,0.86,0.30,1],0.5);
def('ramp',[0.46,0.46,0.49,1],0.92); def('tread',[0.33,0.33,0.36,1],0.9);
def('light',[1.0,0.96,0.80,1],0.3); def('rail',[0.74,0.74,0.78,1],0.4,0.3); def('door',[0.18,0.20,0.24,1],0.4);
def('column',[0.78,0.78,0.74,1],0.85); def('colBase',[0.36,0.36,0.38,1],0.9); def('joint',[0.40,0.40,0.43,1],0.95);
def('fascia',[0.16,0.42,0.62,1],0.55); def('lampHead',[0.28,0.28,0.30,1],0.5);
def('carA',[0.82,0.84,0.88,1],0.4,0.2); def('carB',[0.30,0.34,0.42,1],0.4,0.2); def('carC',[0.70,0.24,0.22,1],0.4,0.2);
def('carGlass',[0.22,0.30,0.38,0.85],0.15,0.4); def('zebra',[0.95,0.95,0.95,1],0.5); def('planter',[0.22,0.50,0.28,1],0.85);
def('elev',[0.82,0.86,0.90,1],0.35,0.4); def('elevGlass',[0.40,0.60,0.74,0.7],0.1,0.3); def('drum',[0.72,0.72,0.69,1],0.9);
// Materiales texturizados con el texto (texture index 0=ENTRADA, 1=SALIDA; se asignan en el ensamblado)
MAT.entrada=materials.push({name:'entrada',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:0},baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0.6}})-1;
MAT.salida =materials.push({name:'salida', doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:1},baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0.6}})-1;

// ---- Nodos -----------------------------------------------------------------
function node(name,geo,mat,t,rot){const m=addMesh(geo,mat);const n={name,mesh:m,translation:[t.x,t.y,t.z]};if(rot)n.rotation=rot;nodes.push(n);}
const quatY=(deg)=>{const r=deg*Math.PI/360;return [0,Math.sin(r),0,Math.cos(r)];};
let dc=0;const deco=()=>`deco-${++dc}`;
function car(cx,cy,cz,bodyMat,yaw=0){const q=quatY(yaw);
  node(deco(), box(1.8,0.55,4.2), bodyMat, {x:cx,y:cy+0.55,z:cz}, q);
  node(deco(), box(1.6,0.55,2.2), bodyMat, {x:cx,y:cy+1.05,z:cz+0.1}, q);
  node(deco(), box(1.5,0.4,2.0),  MAT.carGlass, {x:cx,y:cy+1.08,z:cz+0.12}, q);
  for(const dx of [-0.78,0.78]) for(const dz of [-1.4,1.4]) node(deco(), cylinder(0.34,0.3,10), MAT.colBase, {x:cx+dx,y:cy+0.32,z:cz+dz}, [0,0,0.7071,0.7071]);}
function lampPole(x,z,baseY,h){node(deco(), cylinder(0.09,h,10), MAT.post, {x,y:baseY+h/2,z});
  node(deco(), box(0.7,0.18,0.5), MAT.lampHead, {x,y:baseY+h,z}); node(deco(), box(0.5,0.06,0.34), MAT.light, {x,y:baseY+h-0.12,z});}
function columnAt(cx,cz,baseY,h){node(deco(), box(0.9,0.18,0.9), MAT.colBase, {x:cx,y:baseY+0.09,z:cz});
  node(deco(), cylinder(0.3,h-0.36,16), MAT.column, {x:cx,y:baseY+h/2,z:cz}); node(deco(), box(0.95,0.2,0.95), MAT.colBase, {x:cx,y:baseY+h-0.1,z:cz});}
function lineX(top,cx,cz,len,mat=MAT.paintW){node(deco(), box(len,0.02,0.14), mat, {x:cx,y:top+0.03,z:cz});}
function lineZ(top,cx,cz,len,mat=MAT.paintW){node(deco(), box(0.14,0.02,len), mat, {x:cx,y:top+0.03,z:cz});}
function dashX(top,cx,cz,len,mat=MAT.paintY){const n=Math.max(2,Math.floor(len/3));for(let i=0;i<n;i++){const x=cx-len/2+(i+0.5)*len/n;node(deco(), box(1.3,0.02,0.12), mat, {x,y:top+0.03,z:cz});}}
function dashZ(top,cx,cz,len,mat=MAT.paintY){const n=Math.max(2,Math.floor(len/3));for(let i=0;i<n;i++){const z=cz-len/2+(i+0.5)*len/n;node(deco(), box(0.12,0.02,1.3), mat, {x:cx,y:top+0.03,z});}}
function giveWay(top,cx,cz,wid){const n=Math.floor(wid/0.6);for(let i=0;i<n;i++){const x=cx-wid/2+0.3+i*0.6;node(deco(), box(0.32,0.02,0.5), MAT.paintW, {x,y:top+0.04,z:cz});}}
function chevronIsland(top,cx,cz,w,d){node(deco(), box(w,0.02,d), MAT.lane, {x:cx,y:top+0.02,z:cz});
  for(let i=-3;i<=3;i++) node(deco(), box(w*0.8,0.02,0.18), MAT.paintW, {x:cx,y:top+0.035,z:cz+i*0.7}, quatY(30));}
function decoBay(top,cx,cz,w,d){node(deco(), box(w+0.12,0.03,d+0.12), MAT.paintW, {x:cx,y:top+0.04,z:cz}); node(deco(), box(w-0.08,0.06,d-0.08), MAT.bayEmpty, {x:cx,y:top+0.07,z:cz});}
function zebra(top,cx,cz,n=6){for(let i=0;i<n;i++) node(deco(), box(0.35,0.02,1.6), MAT.zebra, {x:cx-(n/2)*0.56+i*0.56,y:top+0.05,z:cz});}
// Portico tipo marco de puerta: 2 jambas + dintel + TABLERO (vivo) con texto.
// El tablero mira hacia AFUERA (+Z, hacia la calle): ENTRADA (verde) / SALIDA (rojo).
function gantry(apId,cx,cz,by,isEnt,span=4.2){
  for(const dx of [-span/2,span/2]) node(deco(), box(0.22,2.9,0.22), MAT.concrete, {x:cx+dx,y:by+1.45,z:cz});
  node(deco(), box(span+0.5,0.55,0.3), MAT.concrete, {x:cx,y:by+2.95,z:cz});
  node(apId, panelUV(span-0.3,0.62), isEnt?MAT.entrada:MAT.salida, {x:cx,y:by+2.95,z:cz+0.17}); // mira a +Z (afuera)
  node(deco(), arrow(1.3), MAT.paintW, {x:cx,y:by+0.05,z:cz+(isEnt?-2.4:2.4)}, quatY(isEnt?180:0));
}

// ============================================================================
const layout=loadLayout(); const model=buildModel(layout);
const W=layout.lot.geometry.width, D=layout.lot.geometry.depth, GAP=layout.lot.geometry.levelHeight; // 34,58,7
const SLAB=0.25, slabTop=SLAB/2;
const lvlY=(n)=>model.levels.find(l=>l.props.levelNumber===n).y; // L1=0, L2=7 (azotea)
const topOf=(n)=>lvlY(n)+slabTop;
const AISLE_Z=-4, SIDE_X=14.5, REAR_Z=-15, FRONT_AISLE_Z=12, DECO_Z=18, END_LANE_Z=24;
const RZ=-22, Rc=4.2, road=2.8, Rin=Rc-road/2, Rout=Rc+road/2;     // disc z -27.6..-16.4
const Rdrum=Rout+0.5;          // 6.1
const holeX=7, holeZf=-15;     // POZO de rampa en la azotea: x[-7,7], z[-29,-15] (resto enlosado)
const ELEV_X=8.5;              // ascensores: fuera del drum (8.5-1.1=7.4 > 6.1)

// --- Losas: L1 solida; AZOTEA solida salvo el POZO de la rampa ---
node('LEVEL-1', box(W,SLAB,D), MAT.deck, {x:0,y:lvlY(1),z:0});
node('LEVEL-2', box(W,SLAB,(D/2-holeZf)), MAT.deck, {x:0,y:lvlY(2),z:(holeZf+D/2)/2});          // frente (z>-15)
node(deco(), box((W/2-holeX),SLAB,(holeZf+D/2)), MAT.deck, {x:-(W/2+holeX)/2,y:lvlY(2),z:(-D/2+holeZf)/2}); // rear-izq
node(deco(), box((W/2-holeX),SLAB,(holeZf+D/2)), MAT.deck, {x:(W/2+holeX)/2,y:lvlY(2),z:(-D/2+holeZf)/2});   // rear-der
// Baranda de seguridad alrededor del pozo (abierto al frente +Z donde desemboca la rampa)
node(deco(), box(0.16,0.6,holeZf+D/2), MAT.rail, {x:-holeX,y:topOf(2)+0.3,z:(-D/2+holeZf)/2});
node(deco(), box(0.16,0.6,holeZf+D/2), MAT.rail, {x: holeX,y:topOf(2)+0.3,z:(-D/2+holeZf)/2});
node(deco(), box(2*holeX,0.6,0.16), MAT.rail, {x:0,y:topOf(2)+0.3,z:-D/2});

// --- Carriles (asfalto) por nivel ---
for(const num of [1,2]){const y=topOf(num)-0.005;
  node(deco(), box(3.0,0.02,D-4), MAT.lane, {x:SIDE_X,y,z:0});
  node(deco(), box(3.0,0.02,D-4), MAT.lane, {x:-SIDE_X,y,z:0});
  node(deco(), box(W-6,0.02,8), MAT.lane, {x:0,y,z:AISLE_Z});
  node(deco(), box(W-6,0.02,7), MAT.lane, {x:0,y,z:FRONT_AISLE_Z});
  node(deco(), box(W-4,0.02,4), MAT.lane, {x:0,y,z:REAR_Z});
  node(deco(), box(W-4,0.02,4.5), MAT.lane, {x:0,y,z:END_LANE_Z});
  node(deco(), box(5.2,0.02,16), MAT.lane, {x:0,y,z:4});
}

// --- Columnas ---
const colXBays=[-12.8,-7.7,-2.8,2.8,7.7,12.8];
for(const cz of [-13.3,5.3]) for(const cx of colXBays) columnAt(cx,cz,topOf(1),GAP-SLAB);
for(const cz of [-13,-4,5,15,24]) for(const cx of [-16.7,16.7]) columnAt(cx,cz,topOf(1),GAP-SLAB);
for(const cx of [-holeX,holeX]) columnAt(cx,holeZf-1.0,topOf(1),GAP-SLAB);

// --- Bahias VIVAS ---
const matForType=(t)=> t==='Disabled'?MAT.spaceDis : t==='EV'?MAT.spaceEv : MAT.space;
for(const z of model.zones){const top=topOf(parseInt(z.dtId.match(/L(\d)/)[1],10));
  const w=z.bounds.maxX-z.bounds.minX+0.7, d=z.bounds.maxZ-z.bounds.minZ+0.7;
  node(z.dtId, box(w,0.04,d), MAT.zone, {x:z.bounds.cx,y:top+0.02,z:z.bounds.cz});}
for(const s of model.spaces){const top=topOf(s.levelNumber);
  node(deco(), box(s.w+0.16,0.03,s.d+0.16), MAT.paintW, {x:s.x,y:top+0.05,z:s.z});
  node(s.dtId, box(s.w-0.06,0.10,s.d-0.06), matForType(s.props.spaceType), {x:s.x,y:top+0.10,z:s.z});}

// --- Bahias DECORATIVAS: una fila, via de servicio ancha (z=12) ---
for(const num of [1,2]){const top=topOf(num);
  node(deco(), box(W-6,0.04,6), MAT.zone, {x:0,y:top+0.02,z:DECO_Z});
  for(let i=0;i<8;i++){const x=-9.1+i*2.6; decoBay(top,x,DECO_Z,2.4,5.0);}}

// --- Marcas viales (SENTIDO UNICO; flechas recalibradas) ---
//   lateral der: ENTRA (-Z).  lateral izq: SALE (+Z).  aisles: -X.  cruce central: +Z.
for(const num of [1,2]){const top=topOf(num);
  lineZ(top, SIDE_X-1.5, 0, D-4); lineZ(top, SIDE_X+1.5, 0, D-4);
  lineZ(top,-SIDE_X-1.5, 0, D-4); lineZ(top,-SIDE_X+1.5, 0, D-4);
  dashZ(top, SIDE_X, 0, D-6); dashZ(top,-SIDE_X, 0, D-6);
  for(const z of [16,4,-8,-18]) node(deco(), arrow(1.5), MAT.paintW, {x:SIDE_X,y:top+0.05,z}, quatY(180)); // entra
  for(const z of [-18,-8,4,16]) node(deco(), arrow(1.5), MAT.paintW, {x:-SIDE_X,y:top+0.05,z}, quatY(0));   // sale
  for(const [cz,len] of [[AISLE_Z,8],[FRONT_AISLE_Z,7],[END_LANE_Z,4.5]]){
    lineX(top,0,cz-len/2,W-6); lineX(top,0,cz+len/2,W-6);
    for(const x of [-8,0,8]) node(deco(), arrow(1.4), MAT.paintW, {x,y:top+0.05,z:cz}, quatY(270)); } // -X
  node(deco(), arrow(1.4), MAT.paintW, {x:0,y:top+0.05,z:0}, quatY(0));      // cruce central: +Z (aisle->foso)
  node(deco(), arrow(1.4), MAT.paintW, {x:0,y:top+0.05,z:8}, quatY(0));
  giveWay(top,-SIDE_X+1.5,AISLE_Z,2.6); giveWay(top,-SIDE_X+1.5,FRONT_AISLE_Z,2.6);
  node(deco(), arrow(1.6), MAT.paintW, {x:0,y:top+0.05,z:REAR_Z+1}, quatY(180)); // a la rampa
}
for(const num of [1,2]) chevronIsland(topOf(num), 0, REAR_Z+2.8, 4, 3);
for(const num of [1,2]) zebra(topOf(num), 0, FRONT_AISLE_Z);

// --- Sensores: L1 (cubierto) techo; AZOTEA poste de luz en el PERIMETRO ---
const zoneById=Object.fromEntries(model.zones.map((z)=>[z.dtId,z]));
const zoneFor=(id)=>{const m=id.match(/L\d-([AB])/),l=id.match(/L(\d)/)[1];return zoneById[`ZONE-L${l}-${m[1]}`];};
for(const sd of model.smokeDetectors){const num=parseInt(sd.dtId.match(/L(\d)/)[1],10),z=zoneFor(sd.dtId);
  if(num===2){const px=z.code==='A'?-16:16, pz=-6.5; lampPole(px,pz,topOf(2),5.0);
    node(sd.dtId, box(0.5,0.22,0.5), MAT.smoke, {x:px,y:topOf(2)+5.18,z:pz});}
  else{const y=lvlY(2)-0.45; node(sd.dtId, box(0.55,0.22,0.55), MAT.smoke, {x:sd.x,y,z:sd.z}); node(deco(), box(0.1,0.32,0.1), MAT.concDark, {x:sd.x,y:y+0.27,z:sd.z});}}
for(const lm of model.luminositySensors){const num=parseInt(lm.dtId.match(/L(\d)/)[1],10),z=zoneFor(lm.dtId);
  if(num===2){const px=z.code==='A'?-16:16, pz=-1.5; lampPole(px,pz,topOf(2),5.0);
    node(lm.dtId, box(0.4,0.18,0.4), MAT.lumen, {x:px,y:topOf(2)+5.16,z:pz});}
  else{node(lm.dtId, box(0.4,0.18,0.4), MAT.lumen, {x:lm.x,y:lvlY(2)-0.5,z:lm.z});}}

// --- Luminarias en el techo del Nivel 1 ---
for(const lx of [-10,-3.5,3.5,10]) node(deco(), box(0.5,0.08,38), MAT.light, {x:lx,y:lvlY(2)-slabTop-0.05,z:-2});

// --- Parapeto + baranda de la AZOTEA ---
const pH=0.6, pTop=topOf(2), py=pTop+pH/2, pt=0.16, rg=18;
node(deco(), box(W,pH,pt), MAT.concrete, {x:0,y:py,z:D/2});
node(deco(), box(pt,pH,D), MAT.concrete, {x:-W/2,y:py,z:0});
node(deco(), box(pt,pH,D), MAT.concrete, {x:W/2,y:py,z:0});
node(deco(), box((W-rg)/2,pH,pt), MAT.concrete, {x:-(W+rg)/4,y:py,z:-D/2});
node(deco(), box((W-rg)/2,pH,pt), MAT.concrete, {x:(W+rg)/4,y:py,z:-D/2});
for(const s of [{x:0,z:D/2,w:W,d:0.06},{x:-W/2,z:0,w:0.06,d:D},{x:W/2,z:0,w:0.06,d:D}]) node(deco(), box(s.w,0.06,s.d), MAT.rail, {x:s.x,y:pTop+pH+0.4,z:s.z});

// --- Fachada del Nivel 1 (curb) ---
for(const s of [{x:0,z:D/2,w:W,d:0.16},{x:0,z:-D/2,w:W,d:0.16},{x:-W/2,z:0,w:0.16,d:D},{x:W/2,z:0,w:0.16,d:D}]) node(deco(), box(s.w,0.3,s.d), MAT.concDark, {x:s.x,y:topOf(1)+0.15,z:s.z});

// --- RAMPA HELICOIDAL recubierta por DRUM (abierto arriba) ---
{
  const rampId=model.ramps[0]?.dtId ?? 'RAMP-L1-L2';
  const seg=84, a0=Math.PI/2, a1=a0+2*Math.PI;
  const y0=topOf(1)+0.02, y1=topOf(2)+0.02; const c={x:0,y:0,z:RZ};
  node(rampId, helixRoad(Rin,Rout,a0,a1,y0,y1,seg), MAT.ramp, c);
  node(deco(), helixRoad(Rin,Rout,a0-0.06,a1,y0-0.30,y1-0.30,seg), MAT.concDark, c);
  node(deco(), helixWall(Rout,a0,a1,y0,y1,seg,0.22), MAT.paintW, c);
  node(deco(), helixWall(Rin, a0,a1,y0,y1,seg,0.22), MAT.paintY, c);
  for(let k=0;k<=15;k++){const t=k/15,a=a0+(a1-a0)*t,y=y0+(y1-y0)*t,cx=Math.cos(a),cz=Math.sin(a);
    node(deco(), box(road-0.2,0.02,0.18), MAT.tread, {x:cx*Rc,y:y+0.04,z:RZ+cz*Rc}, quatY((a*180/Math.PI)+90));}
  node(deco(), cylinder(0.5,GAP+0.8,16), MAT.concrete, {x:0,y:topOf(1)+(GAP+0.8)/2-0.4,z:RZ});
  node(deco(), arcWall(Rdrum, (125*Math.PI/180), (55*Math.PI/180)+2*Math.PI, topOf(1)-0.3, topOf(2)+0.7, 64), MAT.drum, c);
  node(deco(), helixWall(Rdrum, (125*Math.PI/180), (55*Math.PI/180)+2*Math.PI, topOf(2)+0.7, topOf(2)+0.7, 64, 0.18), MAT.concrete, c);
  node(deco(), box(road,0.06,3.5), MAT.ramp, {x:0,y:y0,z:RZ+Rc+1.0});
  node(deco(), box(road,0.06,3.5), MAT.ramp, {x:0,y:y1,z:RZ+Rc+1.0});
  node(deco(), box(0.7,0.7,0.06), MAT.signB, {x:-3.5,y:topOf(1)+2.2,z:RZ+Rc+1.6});
  node(deco(), box(0.7,0.7,0.06), MAT.signB, {x:3.5,y:topOf(2)+2.2,z:RZ+Rc+1.6});
}

// --- DOS ASCENSORES flanqueando la rampa (sobre piso de azotea; fuera del drum) ---
function elevator(cx,cz,yBase,yTop){
  node(deco(), box(2.2,yTop-yBase,2.2), MAT.elevGlass, {x:cx,y:(yBase+yTop)/2,z:cz});
  node(deco(), box(2.4,0.2,2.4), MAT.elev, {x:cx,y:yTop+0.1,z:cz});
  node(deco(), box(2.4,0.2,2.4), MAT.elev, {x:cx,y:yBase,z:cz});
  for(const yy of [topOf(1),topOf(2)]){ node(deco(), box(1.2,2.0,0.06), MAT.door, {x:cx,y:yy+1.0,z:cz+1.12});
    node(deco(), box(0.3,0.3,0.04), MAT.signB, {x:cx+0.9,y:yy+1.6,z:cz+1.15}); }
}
for(const ex of [-ELEV_X,ELEV_X]){ elevator(ex, RZ, topOf(1), topOf(2)+2.2);
  zebra(topOf(2), ex, holeZf+1.5, 4); } // cruce de la zona de ascensores a las plazas

// --- Accesos (vivos) ---
//   Nivel 1: PORTICO (marco de puerta) al frente, con tablero ENTRADA/SALIDA hacia afuera.
//   Azotea: SIN portico -> solo un marcador de piso (la malla viva se conserva para ADT).
for(const ap of model.accessPoints){const isEnt=ap.dtId.endsWith('ENT'),num=parseInt(ap.dtId.match(/L(\d)/)[1],10);
  if(num===1){ gantry(ap.dtId, isEnt?SIDE_X:-SIDE_X, D/2-2.2, topOf(1), isEnt); }
  else       { node(ap.dtId, box(1.4,0.05,1.4), isEnt?MAT.signG:MAT.signR, {x:isEnt?4:-4,y:topOf(2)+0.04,z:holeZf+1.5}); }
}

// --- Juntas de dilatacion ---
for(const num of [1,2]){const top=topOf(num);
  for(const jz of [-13,5,15]) node(deco(), box(W-0.5,0.012,0.06), MAT.joint, {x:0,y:top+0.012,z:jz});
  for(const jx of [-12,0,12]) node(deco(), box(0.06,0.012,D-0.5), MAT.joint, {x:jx,y:top+0.012,z:0});}

// --- Fascia perimetral ---
for(const num of [1,2]){const fy=topOf(num)-0.18;
  node(deco(), box(W+0.2,0.34,0.18), MAT.fascia, {x:0,y:fy,z:-D/2-0.05});
  node(deco(), box(W+0.2,0.34,0.18), MAT.fascia, {x:0,y:fy,z:D/2+0.05});
  node(deco(), box(0.18,0.34,D+0.2), MAT.fascia, {x:-W/2-0.05,y:fy,z:0});
  node(deco(), box(0.18,0.34,D+0.2), MAT.fascia, {x:W/2+0.05,y:fy,z:0});}

// --- Jardinera frente al ingreso ---
for(const num of [1,2]){const top=topOf(num);
  node(deco(), box(6,0.4,1.2), MAT.concDark, {x:0,y:top+0.2,z:END_LANE_Z+3});
  node(deco(), box(5.8,0.25,1.0), MAT.planter, {x:0,y:top+0.45,z:END_LANE_Z+3});}

// --- Autos en circulacion (sentido unico; NO en bahias) ---
car(SIDE_X, topOf(1), 6, MAT.carC, 180);
car(-6, topOf(1), AISLE_Z, MAT.carA, 270);
car(-SIDE_X, topOf(1), 2, MAT.carB, 0);
car(5, topOf(2), AISLE_Z, MAT.carA, 270);
car(SIDE_X, topOf(2), -9, MAT.carB, 180);

// ---- Texturas de texto: anexar PNGs al buffer binario ----
const bvEnt=pushBV(TEX_ENT.png);
const bvSal=pushBV(TEX_SAL.png);

// ---- GLB --------------------------------------------------------------------
const gltf={asset:{version:'2.0',generator:'SmartPark ADT garage v9 (Apex Twin)'},scene:0,
  scenes:[{name:'SmartPark',nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,accessors,bufferViews,
  images:[{bufferView:bvEnt,mimeType:'image/png'},{bufferView:bvSal,mimeType:'image/png'}],
  samplers:[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}],
  textures:[{source:0,sampler:0},{source:1,sampler:0}],
  buffers:[{byteLength:binLength}]};
const jr=Buffer.from(JSON.stringify(gltf),'utf8');const jrem=jr.length%4;
const jsonChunk=jrem===0?jr:Buffer.concat([jr,Buffer.alloc(4-jrem,0x20)]);const binChunk=Buffer.concat(bin);
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonChunk.length+8+binChunk.length,8);
const chunk=(t,d)=>{const h=Buffer.alloc(8);h.writeUInt32LE(d.length,0);h.writeUInt32LE(t,4);return Buffer.concat([h,d]);};
const glb=Buffer.concat([header,chunk(0x4e4f534a,jsonChunk),chunk(0x004e4942,binChunk)]);
writeFileSync(join(__dirname,'parking-garage.glb'),glb);
const sum=summarize(model);const live=nodes.filter(n=>!n.name.startsWith('deco-')).length;
console.log('GLB v9 generado:');
console.log('  tamano:',(glb.length/1024).toFixed(1),'KB | nodos:',nodes.length,'| vivas:',live,'| deco:',nodes.length-live);
console.log('  porticos (sin casetas) | ascensores x=±'+ELEV_X+' (drum R='+Rdrum.toFixed(1)+') | pozo azotea ±'+holeX+' | sensores azotea al perimetro');
