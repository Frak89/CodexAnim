/* CIMG v0.4 optical control rail.
   Fixed square, colored payload cells, binary control bits on the outermost ring.
   The original black finder and CIMG v1 payload/header stay unchanged. */
(function(root){
"use strict";
const C=root.CIMG;
const HEADER_BITS=96,ZERO=6,ONE=11; // Cyan 0; magenta 1
function crc16(a){
 let crc=0xffff;
 for(const x of a){crc^=x<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?((crc<<1)^0x1021)&65535:(crc<<1)&65535;}
 return crc;
}
function header(frame){
 if(!frame||frame.count>65535||frame.seq>65535)throw Error("Control ring supports up to 65535 frames");
 const b=new Uint8Array(12);
 b[0]=0xc7;b[1]=0x40|(frame.flags&3);C.u32(b,2,frame.session);
 b[6]=frame.seq>>>8;b[7]=frame.seq&255;b[8]=frame.count>>>8;b[9]=frame.count&255;
 const v=crc16(b.slice(0,10));b[10]=v>>>8;b[11]=v&255;return b;
}
function parse(b){
 if(b.length!==12||b[0]!==0xc7||(b[1]&0xfc)!==0x40)throw Error("Invalid control rail marker");
 const v=(b[10]<<8)|b[11];if(crc16(b.slice(0,10))!==v)throw Error("Invalid control rail CRC16");
 const seq=(b[6]<<8)|b[7],count=(b[8]<<8)|b[9],flags=b[1]&3;
 if(count<1||seq>=count||Boolean(flags&1)!==(seq===0)||Boolean(flags&2)!==(seq===count-1))throw Error("Invalid control rail sequence");
 return {version:1,session:C.r32(b,2),seq,count,flags};
}
function perimeter(n){
 const m=n+10,p=[];
 for(let x=0;x<m;x++)p.push([0,x]);
 for(let y=1;y<m;y++)p.push([y,m-1]);
 for(let x=m-2;x>=0;x--)p.push([m-1,x]);
 for(let y=m-2;y>=1;y--)p.push([y,0]);
 if(p.length<HEADER_BITS)throw Error("Not enough control cells");
 return p;
}
function railSymbols(frame,n){
 const data=header(frame),p=perimeter(n),syms=new Uint8Array(p.length);
 for(let i=0;i<p.length;i++){const j=i%HEADER_BITS;syms[i]=((data[j>>>3]>>>(7-(j&7)))&1)?ONE:ZERO;}
 return syms;
}
function pixelIndices(symbols,width,height,frame){
 const n=Math.sqrt(symbols.length),m=n+10;
 if(!Number.isInteger(n)||n<16)throw Error("Invalid CIMG payload");
 const u=Math.floor(Math.min(width,height)/m);if(u<2)throw Error("Image too small");
 const ox=Math.floor((width-u*m)/2),oy=Math.floor((height-u*m)/2);
 const pixels=new Uint8Array(width*height).fill(8);
 function rect(x,y,ww,hh,k){
  for(let yy=Math.max(0,y);yy<Math.min(height,y+hh);yy++)
   pixels.fill(k,yy*width+Math.max(0,x),yy*width+Math.min(width,x+ww));
 }
 rect(ox+4*u,oy+4*u,(n+2)*u,(n+2)*u,0);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)rect(ox+(c+5)*u,oy+(r+5)*u,u,u,symbols[r*n+c]);
 const syms=railSymbols(frame,n),pts=perimeter(n);
 for(let k=0;k<pts.length;k++){const [r,c]=pts[k];rect(ox+c*u,oy+r*u,u,u,syms[k]);}
 return pixels;
}
function paintCanvas(ctx,syms,width,height,frame){
 const n=Math.sqrt(syms.length),m=n+10,u=Math.floor(Math.min(width,height)/m);
 if(u<1)throw Error("Image too small");
 const ox=Math.floor((width-u*m)/2),oy=Math.floor((height-u*m)/2);
 ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
 ctx.fillStyle=C.PALETTE[0];ctx.fillRect(ox+4*u,oy+4*u,(n+2)*u,(n+2)*u);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  ctx.fillStyle=C.PALETTE[syms[r*n+c]];
  ctx.fillRect(ox+(c+5)*u,oy+(r+5)*u,u,u);
 }
 const colors=railSymbols(frame,n),p=perimeter(n);
 for(let k=0;k<p.length;k++){const [r,c]=p[k];ctx.fillStyle=C.PALETTE[colors[k]];ctx.fillRect(ox+c*u,oy+r*u,u,u);}
}
function readRail(img,box,grid,rotation=0){
 const side=grid+10,u=box.width/(grid+2),ox=box.x-4*u,oy=box.y-4*u;
 if(u<2||ox<0||oy<0||ox+side*u>img.width+2||oy+side*u>img.height+2)return null;
 const {data:d,width:w,height:h}=img,p=perimeter(grid),bytes=new Uint8Array(12);
 let contrast=0;
 for(let k=0;k<HEADER_BITS;k++){
  let [r,c]=p[k];
  if(rotation===1){const t=c;c=side-1-r;r=t;}
  else if(rotation===2){r=side-1-r;c=side-1-c;}
  else if(rotation===3){const t=c;c=r;r=side-1-t;}
  const x=Math.round(ox+(c+.5)*u),y=Math.round(oy+(r+.5)*u);
  if(x<0||y<0||x>=w||y>=h)return null;
  const o=4*(y*w+x),red=d[o],green=d[o+1];
  if(red>green)bytes[k>>>3]|=1<<(7-(k&7));
  contrast+=Math.abs(red-green);
 }
 try{const v=parse(bytes);v.contrast=contrast/HEADER_BITS;return v;}catch(ignore){return null;}
}
const api={ZERO,ONE,HEADER_BITS,crc16,header,parse,perimeter,railSymbols,pixelIndices,paintCanvas,readRail};
root.CimgContour=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
