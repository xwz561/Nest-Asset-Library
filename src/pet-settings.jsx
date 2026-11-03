import React,{useEffect,useState} from 'react';
import {Button} from './ready-ui.jsx';

const DEFAULT_PET={enabled:false,size:100,throwEnabled:true,autonomyEnabled:true,hunger:10,petId:'maid-deepseek-whale'};
const PET_CHOICES=[
 {id:'maid-deepseek-whale',name:'Maid DeepSeek Whale',description:'蓝发鲸鱼女仆 · 海军蓝裙子、白色褶边和鲸鱼尾巴',kind:'video',preview:'./pets/maid-deepseek-whale/idle.webm'},
 {id:'liu-hai-buddy',name:'刘海小伙伴',description:'手机待机、左右行走、挥手、跳跃和饥饿状态动画',kind:'sprite',preview:'./pets/wangzai-buddies/liu-hai.png'},
 {id:'glasses-buddy',name:'眼镜小伙伴',description:'手机待机、左右行走、挥手、跳跃和饥饿状态动画',kind:'sprite',preview:'./pets/wangzai-buddies/glasses.png'},
 {id:'silver-kitten',name:'银渐层小猫',description:'待机、行走、挥爪、跳跃和多方向观察动画',kind:'sprite',preview:'./pets/silver-kitten/spritesheet-extended-final.png'},
];

function PetChoicePreview({choice}){
 if(choice.kind==='video')return <video src={choice.preview} autoPlay muted loop playsInline aria-hidden="true"/>;
 return <span className="pet-choice-sprite" aria-hidden="true"><img src={choice.preview} alt="" draggable="false"/></span>;
}

export function PetSettings(){
 const [pet,setPet]=useState(DEFAULT_PET),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let live=true;
  const refresh=()=>window.nestDesktop?.pet?.get().then(value=>{if(live)setPet({...DEFAULT_PET,...value});}).catch(()=>{if(live)setStatus('无法读取宠物设置');});
  refresh();
  const unlisten=window.nestDesktop?.pet?.onChanged?.(value=>{if(live)setPet({...DEFAULT_PET,...value});});
  window.addEventListener('focus',refresh);
  return()=>{live=false;unlisten?.();window.removeEventListener('focus',refresh);};
 },[]);
 const save=async patch=>{
  if(!window.nestDesktop?.pet){setStatus('桌宠需要桌面版支持');return;}
  setBusy(true);
  try{const value=await window.nestDesktop.pet.update(patch);setPet({...DEFAULT_PET,...value});setStatus('宠物设置已保存');}
  catch{setStatus('保存宠物设置失败');}
  finally{setBusy(false);}
 };
 const selectedPet=PET_CHOICES.find(choice=>choice.id===pet.petId)||PET_CHOICES[0];
 return <div className="settings-generic pet-settings">
  <div className="pet-settings-heading"><h2>宠物</h2><Button disabled={busy} onClick={()=>save({enabled:!pet.enabled})}>{pet.enabled?'关闭宠物':'显示宠物'}</Button></div>
  <p className="settings-hint">本地动画桌宠，支持拖动和抛掷。可把单个文件或文件夹直接拖到桌宠上投喂，确认后源项目会移入回收站；右键宠物也可喂食、睡觉、散步或互动。</p>
  <section className="pet-choice-section" aria-label="选择桌宠">
   <strong>选择桌宠</strong>
   <div className="pet-choice-grid" role="radiogroup" aria-label="桌宠角色">
    {PET_CHOICES.map(choice=>{
     const selected=selectedPet.id===choice.id;
     return <button key={choice.id} type="button" className={`pet-choice${selected?' selected':''}`} role="radio" aria-checked={selected} disabled={busy} onClick={()=>save({petId:choice.id})}>
      <span className="pet-choice-art"><PetChoicePreview choice={choice}/></span>
      <span className="pet-choice-copy"><b>{choice.name}</b><small>{choice.description}</small><em>{selected?'当前使用':'点击切换'}</em></span>
     </button>;
    })}
   </div>
  </section>
  <section className="pet-settings-card"><strong>{selectedPet.name}</strong><small>{pet.enabled?'已显示':'未显示'}</small></section>
  <section className="pet-hunger-card">
   <div className="pet-hunger-head"><strong>饥饿值</strong><b>{pet.hunger}/10 格</b></div>
   <div className="pet-hunger-track" role="meter" aria-label="宠物饥饿值" aria-valuemin="0" aria-valuemax="10" aria-valuenow={pet.hunger}><span style={{width:`${pet.hunger*10}%`}}/></div>
   <div className="pet-hunger-actions"><small>每 1 小时下降 1 格；投喂本地文件、文件夹或图片恢复 1 格。投喂后源项目移入回收站。</small><Button disabled={!pet.enabled||busy||pet.hunger>=10} onClick={async()=>{setBusy(true);try{const result=await window.nestDesktop.pet.feed();if(result?.error)throw new Error(result.error);if(result?.canceled)return;const value=await window.nestDesktop.pet.get();setPet({...DEFAULT_PET,...value});setStatus(`已投喂“${result?.food?.name||'本地项目'}”，饥饿值恢复 1 格`);}catch(error){setStatus(error.message||'投喂失败');}finally{setBusy(false);}}}>选择本地食物</Button></div>
  </section>
  <section className="pet-settings-options">
   <label className="pet-size-label"><span>大小 <b>{pet.size}%</b></span><input type="range" aria-label="宠物大小" min="50" max="200" step="5" value={pet.size} disabled={busy} onChange={e=>setPet({...pet,size:Number(e.target.value)})} onPointerUp={e=>save({size:Number(e.currentTarget.value)})} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))save({size:Number(e.currentTarget.value)})}}/><small>调整桌宠大小（50–200%）</small></label>
   <label className="pet-throw-row"><span><b>开启宠物抛掷</b><small>开启后甩动宠物会飞出并在屏幕边缘回弹；关闭时松手即停。</small></span><input type="checkbox" role="switch" aria-label="开启宠物抛掷" checked={pet.throwEnabled} disabled={busy} onChange={e=>save({throwEnabled:e.target.checked})}/></label>
   <label className="pet-throw-row"><span><b>自主活动</b><small>宠物会不定时在桌面散步和睡觉；关闭后仍可拖动，也能用右键菜单互动。</small></span><input type="checkbox" role="switch" aria-label="开启宠物自主活动" checked={pet.autonomyEnabled} disabled={busy||!pet.enabled} onChange={e=>save({autonomyEnabled:e.target.checked})}/></label>
   <Button disabled={!pet.enabled||busy} onClick={async()=>{try{await window.nestDesktop.pet.reset();setStatus('宠物已回到屏幕右下角');}catch{setStatus('重置位置失败');}}}>重置宠物位置</Button>
  </section>
  <p className="pet-attribution">原鲸鱼桌宠动画来源：<a href="https://github.com/PC2005-cloud/dsh-pet" target="_blank" rel="noreferrer">PC2005-cloud/dsh-pet</a> · 素材禁止商用</p>
  <p role="status">{status}</p>
 </div>;
}
