/* CodexAnim UI + live optical sender/receiver (no cloud or libraries). */
(function(){
"use strict";
const $=id=>document.getElementById(id), C=globalThis.CIMG, G=globalThis.CimgGIF;
const gridChoices=[16,24,32,40,48,56,64,72,80,88,96];
let source=null,pack=null,frames=[],frameNumber=0,playTimer=null;
let cameraStream=null,scanTimer=null,scanBusy=false,recovered=null,session=null;
const canvas=$("display"),ctx=canvas.getContext("2d",{alpha:false});
const scanCanvas=document.createElement("canvas"),scanCtx=scanCanvas.getContext("2d",{willReadFrequently:true});
function fmt(n){if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KiB";return(n/1048576).toFixed(2)+" MiB"}
function message(t,error=false){$("message").textContent=t;$("message").className=error?"error":""}
function cfg(){
  const grid=Number($("grid").value),fps=Number($("fps").value);
  const width=Math.round(Math.max(128,Math.min(1920,Number($("w").value)||512)));
  const height=Math.round(Math.max(128,Math.min(1920,Number($("h").value)||512)));
  return {grid,fps,width,height,session:0};
}
function optimizeGrid(){
  const el=$("autoGrid");if(!el||!el.checked){$("grid").disabled=false;return}
  $("grid").disabled=true;
  const w=Math.max(128,Math.min(1920,Number($("w").value)||512));
  const h=Math.max(128,Math.min(1920,Number($("h").value)||512));
  const physicalMax=Math.floor(Math.min(w,h)/12)-6;
  const eligible=gridChoices.filter(n=>n<=physicalMax);
  const candidates=eligible.length?eligible:[16];
  const seconds=Number($("duration").value),fps=Number($("fps").value);
  const desiredBytes=source?Math.ceil(source.stream.length/(seconds*fps)):C.capacity(32);
  const chosen=candidates.find(n=>C.capacity(n)>=desiredBytes)||candidates[candidates.length-1];
  $("grid").value=chosen;
}
function capacityInfo(){
  optimizeGrid();
  const o=cfg(),cp=C.capacity(o.grid),secs=Number($("duration").value);
  const ideal=cp*o.fps*secs,n=source?Math.max(1,Math.ceil(source.stream.length/cp)):0;
  const modulePx=Math.floor(Math.min(o.width,o.height)/(o.grid+6));
  const caution=modulePx<7?"<strong>ATTENZIONE: celle troppo piccole per una scansione affidabile.</strong>":"Dimensione cella "+modulePx+" px; suggeriti almeno 7–10 px sul file esportato.";
  const el=$("stats");
  el.innerHTML="<strong>"+cp+" byte utili/fotogramma</strong> · "+o.grid+"×"+o.grid+" · "+o.fps+" FPS"+
    "<br>Capacità teorica in "+secs+" s: <strong>"+fmt(ideal)+"</strong> (prima della compressione)"+
    "<br>"+(source?"File compresso: <strong>"+fmt(source.stream.length)+"</strong> → "+n+" fotogrammi → "+
       (n/o.fps).toFixed(1)+" s per ciclo":"Seleziona un file per stimare il numero di fotogrammi")+
    "<br>"+caution+"<br><small>La capacità reale dipende da riflessi, messa a fuoco, fotogrammi persi e compressione.</small>";
}
async function compressed(bytes){
  if(typeof CompressionStream!=="function")throw Error("Browser senza CompressionStream: aggiorna Chrome/WebView");
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
}
async function inflated(bytes){
  if(typeof DecompressionStream!=="function")throw Error("Browser senza DecompressionStream");
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
}
async function openInput(file){
  if(!file)return;
  stopPlay();
  source=null;pack=null;frames=[];setButtons(false);$("selectedFile").textContent="Caricamento...";
  try{
    const raw=new Uint8Array(await file.arrayBuffer());
    if(file.name.toLowerCase().endsWith(".cimg")){
      $("autoGrid").checked=false;
      const box=C.unpackCimg(raw),decoded=C.decodeInner(await inflated(box.stream));
      source={stream:box.stream,filename:decoded.filename,mime:decoded.mime,originalSize:decoded.bytes.length};
      $("grid").value=box.meta.grid;$("w").value=box.meta.width;$("h").value=box.meta.height;$("fps").value=box.meta.fps;
    }else{
      const inner=C.encodeInner(raw,file.name,file.type||"application/octet-stream");
      source={stream:await compressed(inner),filename:file.name,mime:file.type||"application/octet-stream",originalSize:raw.length};
    }
    $("selectedFile").textContent=source.filename+" — originale "+fmt(source.originalSize)+" → zlib "+fmt(source.stream.length);
    message("File caricato. Premi «Prepara sequenza».");capacityInfo();
  }catch(e){$("selectedFile").textContent="Errore caricamento";message(e.message,true)}
}
function setButtons(enabled){
  for(const id of ["btnPlay","btnFull","btnCimg","btnGif","btnPng","btnWebm"])$(id).disabled=!enabled;
  $("btnStop").disabled=!enabled;
}
function prepare(){
  if(!source){message("Carica prima un file.",true);return}
  stopPlay();
  try{
    const o=cfg(),cp=C.capacity(o.grid),count=Math.max(1,Math.ceil(source.stream.length/cp));
    if(count>10000)throw Error("Oltre 10.000 fotogrammi: scegli una matrice più grande o un file più piccolo");
    const sid=(Math.random()*0xffffffff)>>>0;
    pack={...o,session:sid};
    frames=Array.from({length:count},(_,i)=>C.encodeFrame(source.stream,pack,i));
    frameNumber=0;drawFrame(0);setButtons(true);
    capacityInfo();message("Sequenza pronta: "+count+" fotogrammi. CODE_START → CODE_END.");
  }catch(e){message(e.message,true)}
}
function drawFrame(idx){
  if(!frames.length)return;
  const o=pack,syms=frames[idx],n=o.grid,w=o.width,h=o.height;
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  const unit=Math.floor(Math.min(w,h)/(n+6)),ox=Math.floor((w-unit*(n+6))/2),oy=Math.floor((h-unit*(n+6))/2);
  if(unit<1)throw Error("Image too small");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#101820";ctx.fillRect(ox+2*unit,oy+2*unit,(n+2)*unit,(n+2)*unit);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    ctx.fillStyle=C.PALETTE[syms[r*n+c]];
    ctx.fillRect(ox+(c+3)*unit,oy+(r+3)*unit,unit,unit);
  }
  const kind=frames.length===1?"CODE_START + CODE_END":idx===0?"CODE_START":idx===frames.length-1?"CODE_END":"DATA";
  $("frameBadge").textContent=kind+" · "+(idx+1)+"/"+frames.length;
}
function stopPlay(){if(playTimer)clearInterval(playTimer);playTimer=null}
function play(){
  if(!frames.length)return;stopPlay();frameNumber=0;drawFrame(0);
  playTimer=setInterval(()=>{
    frameNumber++;
    if(frameNumber>=frames.length){
      if($("repeat").value==="0"){stopPlay();frameNumber=frames.length-1;return}
      frameNumber=0;
    }
    drawFrame(frameNumber);
  },Math.round(1000/pack.fps));
}
function downloadBlob(blob,name){
  if(globalThis.AndroidBridge){
    return blob.arrayBuffer().then(buf=>{
      const bytes=new Uint8Array(buf),step=24576;
      AndroidBridge.beginSave(name,blob.type||"application/octet-stream");
      for(let i=0;i<bytes.length;i+=step){
        const part=bytes.subarray(i,i+step);
        let str="";for(let k=0;k<part.length;k++)str+=String.fromCharCode(part[k]);
        AndroidBridge.appendChunk(btoa(str));
      }
      AndroidBridge.finishSave();message("Scegli dove salvare "+name);
    });
  }
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const safeName=s=>(s||"file").replace(/[\\/:*?"<>|]/g,"_");
async function saveCimg(){
  if(!source||!pack)return;
  try{
    const bytes=C.packCimg({stream:source.stream,filename:source.filename,mime:source.mime,...pack});
    await downloadBlob(new Blob([bytes],{type:"application/octet-stream"}),safeName(source.filename)+".cimg");
    message("Contenitore .cimg pronto ("+fmt(bytes.length)+").");
  }catch(e){message(e.message,true)}
}
async function saveGif(){
  if(!frames.length)return;
  stopPlay();$("btnGif").disabled=true;message("Generazione GIF...");
  try{
    const name=safeName(source.filename)+".gif";
    const blob=await G.encodeGif(frames,{...pack,onProgress:(i,n)=>{if(i===n||i%5===0)message("GIF: fotogramma "+i+" / "+n)}});
    await downloadBlob(blob,name);message("GIF salvata: "+fmt(blob.size)+" · "+pack.fps+" FPS");
  }catch(e){message("GIF non generata: "+e.message,true)}
  finally{$("btnGif").disabled=false}
}
async function savePng(){
  if(!frames.length)return;try{
    drawFrame(frameNumber);const blob=await new Promise(res=>canvas.toBlob(res,"image/png"));
    if(!blob)throw Error("PNG encoding unavailable");
    await downloadBlob(blob,safeName(source.filename)+"-frame-"+(frameNumber+1)+".png");
    message("PNG salvato (singolo fotogramma).");
  }catch(e){message(e.message,true)}
}
async function saveWebm(){
  if(!frames.length)return;
  if(!canvas.captureStream||!globalThis.MediaRecorder){message("Registrazione WebM non supportata qui; usa GIF o .cimg.",true);return}
  if(frames.length>1200){message("Video troppo lungo; riduci il numero di fotogrammi.",true);return}
  stopPlay();$("btnWebm").disabled=true;
  const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime){message("Il browser non supporta WebM.",true);$("btnWebm").disabled=false;return}
  let stream,rec,timer;
  try{
    drawFrame(0);stream=canvas.captureStream(pack.fps);rec=new MediaRecorder(stream,{mimeType:mime});
    const parts=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
    const finished=new Promise((resolve,reject)=>{rec.onerror=reject;rec.onstop=()=>resolve(new Blob(parts,{type:"video/webm"}))});
    rec.start();let idx=0;
    message("Registrazione WebM in corso, "+frames.length+" fotogrammi...");
    timer=setInterval(()=>{idx++;if(idx>=frames.length){clearInterval(timer);rec.stop()}else drawFrame(idx)},Math.round(1000/pack.fps));
    const blob=await finished;await downloadBlob(blob,safeName(source.filename)+".webm");
    message("WebM pronto: "+fmt(blob.size));
  }catch(e){if(timer)clearInterval(timer);if(rec&&rec.state!=="inactive")rec.stop();message("WebM: "+e.message,true)}
  finally{if(stream)stream.getTracks().forEach(t=>t.stop());$("btnWebm").disabled=false}
}
function openTab(which){
  for(const [tab,panel] of [["Create","createPanel"],["Scan","scanPanel"],["Info","infoPanel"]]){
    $("tab"+tab).classList.toggle("active",tab.toLowerCase()===which);
    $(panel).classList.toggle("hidden",tab.toLowerCase()!==which);
  }
  if(which!=="scan")stopScanner();
}
function showScan(t){$("scanInfo").textContent=t}
async function startScanner(){
  stopScanner();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    message("Fotocamera non disponibile: usa Chrome su localhost/HTTPS oppure l'APK.",true);return;
  }
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
    $("camera").srcObject=cameraStream;await $("camera").play();showScan("Fotocamera attiva. Inquadra tutto il quadrato, frontalmente.");
    scanTimer=setInterval(scanTick,110);message("Scanner avviato.");
  }catch(e){message("Fotocamera: "+e.message+". Controlla il permesso CAMERA.",true)}
}
function stopScanner(){
  if(scanTimer)clearInterval(scanTimer);scanTimer=null;
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  $("camera").srcObject=null;
}
function resetScan(){
  session=null;recovered=null;$("btnRecovered").disabled=true;$("progressFill").style.width="0%";
  showScan("Ricezione azzerata. Inquadra il codice animato.");
}
function dark(d,p){return d[p]<65&&d[p+1]<75&&d[p+2]<85}
/* Locate top and bottom border (near-fronto-parallel code on a monitor).
   Dark uninterrupted border distinguishes the code from its colorful matrix. */
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
    // Find the first dark pixel of the upper border rather than its midline.
    // y positions returned by the scan are an arbitrary row within the border.
    const xmid=Math.max(0,Math.min(w-1,Math.floor(best.x+best.width/2)));
    let top=Math.floor(best.y);
    while(top>0&&dark(d,4*((top-1)*w+xmid)))top--;
    best.y=top;
  }
  return best;
}
function sampleRGB(img,x,y,delta){
  const {data:d,width:w,height:h}=img;let rr=0,gg=0,bb=0,n=0;
  for(const [dx,dy] of [[0,0],[-delta,0],[delta,0],[0,-delta],[0,delta]]){
    const xx=Math.max(0,Math.min(w-1,Math.round(x+dx))),yy=Math.max(0,Math.min(h-1,Math.round(y+dy))),p=4*(yy*w+xx);
    rr+=d[p];gg+=d[p+1];bb+=d[p+2];n++;
  }
  return [rr/n,gg/n,bb/n];
}
function findFrame(img,bounds){
  const {x,y,width:side}=bounds;
  for(const n of gridChoices){
    const sx=side/(n+2),sy=sx;
    if(sx<2.2||sy<2.2)continue;
    const delta=Math.max(0,Math.floor(Math.min(sx,sy)*.12));
    // 0, 90, 180, 270 degrees clockwise; swatch row doubles as orientation cue.
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
          const a=swatches[j];const dist=(rgb[0]-a[0])**2+(rgb[1]-a[1])**2+(rgb[2]-a[2])**2;
          if(dist<score){score=dist;k=j}
        }return k;
      };
      const probe=[];
      for(let z=16;z<16+16;z++){probe.push(code(loc(Math.floor(z/n),z%n)))}
      const expected=[4,3,4,9,4,13,4,7,0,1]; // "CIMG" and version byte
      if(!expected.every((v,i)=>probe[i]===v))continue;
      const symbols=new Uint8Array(n*n);
      for(let k=0;k<16;k++)symbols[k]=k;
      for(let k=16;k<n*n;k++)symbols[k]=code(loc(Math.floor(k/n),k%n));
      try{return C.decodeFrameSymbols(symbols)}catch(e){/* next candidate */}
    }
  }
  return null;
}
async function receive(frame){
  if(frame.count>10000||frame.totalSize>100*1024*1024)return;
  const id=[frame.session,frame.crc,frame.count,frame.totalSize].join(":");
  if(!session||session.id!==id){
    session={id,parts:new Array(frame.count),received:0,...frame};
    recovered=null;$("btnRecovered").disabled=true;
  }
  if(session.parts[frame.seq])return;
  session.parts[frame.seq]=frame.chunk;session.received++;
  const p=session.received/frame.count;
  $("progressFill").style.width=(p*100).toFixed(1)+"%";
  showScan("Sessione "+frame.session.toString(16)+" · "+session.received+"/"+frame.count+
    " fotogrammi ("+(p*100).toFixed(1)+"%) · ultimo #"+(frame.seq+1)+" · "+
    ((frame.flags&1)?"CODE_START":(frame.flags&2)?"CODE_END":"DATA"));
  if(session.received!==frame.count)return;
  try{
    const stream=C.concat(session.parts);
    if(stream.length!==frame.totalSize||C.crc32(stream)!==frame.crc)throw Error("CRC32 finale errato");
    recovered=C.decodeInner(await inflated(stream));
    $("btnRecovered").disabled=false;
    showScan("✓ Ricostruzione COMPLETA: "+recovered.filename+" ("+fmt(recovered.bytes.length)+") — CRC32 corretto");
    message("File recuperato. Premi «Salva file ricostruito».");stopScanner();
  }catch(e){showScan("Errore ricostruzione: "+e.message);message(e.message,true);session=null}
}
async function scanTick(){
  if(scanBusy||!cameraStream||recovered)return;
  const v=$("camera");if(v.readyState<2||!v.videoWidth)return;
  scanBusy=true;
  try{
    const factor=Math.min(1,800/v.videoWidth,600/v.videoHeight);
    scanCanvas.width=Math.floor(v.videoWidth*factor);scanCanvas.height=Math.floor(v.videoHeight*factor);
    scanCtx.drawImage(v,0,0,scanCanvas.width,scanCanvas.height);
    const im=scanCtx.getImageData(0,0,scanCanvas.width,scanCanvas.height);
    const bounds=detectBounds(im);if(bounds){
      const frame=findFrame(im,bounds);
      if(frame)await receive(frame);
    }
  }catch(e){/* bad individual image; keep scanning */}
  finally{scanBusy=false}
}
async function saveRecovered(){
  if(!recovered)return;
  try{await downloadBlob(new Blob([recovered.bytes],{type:recovered.mime}),safeName(recovered.filename));message("File ricostruito pronto al salvataggio.")}
  catch(e){message(e.message,true)}
}
function wire(){
  $("fileInput").addEventListener("change",e=>openInput(e.target.files[0]));
  for(const id of ["grid","fps","w","h","duration","autoGrid"])$(id).addEventListener("change",()=>{stopPlay();capacityInfo();if(frames.length)message("Configurazione cambiata: premi «Prepara sequenza» per applicarla.")});
  $("btnGenerate").onclick=prepare;$("btnPlay").onclick=play;$("btnStop").onclick=stopPlay;
  $("btnFull").onclick=()=>{const box=document.querySelector(".screen");if(box.requestFullscreen)box.requestFullscreen().catch(e=>message(e.message,true));else message("Fullscreen non disponibile",true)};
  $("btnCimg").onclick=saveCimg;$("btnGif").onclick=saveGif;$("btnPng").onclick=savePng;$("btnWebm").onclick=saveWebm;
  $("tabCreate").onclick=()=>openTab("create");$("tabScan").onclick=()=>openTab("scan");$("tabInfo").onclick=()=>openTab("info");
  $("btnCamera").onclick=startScanner;$("btnCameraStop").onclick=stopScanner;$("btnReset").onclick=resetScan;$("btnRecovered").onclick=saveRecovered;
  $("palette").innerHTML=C.PALETTE.map((c,i)=>'<div style="background:'+c+'">'+i.toString(16).toUpperCase()+'</div>').join("");
  capacityInfo();
}
globalThis.CodexUI={stopScanner,closeFullscreen(){if(document.fullscreenElement)document.exitFullscreen()}};
wire();
})();
