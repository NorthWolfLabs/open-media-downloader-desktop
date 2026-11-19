export type ImageRendition='thumbnail'|'original';
// Preserve animation and transparency. Only display thumbnails are transformed;
// original viewers and acquired files never pass through the encoder.
async function animated(blob:Blob){
 if(blob.type==='image/gif'||blob.type==='image/avif')return true;
 if(blob.type==='image/webp'){const b=new Uint8Array(await blob.slice(0,32).arrayBuffer());return String.fromCharCode(...b.slice(12,16))==='VP8X' && !!(b[20]&2);}
 if(blob.type==='image/png'){
  const b=new Uint8Array(await blob.arrayBuffer()),view=new DataView(b.buffer);let at=8;
  while(at+12<=b.length){const n=view.getUint32(at);if(n>b.length-at-12)break;const name=String.fromCharCode(...b.slice(at+4,at+8));if(name==='acTL')return true;if(name==='IDAT')break;at+=n+12;}
 }
 return false;
}
export async function thumbnail(blob:Blob,image:HTMLImageElement):Promise<Blob>{
 const width=image.naturalWidth,height=image.naturalHeight;
 if(Math.max(width,height)<=512 && blob.size<=256*1024)return blob;
 if(width*height>32_000_000 || await animated(blob))return blob;
 const scale=Math.min(1,512/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const ctx=canvas.getContext('2d');if(!ctx)return blob;
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 let alpha=false;
 if(blob.type!=='image/jpeg'){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255){alpha=true;break;}}
 const result=await new Promise<Blob|null>(resolve=>{const timer=setTimeout(()=>resolve(null),1000);canvas.toBlob(value=>{clearTimeout(timer);resolve(value);},alpha?'image/png':'image/jpeg',0.8);});
 return result && (scale<1||result.size<blob.size)?result:blob;
}
