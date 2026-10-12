/** Bound bytes even when Content-Length is absent or incorrect. */
export async function boundedJson(request:Request,maximum=8192):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid_json');
 const chunks:Uint8Array[]=[];let size=0;
 try{
   while(true){
     const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
     if(size>maximum){await reader.cancel();throw new Error('payload_too_large');}
     chunks.push(value);
   }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
