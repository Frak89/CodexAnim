/* Offline GIF89a encoder: fixed 16-color global palette, LZW, looping, no CDN. */
(function(root){
"use strict";
const colors=root.CIMG.PALETTE;
function paintIndices(symbols,width,height){
  const grid=Math.sqrt(symbols.length),unit=Math.floor(Math.min(width,height)/(grid+6));
  if(unit<2)throw Error("Image too small for this grid");
  const ox=Math.floor((width-unit*(grid+6))/2),oy=Math.floor((height-unit*(grid+6))/2);
  const pix=new Uint8Array(width*height).fill(8);
  const rect=(x,y,w,h,k)=>{const x0=Math.max(0,x),y0=Math.max(0,y),x1=Math.min(width,x+w),y1=Math.min(height,y+h);
    for(let j=y0;j<y1;j++)pix.fill(k,j*width+x0,j*width+x1);
  };
  rect(ox+2*unit,oy+2*unit,(grid+2)*unit,(grid+2)*unit,0);
  for(let r=0;r<grid;r++)for(let c=0;c<grid;c++)
    rect(ox+(c+3)*unit,oy+(r+3)*unit,unit,unit,symbols[r*grid+c]);
  return pix;
}
function lzw(indices){
  const clear=16,end=17;let codeSize=5,next=18,dict=new Map();
  const bytes=[];let bits=0,work=0;
  const emit=(code)=>{work|=code<<bits;bits+=codeSize;while(bits>=8){bytes.push(work&255);work>>>=8;bits-=8}};
  emit(clear);let phrase=indices[0]||0;
  for(let i=1;i<indices.length;i++){
    const c=indices[i],key=phrase*16+c; // Dictionary key must identify all possible phrase IDs.
    if(dict.has(key)){phrase=dict.get(key);continue}
    emit(phrase);
    if(next<4096){dict.set(key,next++);if(next>(1<<codeSize)&&codeSize<12)codeSize++}
    else{emit(clear);dict=new Map();next=18;codeSize=5}
    phrase=c;
  }
  emit(phrase);emit(end);if(bits>0)bytes.push(work&255);
  const blocks=[];for(let i=0;i<bytes.length;i+=255){const size=Math.min(255,bytes.length-i);blocks.push(size,...bytes.slice(i,i+size))}
  blocks.push(0);return blocks;
}
function createWriter(){
  const b=[];return {b, byte(v){b.push(v&255)},word(v){b.push(v&255,(v>>>8)&255)},ascii(s){for(const c of s)b.push(c.charCodeAt(0))},bytes(a){for(const v of a)b.push(v)}};
}
async function encodeGif(frames,{width=512,height=512,fps=3,onProgress}={}){
  if(!frames.length)throw Error("No GIF frames");
  if(frames.length>240)throw Error("GIF limit: 240 frames. Use .cimg or on-screen playback");
  if(width*height*frames.length>45000000)throw Error("GIF too large. Reduce image resolution or frames");
  if(width<1||height<1||width>65535||height>65535)throw Error("Invalid GIF dimensions");
  const w=createWriter();w.ascii("GIF89a");w.word(width);w.word(height);w.byte(0xf3);w.byte(8);w.byte(0);
  for(const hex of colors){const n=parseInt(hex.slice(1),16);w.bytes([(n>>>16)&255,(n>>>8)&255,n&255])}
  w.bytes([0x21,0xff,11]);w.ascii("NETSCAPE2.0");w.bytes([3,1,0,0,0]);
  const delay=Math.max(2,Math.round(100/Math.max(1,fps)));
  for(let i=0;i<frames.length;i++){
    w.bytes([0x21,0xf9,4,0x04]);w.word(delay);w.bytes([0,0]);
    w.byte(0x2c);w.word(0);w.word(0);w.word(width);w.word(height);w.byte(0);
    w.byte(4);w.bytes(lzw(paintIndices(frames[i],width,height)));
    if(onProgress)onProgress(i+1,frames.length);
    if(i%2===1)await new Promise(r=>setTimeout(r,0));
  }
  w.byte(0x3b);return new Blob([new Uint8Array(w.b)],{type:"image/gif"});
}
root.CimgGIF={encodeGif,paintIndices};
if(typeof module!=="undefined"&&module.exports)module.exports=root.CimgGIF;
})(globalThis);
