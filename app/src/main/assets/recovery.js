/* Temporal redundancy decoder for CIMG v1. It never trusts a recovered
 * fragment unless its CRC32 matches the original frame header.
 * A noisy display/camera pair may produce different wrong bytes in successive
 * passes. Voting on repeated optical packets can correct those accidental errors.
 * This is NOT forward error correction and cannot repair an unseen packet.
 */
(function(root){
'use strict';
const C=root.CIMG;
function createRecovery({maxPackets=100,maxSamples=9}={}){
 const cache=new Map();
 let accepted=0,attempts=0,repaired=0;
 function add(packet){
   if(!packet||!packet.chunk||!Number.isInteger(packet.seq))return null;
   if(C.crc32(packet.chunk)===packet.expectedCrc){
     accepted++;return { ...packet,valid:true,source:'direct'};
   }
   const key=[packet.session,packet.crc,packet.count,packet.totalSize,packet.seq,packet.expectedCrc].join(':');
   let e=cache.get(key);
   if(!e){
     if(cache.size>=maxPackets)cache.delete(cache.keys().next().value);
     e={length:packet.chunk.length,samples:[]};cache.set(key,e);
   }
   if(e.length!==packet.chunk.length)return null;
   e.samples.push(packet.chunk.slice());
   if(e.samples.length>maxSamples)e.samples.shift();
   if(e.samples.length<2)return null;
   attempts++;
   const merged=new Uint8Array(e.length);
   for(let i=0;i<e.length;i++){
     const freq=new Map();
     for(const sample of e.samples){
       const value=sample[i];freq.set(value,(freq.get(value)||0)+1);
     }
     let bestValue=e.samples[e.samples.length-1][i],best=0;
     for(const [value,n] of freq){
       if(n>best){best=n;bestValue=value;}
     }
     merged[i]=bestValue;
   }
   if(C.crc32(merged)!==packet.expectedCrc)return null;
   repaired++;cache.delete(key);
   return {...packet,chunk:merged,valid:true,source:'temporal-vote'};
 }
 function dropReceived(packet){
   const id=[packet.session,packet.crc,packet.count,packet.totalSize,packet.seq].join(':');
   for(const key of cache.keys())if(key.startsWith(id+':'))cache.delete(key);
 }
 return {add,dropReceived,getStats:()=>({cached:cache.size,accepted,attempts,repaired}),clear:()=>cache.clear()};
}
root.CimgRecovery={createRecovery};
if(typeof module!=='undefined'&&module.exports)module.exports=root.CimgRecovery;
})(globalThis);
