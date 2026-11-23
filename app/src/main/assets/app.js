/* CodexAnim UI + live optical sender/receiver (no cloud or libraries). */
(function(){
"use strict";
const $=id=>document.getElementById(id), C=globalThis.CIMG, G=globalThis.CimgGIF;
const gridChoices=[16,24,32,40,48,56,64,72,80,88,96];
let source=null,pack=null,frames=[],frameNumber=0,playTimer=null;
let cameraStream=null,scanTimer=null,scanBusy=false,recovered=null,session=null;
let lastScanStatus="",lastDiagnostics=null,lastCameraSize="";
const temporal=globalThis.CimgRecovery.createRecovery();
let lastPartialStamp=0;
const scanStats={samples:0,border:0,header:0,checksum:0,decoded:0,unique:0,duplicate:0,errors:0};
const scanLog=[];let lastStatsRendered=0;
function logScan(event,detail=""){
  const record=new Date().toISOString()+"  "+event+(detail?"  "+detail:"");
  scanLog.push(record);if(scanLog.length>400)scanLog.shift();
}
function renderDiagnostics(){
 const d=lastDiagnostics||{};
 $("scanDiagnostics").textContent="Fotocamera: "+(cameraStream?"attiva "+lastCameraSize:"non attiva")+
 " | letture: "+scanStats.samples+" | cornici: "+scanStats.border+
 " | header: "+scanStats.header+" | CRC errati: "+scanStats.checksum+
 " | validi: "+scanStats.decoded+" | nuovi: "+scanStats.unique+
 " | ripetuti: "+scanStats.duplicate+
 " | riparati CRC: "+temporal.getStats().repaired+
 " | in memoria: "+temporal.getStats().cached+
 "\nFase: "+(d.phase||"in attesa")+" | candidati: "+(d.candidates||0)+
 (d.grid?" | griglia "+d.grid+" | rotazione "+d.rotation+"°":"")+
 (d.lastError?"\nUltimo errore: "+d.lastError:"")+
 (session?"\nFrammenti mancanti: "+(session.count-session.received)+" su "+session.count:"")+
 (lastScanStatus?"\nStato: "+lastScanStatus:"");
}
const canvas=$("display"),ctx=canvas.getContext("2d",{alpha:false});
const scanCanvas=document.createElement("canvas"),scanCtx=scanCanvas.getContext("2d",{willReadFrequently:true});
function fmt(n){if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KiB";return(n/1048576).toFixed(2)+" MiB"}
function message(t,error=false){$("message").textContent=t;$("message").className=error?"error":""}
function cfg(){
  const grid=Number($("grid").value),fps=Number($("fps").value);
  const width=Math.round(Math.max(128,Math.min(1920,Number($("w").value)||512)));
  const height=Math.round(Math.max(128,Math.min(1920,Number($("h").value)||512)));
  const repeatEach=Number($("repeatEach").value)||1;
  return {grid,fps,repeatEach,width,height,contour:$("frameContour").checked,session:0};
}
function optimizeGrid(){
  const el=$("autoGrid");if(!el||!el.checked){$("grid").disabled=false;return}
  $("grid").disabled=true;
  const w=Math.max(128,Math.min(1920,Number($("w").value)||512));
  const h=Math.max(128,Math.min(1920,Number($("h").value)||512));
  const physicalMax=Math.floor(Math.min(w,h)/12)-($("frameContour").checked?10:6);
  const eligible=gridChoices.filter(n=>n<=physicalMax);
  const candidates=eligible.length?eligible:[16];
  const seconds=Number($("duration").value),fps=Number($("fps").value);
  const repeated=Number($("repeatEach").value)||1;
  const desiredBytes=source?Math.ceil(source.stream.length/(seconds*fps/repeated)):C.capacity(32);
  const chosen=candidates.find(n=>C.capacity(n)>=desiredBytes)||candidates[candidates.length-1];
  $("grid").value=chosen;
}
function capacityInfo(){
  optimizeGrid();
  const o=cfg(),cp=C.capacity(o.grid),secs=Number($("duration").value);
  const ideal=cp*o.fps*secs/o.repeatEach,n=source?Math.max(1,Math.ceil(source.stream.length/cp)):0;
  const modulePx=Math.floor(Math.min(o.width,o.height)/(o.grid+(o.contour?10:6)));
  const caution=modulePx<7?"<strong>ATTENZIONE: celle troppo piccole per una scansione affidabile.</strong>":"Dimensione cella "+modulePx+" px; suggeriti almeno 7–10 px sul file esportato.";
  const el=$("stats");
  el.innerHTML="<strong>"+cp+" byte utili/fotogramma</strong> · "+o.grid+"×"+o.grid+" · "+o.fps+" FPS · "+o.repeatEach+" ripetizioni"+
    "<br>Capacità teorica in "+secs+" s: <strong>"+fmt(ideal)+"</strong> (prima della compressione)"+
    "<br>"+(source?"File compresso: <strong>"+fmt(source.stream.length)+"</strong> → "+n+" fotogrammi → "+
       (n*o.repeatEach/o.fps).toFixed(1)+" s per ciclo":"Seleziona un file per stimare il numero di fotogrammi")+
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
      $("repeatEach").value=box.meta.repeatEach||1;
      $("frameContour").checked=!!box.meta.contour;
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
  if(o.contour){globalThis.CimgContour.paintCanvas(ctx,syms,w,h,C.decodeFrameSymbols(syms));
   const kind=frames.length===1?"CODE_START + CODE_END":idx===0?"CODE_START":idx===frames.length-1?"CODE_END":"DATA";
   $("frameBadge").textContent=kind+" · "+(idx+1)+"/"+frames.length;return;}
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
  let repeatTick=0;
  playTimer=setInterval(()=>{
    repeatTick++;
    frameNumber=Math.floor(repeatTick/pack.repeatEach);
    if(frameNumber>=frames.length){
      if($("repeat").value==="0"){stopPlay();frameNumber=frames.length-1;return}
      frameNumber=0;repeatTick=0;
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
function showScan(t){lastScanStatus=t;$("scanInfo").textContent=t}
async function startScanner(){
  stopScanner();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    message("Fotocamera non disponibile: usa Chrome su localhost/HTTPS oppure l'APK.",true);return;
  }
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
    $("camera").srcObject=cameraStream;await $("camera").play();
    lastCameraSize=$("camera").videoWidth+"×"+$("camera").videoHeight;
    logScan("camera start",lastCameraSize);showScan("Fotocamera attiva. Inquadra tutto il quadrato, frontalmente.");renderDiagnostics();
    scanTimer=setInterval(scanTick,110);message("Scanner avviato.");
  }catch(e){logScan("camera error",e.message);message("Fotocamera: "+e.message+". Controlla il permesso CAMERA.",true);renderDiagnostics()}
}
function stopScanner(){
  if(scanTimer)clearInterval(scanTimer);scanTimer=null;
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  $("camera").srcObject=null;renderDiagnostics();
}
function resetScan(){
  session=null;recovered=null;$("btnRecovered").disabled=true;$("progressFill").style.width="0%";
  for(const k of Object.keys(scanStats))scanStats[k]=0;
  scanLog.length=0;lastDiagnostics=null;temporal.clear();
  showScan("Ricezione azzerata. Inquadra il codice animato.");logScan("reset");renderDiagnostics();
}
async function receive(frame){
  if(frame.count>10000||frame.totalSize>100*1024*1024){logScan("rejected","Too many frames or payload too large");return;}
  const id=[frame.session,frame.crc,frame.count,frame.totalSize].join(":");
  if(!session||session.id!==id){
    session={id,parts:new Array(frame.count),received:0,...frame};
    recovered=null;$("btnRecovered").disabled=true;logScan("new session",id);
  }
  if(session.parts[frame.seq]){scanStats.duplicate++;return;}
  temporal.dropReceived(frame);
  session.parts[frame.seq]=frame.chunk;session.received++;scanStats.unique++;
  logScan("fragment","#"+(frame.seq+1)+"/"+frame.count+" session="+frame.session.toString(16));
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
    logScan("complete",recovered.filename+" "+recovered.bytes.length+" bytes");message("File recuperato. Premi «Salva file ricostruito».");stopScanner();renderDiagnostics();
  }catch(e){scanStats.errors++;logScan("rebuild error",e.message);showScan("Errore ricostruzione: "+e.message);message(e.message,true);session=null;renderDiagnostics();}
}
async function scanTick(){
  if(scanBusy||!cameraStream||recovered)return;
  const v=$("camera");if(v.readyState<2||!v.videoWidth)return;
  scanBusy=true;
  try{
    const factor=Math.min(1,1024/v.videoWidth,768/v.videoHeight);
    scanCanvas.width=Math.floor(v.videoWidth*factor);scanCanvas.height=Math.floor(v.videoHeight*factor);
    scanCtx.drawImage(v,0,0,scanCanvas.width,scanCanvas.height);
    const im=scanCtx.getImageData(0,0,scanCanvas.width,scanCanvas.height);
    const diag={};scanStats.samples++;
    const frame=globalThis.CimgScanner.decodeImageData(im,diag);
    lastDiagnostics=diag;
    if(diag.candidates)scanStats.border++;
    if(diag.headers)scanStats.header++;
    if(diag.phase==="checksum")scanStats.checksum++;
    if(frame){
      scanStats.decoded++;
      await receive(frame);
    }else if(diag.partial && !recovered){
      const fixed=temporal.add(diag.partial);
      if(fixed){scanStats.decoded++;logScan("CRC recovered","frame "+(fixed.seq+1));await receive(fixed);}
      else if(Date.now()-lastPartialStamp>1800){
        lastPartialStamp=Date.now();
        logScan("noisy frame","seq="+(diag.partial.seq+1)+" grid="+diag.partial.grid+
          " samples="+temporal.getStats().cached);
      }
    }
    const now=Date.now();
    if(now-lastStatsRendered>750){renderDiagnostics();lastStatsRendered=now;}
  }catch(e){scanStats.errors++;logScan("scanner exception",e.message);renderDiagnostics();}
  finally{scanBusy=false}
}
async function captureScan(){
 try{
   const v=$("camera");if(!cameraStream||!v.videoWidth)throw Error("Avvia prima la fotocamera");
   const c=document.createElement("canvas");c.width=v.videoWidth;c.height=v.videoHeight;
   c.getContext("2d").drawImage(v,0,0,c.width,c.height);
   const b=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   if(!b)throw Error("PNG non disponibile");
   await downloadBlob(b,"CodexAnim_camera_snapshot.png");logScan("snapshot saved",v.videoWidth+"×"+v.videoHeight);
 }catch(e){message("Fotogramma: "+e.message,true);logScan("snapshot error",e.message)}
}
async function exportDebug(){
 try{
   const report=["CodexAnim scan debug v1.1",new Date().toISOString(),
    "Camera: "+lastCameraSize,"Diagnostics: "+$("scanDiagnostics").textContent,
    "Configuration: screen recording is not included", "",...scanLog].join("\n");
   await downloadBlob(new Blob([report],{type:"text/plain"}),"CodexAnim_debug.log");
 }catch(e){message("debug.log: "+e.message,true)}
}
async function decodePhoto(file){
 if(!file)return;
 try{
   const bmp=await createImageBitmap(file);const factor=Math.min(1,960/bmp.width,720/bmp.height);
   scanCanvas.width=Math.max(1,Math.floor(bmp.width*factor));
   scanCanvas.height=Math.max(1,Math.floor(bmp.height*factor));
   scanCtx.drawImage(bmp,0,0,scanCanvas.width,scanCanvas.height);bmp.close?.();
   const diag={},im=scanCtx.getImageData(0,0,scanCanvas.width,scanCanvas.height);
   const frame=globalThis.CimgScanner.decodeImageData(im,diag);
   lastDiagnostics=diag;lastCameraSize="file immagine "+scanCanvas.width+"×"+scanCanvas.height;
   logScan("photo decode",file.name+" "+diag.phase+(diag.lastError?" "+diag.lastError:""));
   if(frame){scanStats.decoded++;await receive(frame);message("Fotogramma #"+(frame.seq+1)+" identificato nell'immagine.");}
   else message("Immagine non decodificata: "+diag.phase+". Esporta debug.log.",true);
   renderDiagnostics();
 }catch(e){scanStats.errors++;logScan("photo error",e.message);message("Immagine: "+e.message,true)}
}
async function saveRecovered(){
  if(!recovered)return;
  try{await downloadBlob(new Blob([recovered.bytes],{type:recovered.mime}),safeName(recovered.filename));message("File ricostruito pronto al salvataggio.")}
  catch(e){message(e.message,true)}
}
function wire(){
  $("fileInput").addEventListener("change",e=>openInput(e.target.files[0]));
  $("fps").addEventListener("change",()=> {
    if(Number($("fps").value)>=30 && Number($("repeatEach").value)===1){
      $("repeatEach").value="10";
      message("30 FPS selezionati: ripetizione 10× per mantenere ogni matrice leggibile ~330 ms.");
    }
  });
  for(const id of ["grid","fps","repeatEach","w","h","duration","autoGrid","frameContour"])$(id).addEventListener("change",()=>{stopPlay();capacityInfo();if(frames.length)message("Configurazione cambiata: premi «Prepara sequenza» per applicarla.")});
  $("btnGenerate").onclick=prepare;$("btnPlay").onclick=play;$("btnStop").onclick=stopPlay;
  $("btnFull").onclick=()=>{const box=document.querySelector(".screen");if(box.requestFullscreen)box.requestFullscreen().catch(e=>message(e.message,true));else message("Fullscreen non disponibile",true)};
  $("btnCimg").onclick=saveCimg;$("btnGif").onclick=saveGif;$("btnPng").onclick=savePng;$("btnWebm").onclick=saveWebm;
  $("tabCreate").onclick=()=>openTab("create");$("tabScan").onclick=()=>openTab("scan");$("tabInfo").onclick=()=>openTab("info");
  $("btnCamera").onclick=startScanner;$("btnCameraStop").onclick=stopScanner;$("btnReset").onclick=resetScan;$("btnRecovered").onclick=saveRecovered;
  $("btnCapture").onclick=captureScan;$("btnSaveLog").onclick=exportDebug;
  $("scanImageInput").onchange=e=>{decodePhoto(e.target.files[0]);e.target.value="";};
  $("palette").innerHTML=C.PALETTE.map((c,i)=>'<div style="background:'+c+'">'+i.toString(16).toUpperCase()+'</div>').join("");
  capacityInfo();renderDiagnostics();
}
globalThis.CodexUI={stopScanner,closeFullscreen(){if(document.fullscreenElement)document.exitFullscreen()}};
wire();
})();
