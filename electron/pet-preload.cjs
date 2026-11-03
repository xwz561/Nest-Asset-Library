const {contextBridge,ipcRenderer,webUtils}=require('electron');
document.addEventListener('drop',async event=>{
 if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
 event.preventDefault();
 const files=Array.from(event.dataTransfer?.files||[]);
 let result;
 if(files.length!==1)result={error:'一次只拖一个文件或文件夹'};
 else{
  try{
   const target=webUtils.getPathForFile(files[0]);
   result=target?await ipcRenderer.invoke('pet:feed-dropped',target):{error:'无法读取拖入项目的本地路径'};
  }catch{result={error:'投喂失败，请重试'};}
 }
 window.dispatchEvent(new CustomEvent('nest-pet-feed-result',{detail:result}));
},true);
contextBridge.exposeInMainWorld('nestPet',{get:()=>ipcRenderer.invoke('pet:get'),update:p=>ipcRenderer.invoke('pet:update',p),reset:()=>ipcRenderer.invoke('pet:reset'),dragStart:()=>ipcRenderer.invoke('pet:drag-start'),dragMove:()=>ipcRenderer.invoke('pet:drag-move'),dragEnd:()=>ipcRenderer.invoke('pet:drag-end'),interact:action=>ipcRenderer.invoke('pet:interact',action),menu:()=>ipcRenderer.invoke('pet:menu'),onAction:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('pet:action',listener);return()=>ipcRenderer.removeListener('pet:action',listener);},onFeedDropResult:callback=>{const listener=event=>callback(event.detail);window.addEventListener('nest-pet-feed-result',listener);return()=>window.removeEventListener('nest-pet-feed-result',listener);}});
