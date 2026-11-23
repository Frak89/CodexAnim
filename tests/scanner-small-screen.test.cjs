const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/codec.js');
const S=require('../app/src/main/assets/scanner.js');
function render(symbols,{size=140,rotate=0,tint=0}={}){
 const n=Math.sqrt(symbols.length),w=800,h=600,
 unit=size/(n+6),ox=(w-size)/2,oy=(h-size)/2;
 const data=new Uint8ClampedArray(w*h*4).fill(255);
 const fill=(x,y,ww,hh,color)=>{
   const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
   for(let xx=Math.max(0,Math.floor(x));xx<Math.min(w,Math.ceil(x+ww));xx++)
     for(let yy=Math.max(0,Math.floor(y));yy<Math.min(h,Math.ceil(y+hh));yy++){
      if(xx<x||yy<y||xx>=x+ww||yy>=y+hh)continue;
      const off=(yy*w+xx)*4;
      for(let k=0;k<3;k++)data[off+k]=Math.min(255,Math.floor(rgb[k]*(1-tint)+255*tint));
     }
 };
 fill(ox+unit*2,oy+unit*2,(n+2)*unit,(n+2)*unit,C.PALETTE[0]);
 for(let i=0;i<n*n;i++){
   const row=Math.floor(i/n),col=i%n;
   const x=rotate===1?n-1-row:rotate===2?n-1-col:rotate===3?row:col;
   const y=rotate===1?col:rotate===2?n-1-row:rotate===3?n-1-col:row;
   fill(ox+(x+3)*unit,oy+(y+3)*unit,unit,unit,C.PALETTE[symbols[i]]);
 }
 return {data,width:w,height:h};
}
test('Regression: 32x32 code of 120px on an 800x600 camera viewport',()=>{
 const bytes=Uint8Array.from({length:460},(_,i)=>(i*17)&255);
 const syms=C.encodeFrame(bytes,{grid:32,session:44},0);
 const diag={},frame=S.decodeImageData(render(syms,{size:120}),diag);
 assert.ok(frame,JSON.stringify(diag));
 assert.equal(frame.grid,32);
 assert.deepEqual(frame.chunk,bytes);
});
test('Decode 16-color optical frame at four orientations and with exposure shift',()=>{
 const bytes=Uint8Array.from({length:120},(_,i)=>(i*3+1)&255);
 const syms=C.encodeFrame(bytes,{grid:24,session:77},0);
 for(let rot=0;rot<4;rot++){
   const d={},frame=S.decodeImageData(render(syms,{size:230,rotate:rot,tint:.15}),d);
   assert.ok(frame,'rotation '+rot+': '+JSON.stringify(d));
   assert.deepEqual(frame.chunk,bytes);
 }
});
test('Background alone is never a valid CIMG frame',()=>{
 const w=800,h=600,d=new Uint8ClampedArray(w*h*4).fill(255);
 const stats={};assert.equal(S.decodeImageData({width:w,height:h,data:d},stats),null);
 assert.equal(stats.phase,'no-border');
});
test('Out-of-order fragments reconstruct the stream',()=>{
 const payload=Uint8Array.from({length:1000},(_,i)=>i%256);
 const n=32,count=Math.ceil(payload.length/C.capacity(n));
 const decoded=[];
 for(let k=count-1;k>=0;k--){
   const syms=C.encodeFrame(payload,{grid:n,session:123},k);
   const frame=S.decodeImageData(render(syms,{size:210}));
   assert.ok(frame);
   decoded[frame.seq]=frame.chunk;
 }
 assert.deepEqual(C.concat(decoded),payload);
});
