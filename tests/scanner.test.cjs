const {test}=require("node:test");
const assert=require("node:assert/strict");
const C=require("../app/src/main/assets/codec.js");
const S=require("../app/src/main/assets/scanner.js");
function synth(symbols,{rotate=0,tint=false}={}){
  const n=Math.sqrt(symbols.length),unit=8,w=640,h=480,ox=140,oy=75;
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)data.set([255,255,255,255],i*4);
  function rect(x,y,ww,hh,hex){
    const color=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    if(tint)for(let i=0;i<3;i++)color[i]=Math.min(255,Math.round(color[i]*.82+22));
    for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++){
      const p=4*(yy*w+xx);data[p]=color[0];data[p+1]=color[1];data[p+2]=color[2];data[p+3]=255;
    }
  }
  rect(ox+2*unit,oy+2*unit,(n+2)*unit,(n+2)*unit,C.PALETTE[0]);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    const x=rotate===1?n-1-r:rotate===2?n-1-c:rotate===3?r:c;
    const y=rotate===1?c:rotate===2?n-1-r:rotate===3?n-1-c:r;
    rect(ox+(x+3)*unit,oy+(y+3)*unit,unit,unit,C.PALETTE[symbols[r*n+c]]);
  }
  return {data,width:w,height:h};
}
for(const rotate of [0,1,2,3]){
  test("camera finds frame with rotation "+(rotate*90)+" degrees",()=>{
    const stream=Uint8Array.from({length:420},(_,i)=>(i*39+16)%256);
    const raw=C.encodeFrame(stream,{grid:32,session:1005},0);
    const image=synth(raw,{rotate,tint:true});
    const b=S.detectBounds(image);
    assert.ok(b,"black frame must be found");
    const decoded=S.decodeImageData(image);
    assert.ok(decoded,"payload must decode");
    assert.equal(decoded.session,1005);
    assert.equal(decoded.seq,0);
    assert.deepEqual(decoded.chunk,stream);
  });
}
test("unrelated camera image does not decode",()=>{
  const image={width:640,height:480,data:new Uint8ClampedArray(640*480*4).fill(255)};
  assert.equal(S.decodeImageData(image),null);
});
