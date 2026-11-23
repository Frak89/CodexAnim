/* CodexAnim / CIMG v1 — binary protocol, no external dependencies.
 * Every image contains 16 calibration symbols plus a 34-byte frame header.
 * Pixel layout: 2-module white quiet zone, 1-module black border, N*N data.
 * Each data cell represents one hexadecimal nibble (4 bits).
 */
(function(root){
"use strict";
const PALETTE=[
  "#101820","#f44336","#43a047","#2196f3",
  "#ffeb3b","#9c27b0","#00bcd4","#ff9800",
  "#ffffff","#666666","#b6ef3c","#ff4faf",
  "#3f51b5","#008577","#bbc8d2","#795548"
];
const MAGIC=[67,73,77,71], INNER=[67,73,70,49];
const HEADER_BYTES=34, CALIBRATION_CELLS=16;
const te=new TextEncoder(), td=new TextDecoder();
function assert(test,msg){if(!test)throw Error(msg)}
function u16(b,p,v){b[p]=v>>>8;b[p+1]=v&255}
function u32(b,p,v){v=v>>>0;b[p]=v>>>24;b[p+1]=(v>>>16)&255;b[p+2]=(v>>>8)&255;b[p+3]=v&255}
function r16(b,p){return (b[p]<<8)|b[p+1]}
function r32(b,p){return ((b[p]*16777216)+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3])>>>0}
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function capacity(grid){
  assert(Number.isInteger(grid)&&grid>=16&&grid<=96&&grid%8===0,"Grid must be 16..96, multiple of eight");
  return Math.floor((grid*grid-CALIBRATION_CELLS)/2)-HEADER_BYTES;
}
function concat(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
function encodeInner(fileBytes,filename,mime){
  const name=te.encode(filename||"file.bin"), type=te.encode(mime||"application/octet-stream");
  assert(name.length<=65535&&type.length<=65535,"Name/type too long");
  assert(fileBytes.length<=0xffffffff,"File exceeds CIMG v1 limit");
  const head=new Uint8Array(12);
  head.set(INNER,0);u16(head,4,name.length);u16(head,6,type.length);u32(head,8,fileBytes.length);
  return concat([head,name,type,fileBytes]);
}
function decodeInner(bytes){
  assert(bytes.length>=12&&INNER.every((b,i)=>bytes[i]===b),"Invalid CIF1 header");
  const nameLen=r16(bytes,4),typeLen=r16(bytes,6),size=r32(bytes,8);
  const off=12+nameLen+typeLen;
  assert(off<=bytes.length&&size===bytes.length-off,"Invalid CIF1 size");
  return {filename:td.decode(bytes.slice(12,12+nameLen)),mime:td.decode(bytes.slice(12+nameLen,off)),bytes:bytes.slice(off)};
}
function encodeFrame(stream,{grid=32,session=1},seq){
  const cp=capacity(grid),count=Math.max(1,Math.ceil(stream.length/cp));
  assert(seq>=0&&seq<count,"Frame out of range");
  assert(stream.length<=0xffffffff&&count<=0xffffffff,"Stream too large");
  const chunk=stream.slice(seq*cp,Math.min(stream.length,(seq+1)*cp));
  const h=new Uint8Array(HEADER_BYTES);
  h.set(MAGIC);h[4]=1;h[5]=(seq===0?1:0)|(seq===count-1?2:0);h[6]=grid;h[7]=0;
  u32(h,8,session);u32(h,12,seq);u32(h,16,count);u32(h,20,stream.length);
  u16(h,24,chunk.length);u32(h,26,crc32(stream));u32(h,30,crc32(chunk));
  const payload=concat([h,chunk]);
  const syms=new Uint8Array(grid*grid).fill(8);
  for(let i=0;i<16;i++)syms[i]=i;
  for(let i=0;i<payload.length;i++){syms[16+i*2]=payload[i]>>>4;syms[17+i*2]=payload[i]&15}
  return syms;
}
function decodeFrameSymbols(syms){
  const grid=Math.round(Math.sqrt(syms.length));const cp=capacity(grid);
  if(grid*grid!==syms.length)throw Error("Not a square grid");
  for(let i=0;i<16;i++)if(syms[i]!==i)throw Error("Calibration failed");
  const data=new Uint8Array(Math.floor((syms.length-16)/2));
  for(let i=0;i<data.length;i++)data[i]=(syms[16+2*i]<<4)|syms[17+2*i];
  assert(MAGIC.every((b,i)=>data[i]===b)&&data[4]===1&&data[6]===grid,"Unrecognized frame");
  const n=r16(data,24), count=r32(data,16), seq=r32(data,12), totalSize=r32(data,20);
  assert(n<=cp&&seq<count&&count>0&&totalSize<=count*cp&&totalSize>(count-1)*cp,"Corrupt frame dimensions");
  assert(n===Math.min(cp,totalSize-seq*cp),"Unexpected frame length");
  const chunk=data.slice(HEADER_BYTES,HEADER_BYTES+n);
  assert(crc32(chunk)===r32(data,30),"Frame checksum mismatch");
  return {version:1,flags:data[5],grid,session:r32(data,8),seq,count,totalSize,crc:r32(data,26),chunk};
}
function packCimg({stream,filename="file.bin",mime="application/octet-stream",grid=32,width=512,height=512,fps=3}){
  capacity(grid);
  const meta=te.encode(JSON.stringify({version:1,filename,mime,grid,width,height,fps,streamCrc32:crc32(stream)}));
  assert(meta.length<=100000,"Metadata too large");
  const h=new Uint8Array(13);h.set([67,73,77,71,49],0);u32(h,5,meta.length);u32(h,9,stream.length);
  return concat([h,meta,stream]);
}
function unpackCimg(raw){
  assert(raw.length>=13&&[67,73,77,71,49].every((v,i)=>raw[i]===v),"Not a .cimg file");
  const ml=r32(raw,5),sl=r32(raw,9);assert(ml<=100000&&sl===raw.length-13-ml,"Bad .cimg length");
  const meta=JSON.parse(td.decode(raw.slice(13,13+ml)));
  capacity(meta.grid);assert(meta.version===1,"Unsupported .cimg version");
  const stream=raw.slice(13+ml);assert(crc32(stream)===meta.streamCrc32,".cimg integrity check failed");
  return {meta,stream};
}
const api={PALETTE,HEADER_BYTES,capacity,crc32,encodeInner,decodeInner,encodeFrame,decodeFrameSymbols,packCimg,unpackCimg,concat,r32,u32};
root.CIMG=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
