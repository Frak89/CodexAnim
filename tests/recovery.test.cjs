const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/codec.js');
const R=require('../app/src/main/assets/recovery.js');
test('temporal voting reconstructs one corrupted payload from 3 imperfect optical captures',()=>{
 const stream=Uint8Array.from({length:1517},(_,i)=>(i*71+5)&255);
 const original=C.encodeFrame(stream,{grid:56,session:0x4a5c},0);
 const recovery=R.createRecovery();
 let repaired=null;
 for(const index of [190,356,612]){
   const noisy=original.slice();
   noisy[index]=(noisy[index]+1)%16;
   const packet=C.inspectFrameSymbols(noisy);
   assert.equal(packet.valid,false);
   repaired=recovery.add(packet);
 }
 assert.ok(repaired);
 assert.equal(repaired.source,'temporal-vote');
 assert.equal(C.crc32(repaired.chunk),repaired.expectedCrc);
 assert.deepEqual(repaired.chunk,stream);
});
test('single corrupted frame must never be accepted',()=>{
 const payload=Uint8Array.from({length:100},(_,i)=>i);
 const src=C.encodeFrame(payload,{grid:32,session:7},0);
 const bad=src.slice();bad[170]^=1;
 const recovery=R.createRecovery();
 assert.equal(recovery.add(C.inspectFrameSymbols(bad)),null);
 assert.equal(recovery.getStats().repaired,0);
});
test('temporal cache eviction bounds memory and new scans still repair',()=>{
 const recovery=R.createRecovery({maxPackets:2,maxSamples:4});
 for(let k=0;k<4;k++){
  const stream=Uint8Array.from({length:100},(_,i)=>i);
  const src=C.encodeFrame(stream,{grid:32,session:k+1},0);
  const bad=src.slice();bad[170]^=1;
  recovery.add(C.inspectFrameSymbols(bad));
 }
 assert.equal(recovery.getStats().cached,2);
});
