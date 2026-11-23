const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/codec.js');
const G=require('../app/src/main/assets/gif.js');
function gifInfo(raw){
 const b=new Uint8Array(raw),header=Buffer.from(b.slice(0,6)).toString();
 assert.equal(header,'GIF89a');
 let pos=13+(b[10]&128 ? 3*(2**((b[10]&7)+1)):0),frameCount=0,transparent=0,delays=[];
 const skipBlocks=()=>{while(true){const size=b[pos++];if(size===0)break;pos+=size;}};
 while(pos<b.length){
  const tag=b[pos++];
  if(tag===0x3b)break;
  if(tag===0x21){
    const kind=b[pos++];
    if(kind===0xf9){
      assert.equal(b[pos++],4);
      const packed=b[pos++],delay=b[pos]|(b[pos+1]<<8);
      delays.push(delay);pos+=2;
      if(packed&1)transparent++;
      pos+=2;
    } else skipBlocks();
  } else if(tag===0x2c){
    const packed=b[pos+8];pos+=9;
    if(packed&128)pos+=3*(2**((packed&7)+1));
    pos++;skipBlocks();frameCount++;
  }else throw Error('Invalid GIF marker '+tag.toString(16)+' at '+(pos-1));
 }
 return {frameCount,transparent,delays};
}
test('30 FPS with 10x temporal redundancy produces 20 frames but only two full matrix payloads',async()=>{
 const data=Uint8Array.from({length:120},(_,i)=>(i*3)&255);
 const frames=[C.encodeFrame(data,{grid:16,session:34},0),C.encodeFrame(data,{grid:16,session:35},0)];
 const gif=await G.encodeGif(frames,{width:176,height:176,fps:30,repeatEach:10});
 const info=gifInfo(await gif.arrayBuffer());
 assert.equal(info.frameCount,20);
 assert.equal(info.transparent,18);
 assert.ok(info.delays.every(x=>x>=3&&x<=4));
 assert.equal(info.delays.reduce((a,b)=>a+b,0),67); // 20 frames / 30 FPS
});
test('CIMG metadata round-trips temporal repetition without changing payload bytes',()=>{
 const payload=Uint8Array.from([4,8,15,16,23,42]);
 const raw=C.packCimg({stream:payload,grid:32,fps:30,repeatEach:10});
 const parsed=C.unpackCimg(raw);
 assert.equal(parsed.meta.repeatEach,10);
 assert.deepEqual(parsed.stream,payload);
});
