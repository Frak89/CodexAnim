const {test}=require("node:test");
const assert=require("node:assert/strict");
const C=require("../app/src/main/assets/codec.js");
require("../app/src/main/assets/gif.js");
test("16-color matrix payload capacities grow and are exact",()=>{
  assert.equal(C.PALETTE.length,16);
  assert.equal(C.capacity(16),86);
  assert.equal(C.capacity(32),470);
  assert.equal(C.capacity(64),2006);
  assert.equal(C.capacity(96),4566);
  assert.throws(()=>C.capacity(31));
});
test("CIF1 inner file roundtrips arbitrary binary including zero bytes",()=>{
  const b=Uint8Array.from({length:10001},(_,i)=>(i*19)%256);
  const src=C.encodeInner(b,"foto-èù.bin","application/octet-stream");
  const r=C.decodeInner(src);
  assert.equal(r.filename,"foto-èù.bin");
  assert.deepEqual(r.bytes,b);
});
test("START, DATA, END and out-of-order recovery of all chunks",()=>{
  const bytes=Uint8Array.from({length:2457},(_,i)=>(i*37+8)%256),grid=24,session=0x12345678;
  const cp=C.capacity(grid),count=Math.ceil(bytes.length/cp);
  const parts=Array(count),frames=[];
  for(let i=0;i<count;i++){
    const colors=C.encodeFrame(bytes,{grid,session},i);
    assert.equal(colors.length,grid*grid);
    const f=C.decodeFrameSymbols(colors);frames.push(f);
  }
  assert.equal(frames[0].flags&1,1);
  assert.equal(frames[count-1].flags&2,2);
  assert.equal(frames[1].flags,0);
  for(let i=count-1;i>=0;i--)parts[i]=frames[i].chunk;
  assert.deepEqual(C.concat(parts),bytes);
  assert.equal(C.crc32(C.concat(parts)),frames[0].crc);
});
test("CIMG envelope contains compressed stream and validated metadata",()=>{
  const stream=Uint8Array.from({length:2050},(_,i)=>i&255);
  const raw=C.packCimg({stream,filename:"demo.zip",grid:48,width:720,height:608,fps:4});
  const unpacked=C.unpackCimg(raw);
  assert.equal(unpacked.meta.grid,48);
  assert.equal(unpacked.meta.height,608);
  assert.equal(unpacked.meta.fps,4);
  assert.deepEqual(unpacked.stream,stream);
  raw[raw.length-1]^=2;
  assert.throws(()=>C.unpackCimg(raw),/integrity/);
});
test("A modified optical cell is rejected by checksum",()=>{
  const stream=Uint8Array.from({length:90},(_,i)=>i);
  const syms=C.encodeFrame(stream,{grid:24,session:5},0);
  syms[85]=(syms[85]+1)%16;
  assert.throws(()=>C.decodeFrameSymbols(syms),/checksum/);
});
test("GIF89a has global 16-color palette, loop extension and trailer",async()=>{
  const frames=[C.encodeFrame(Uint8Array.of(1,2,3),{grid:16,session:4},0)];
  const gif=await globalThis.CimgGIF.encodeGif(frames,{width:160,height:160,fps:3});
  const data=new Uint8Array(await gif.arrayBuffer());
  assert.equal(Buffer.from(data.slice(0,6)).toString(),"GIF89a");
  assert.equal(data[10]&7,3);
  assert.equal(data[data.length-1],0x3b);
  assert.ok(Buffer.from(data).includes(Buffer.from("NETSCAPE2.0")));
});
