/* CodexAnim optical receiver v1. Near-fronto-parallel display detection.
 * Pure functions: testable without camera/DOM in Node.
 */
(function(root){
"use strict";
const C=root.CIMG;
const GRIDS=[16,24,32,40,48,56,64,72,80,88,96];
function dark(d,p){return d[p]<65&&d[p+1]<75&&d[p+2]<85}
function detectBounds(image){
  const {data:d,width:w,height:h}=image,rows=[],xmin=Math.floor(w*.04),xmax=Math.floor(w*.96);
  const minRun=Math.max(40,Math.floor(Math.min(w,h)*.25));
  for(let y=Math.floor(h*.04);y<Math.floor(h*.96);y+=2){
    let st=-1,best=-1,bx=0;
    for(let x=xmin;x<xmax;x++){
      const isDark=dark(d,4*(y*w+x));
      if(isDark){if(st<0)st=x}
      else if(st>=0){if(x-st>best){best=x-st;bx=st}st=-1}
    }
    if(st>=0&&xmax-st>best){best=xmax-st;bx=st}
    if(best>=minRun)rows.push({x:bx,y,width:best});
  }
  if(!rows.length)return null;
  let best=null,score=-1;
  for(let i=0;i<rows.length;i++){
    const a=rows[i];
    for(let j=i+1;j<rows.length;j++){
      const b=rows[j],dy=b.y-a.y,span=(a.width+b.width)/2;
      if(dy<span*.76||dy>span*1.18)continue;
      if(Math.abs(a.x-b.x)>span*.055||Math.abs(a.width-b.width)>span*.085)continue;
      const s=span-Math.abs(dy-span)*1.5;
      if(s>score){score=s;best={x:(a.x+b.x)/2,y:a.y,width:span,height:dy}}
    }
  }
  if(best){
    const xmid=Math.max(0,Math.min(w-1,Math.floor(best.x+best.width/2)));
    let top=Math.floor(best.y);
    while(top>0&&dark(d,4*((top-1)*w+xmid)))top--;
    best.y=top;
  }
  return best;
}
function sampleRGB(img,x,y,delta){
  const {data:d,width:w,height:h}=img;let rr=0,gg=0,bb=0;
  for(const [dx,dy] of [[0,0],[-delta,0],[delta,0],[0,-delta],[0,delta]]){
    const xx=Math.max(0,Math.min(w-1,Math.round(x+dx))),yy=Math.max(0,Math.min(h-1,Math.round(y+dy))),p=4*(yy*w+xx);
    rr+=d[p];gg+=d[p+1];bb+=d[p+2];
  }
  return [rr/5,gg/5,bb/5];
}
function findFrame(img,bounds){
  const {x,y,width:side}=bounds;
  for(const n of GRIDS){
    const sx=side/(n+2),sy=sx;
    if(sx<2.2)continue;
    const delta=Math.max(0,Math.floor(sx*.12));
    for(let rot=0;rot<4;rot++){
      const loc=(r,c)=>{
        let xx=c,yy=r;
        if(rot===1){xx=n-1-r;yy=c}
        else if(rot===2){xx=n-1-c;yy=n-1-r}
        else if(rot===3){xx=r;yy=n-1-c}
        return sampleRGB(img,x+(xx+1.5)*sx,y+(yy+1.5)*sy,delta);
      };
      const swatches=Array.from({length:16},(_,i)=>loc(0,i));
      const code=rgb=>{
        let k=0,score=Infinity;
        for(let j=0;j<16;j++){
          const a=swatches[j],dist=(rgb[0]-a[0])**2+(rgb[1]-a[1])**2+(rgb[2]-a[2])**2;
          if(dist<score){score=dist;k=j}
        }
        return k;
      };
      const probe=[];
      for(let z=16;z<32;z++)probe.push(code(loc(Math.floor(z/n),z%n)));
      const expected=[4,3,4,9,4,13,4,7,0,1];
      if(!expected.every((v,i)=>probe[i]===v))continue;
      const symbols=new Uint8Array(n*n);
      for(let k=0;k<16;k++)symbols[k]=k;
      for(let k=16;k<n*n;k++)symbols[k]=code(loc(Math.floor(k/n),k%n));
      try{return C.decodeFrameSymbols(symbols)}catch(e){/* wrong frame/grid/angle */}
    }
  }
  return null;
}
function decodeImageData(image){
  const bounds=detectBounds(image);
  return bounds?findFrame(image,bounds):null;
}
const api={detectBounds,findFrame,decodeImageData};
root.CimgScanner=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
