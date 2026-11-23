/* CodexAnim optical receiver v1.1 — backwards compatible with CIMG v1 frames.
 * Detects multiple square-border hypotheses, rejects bad CRC32, supports rotations
 * and reports failures instead of silently dropping unknown camera images.
 */
(function(root){
'use strict';
const C=root.CIMG;
const GRIDS=[16,24,32,40,48,56,64,72,80,88,96];
const MAGIC_NIBBLES=[4,3,4,9,4,13,4,7,0,1];
function nearDark(d,p){return d[p]<125&&d[p+1]<125&&d[p+2]<135}
function detectCandidates(img){
 const {data:d,width:w,height:h}=img;
 if(w<80||h<80||d.length<w*h*4)return [];
 const threshold=Math.max(26,Math.round(Math.min(w,h)*.085));
 const x0=Math.max(0,Math.floor(w*.02)),x1=Math.min(w,Math.ceil(w*.98));
 const rows=[];
 for(let y=Math.floor(h*.02);y<Math.floor(h*.98);y+=2){
   let start=-1;
   const accept=end=>{
     if(start<0)return;
     if(end-start>=threshold)rows.push({x:start,y,width:end-start});
     start=-1;
   };
   for(let x=x0;x<x1;x++){
     if(nearDark(d,4*(y*w+x))){if(start<0)start=x;}
     else accept(x);
   }
   accept(x1);
 }
 if(!rows.length)return [];
 rows.sort((a,b)=>b.width-a.width);
 const selected=[];
 for(const r of rows){
   if(selected.length>=110)break;
   if(selected.some(v=>Math.abs(v.y-r.y)<3&&Math.abs(v.x-r.x)<3&&Math.abs(v.width-r.width)<4))continue;
   selected.push(r);
 }
 selected.sort((a,b)=>a.y-b.y);
 const boxes=[];
 for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
   const a=selected[i],b=selected[j],width=(a.width+b.width)/2,dy=b.y-a.y;
   if(dy<width*.83||dy>width*1.17)continue;
   if(Math.abs(a.x-b.x)>width*.09||Math.abs(a.width-b.width)>width*.1)continue;
   const left=(a.x+b.x)*.5,top=a.y,side=width;
   const edge=Math.max(1,Math.round(side/68));let passed=0;
   for(const ry of [.17,.36,.64,.83]){
     const yy=Math.max(0,Math.min(h-1,Math.round(top+ry*side)));
     const lx=Math.max(0,Math.min(w-1,Math.round(left+edge)));
     const rx=Math.max(0,Math.min(w-1,Math.round(left+side-edge-1)));
     if(nearDark(d,4*(yy*w+lx)))passed++;
     if(nearDark(d,4*(yy*w+rx)))passed++;
   }
   if(passed<5)continue;
   let y=top;
   const mx=Math.max(0,Math.min(w-1,Math.round(left+side/2)));
   while(y>0&&nearDark(d,4*((y-1)*w+mx)))y--;
   const box={x:left,y,width:side,height:side,score:passed*100+side-Math.abs(dy-width)*2};
   if(boxes.some(v=>Math.abs(v.x-box.x)<side*.025&&Math.abs(v.y-box.y)<side*.025&&Math.abs(v.width-box.width)<side*.05))continue;
   boxes.push(box);
 }
 boxes.sort((a,b)=>b.score-a.score);
 return boxes.slice(0,8);
}
function detectBounds(img){return detectCandidates(img)[0]||null;}
function colorAt(im,x,y,radius){
 const {data:d,width:w,height:h}=im;
 let r=0,g=0,b=0;
 for(const [dx,dy] of [[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]]){
   const xx=Math.max(0,Math.min(w-1,Math.round(x+dx)));
   const yy=Math.max(0,Math.min(h-1,Math.round(y+dy)));
   const p=4*(yy*w+xx);r+=d[p];g+=d[p+1];b+=d[p+2];
 }
 return [r/5,g/5,b/5];
}
function tryGrid(im,box,n,rot,shiftX,shiftY,stretch){
 const sx=box.width*stretch/(n+2);
 if(sx<2.0)return null;
 const dx=box.x+shiftX*sx,dy=box.y+shiftY*sx;
 const rad=Math.max(0,Math.floor(sx*.12));
 const loc=(r,c)=>{
   let xx=c,yy=r;
   if(rot===1){xx=n-1-r;yy=c;}
   else if(rot===2){xx=n-1-c;yy=n-1-r;}
   else if(rot===3){xx=r;yy=n-1-c;}
   return colorAt(im,dx+(xx+1.5)*sx,dy+(yy+1.5)*sx,rad);
 };
 const swatches=Array.from({length:16},(_,i)=>loc(0,i));
 const classify=rgb=>{
   let min=Infinity,best=0;
   for(let j=0;j<16;j++){
     const s=swatches[j],dr=rgb[0]-s[0],dg=rgb[1]-s[1],db=rgb[2]-s[2];
     const cost=dr*dr+dg*dg+db*db;
     if(cost<min){best=j;min=cost;}
   }
   return best;
 };
 for(let i=0;i<MAGIC_NIBBLES.length;i++){
   const k=16+i;
   if(classify(loc(Math.floor(k/n),k%n))!==MAGIC_NIBBLES[i])return {valid:false,preamble:false};
 }
 const symbols=new Uint8Array(n*n);
 for(let i=0;i<16;i++)symbols[i]=i;
 for(let i=16;i<symbols.length;i++)symbols[i]=classify(loc(Math.floor(i/n),i%n));
 try{return {valid:true,preamble:true,frame:C.decodeFrameSymbols(symbols)}}
 catch(e){
   let partial=null;
   try{const p=C.inspectFrameSymbols(symbols);if(!p.valid)partial=p;}catch(ignore){}
   return {valid:false,preamble:true,error:e.message,partial};
 }
}
function findFrame(img,bounds,debug){
 const boxes=Array.isArray(bounds)?bounds:(bounds?[bounds]:[]);
 if(debug){debug.candidates=boxes.length;debug.phase=boxes.length?'border':'no-border';}
 for(const box of boxes){
  for(const n of GRIDS){
   if(box.width/(n+2)<2)continue;
   for(let rot=0;rot<4;rot++){
     for(const [ox,oy,scale] of [[0,0,1],[-.12,0,1],[.12,0,1],[0,-.12,1],[0,.12,1]]){
       const r=tryGrid(img,box,n,rot,ox,oy,scale);
       if(r?.preamble&&debug){
         debug.headers=(debug.headers||0)+1;
         debug.phase=r.valid?'decoded':'checksum';
         if(!r.valid){
           debug.lastError=r.error;
           if(r.partial && !debug.partial)debug.partial=r.partial;
         }
       }
       if(r?.valid){if(debug){debug.grid=n;debug.rotation=rot*90;debug.phase='decoded';}return r.frame;}
     }
   }
  }
 }
 return null;
}
function decodeImageData(img,debug){
 if(debug){debug.phase='no-border';debug.candidates=0;debug.headers=0;debug.lastError='';}
 return findFrame(img,detectCandidates(img),debug);
}
const api={detectCandidates,detectBounds,findFrame,decodeImageData};
root.CimgScanner=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
