const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/codec.js');
const Q=require('../app/src/main/assets/contour.js');
const S=require('../app/src/main/assets/scanner.js');
function cameraImage(indices,width,height){
 const d=new Uint8ClampedArray(width*height*4);
 const pal=C.PALETTE.map(hex=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)));
 for(let i=0;i<indices.length;i++){
  const rgb=pal[indices[i]];
  const offset=i*4;
  d[offset]=rgb[0];d[offset+1]=rgb[1];d[offset+2]=rgb[2];d[offset+3]=255;
 }
 return {data:d,width,height};
}
test('contour packs exact session, frame index, total, start/end and CRC16',()=>{
 const f={session:0x4a67c15f,seq:1,count:3,flags:0};
 const b=Q.header(f),back=Q.parse(b);
 assert.equal(back.session,f.session);assert.equal(back.seq,1);
 assert.equal(back.count,3);assert.equal(back.flags,0);
 b[7]^=1;assert.throws(()=>Q.parse(b),/CRC16/);
});
test('all internal CIMG v1 payload bytes decode unchanged with static v0.4 rail',()=>{
 S.trackerReset();
 const payload=Uint8Array.from({length:200},(_,i)=>(i*19+4)&255);
 const frame=C.encodeFrame(payload,{grid:24,session:0x225588dd},0);
 const raw=Q.pixelIndices(frame,560,560,C.decodeFrameSymbols(frame));
 const img=cameraImage(raw,560,560),d={};
 const parsed=S.decodeImageData(img,d);
 assert.ok(parsed,JSON.stringify(d));
 assert.deepEqual(parsed.chunk,payload);
 const ctrl=Q.readRail(img,d._box,24,d._rot);
 assert.ok(ctrl,'CIMG v0.4 control ring should decode');
 assert.equal(ctrl.seq,0);assert.equal(ctrl.count,1);assert.equal(ctrl.flags,3);
 assert.equal(ctrl.session,parsed.session);
 const fast={};
 const repeated=S.decodeImageData(img,fast,read=>read.seq===0&&read.session===parsed.session);
 assert.equal(repeated,null);
 assert.equal(fast.fastSkip,true);
 assert.equal(fast.phase,'duplicate');
});
test('contour stays static while data and control bits vary by frame',()=>{
 const bytes=Uint8Array.from({length:350},(_,i)=>i&255);
 const a=C.encodeFrame(bytes,{grid:24,session:9},0);
 const b=C.encodeFrame(bytes,{grid:24,session:9},1);
 const pa=Q.pixelIndices(a,480,480,C.decodeFrameSymbols(a));
 const pb=Q.pixelIndices(b,480,480,C.decodeFrameSymbols(b));
 const n=24,unit=Math.floor(480/(n+10)),ox=Math.floor((480-unit*(n+10))/2);
 const center=(ox+4*unit)*480+(ox+4*unit);
 assert.equal(pa[center],0);assert.equal(pb[center],0);
 assert.notDeepEqual(pa,pb);
 const ra=Q.railSymbols(C.decodeFrameSymbols(a),n),rb=Q.railSymbols(C.decodeFrameSymbols(b),n);
 assert.notDeepEqual(ra,rb);
});
