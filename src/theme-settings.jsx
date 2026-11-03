import React, {useEffect,useState} from 'react';
import {Button} from './ready-ui.jsx';
import {DEFAULT_THEME,THEME_PRESETS,loadTheme,previewTheme,saveTheme,normalizeHex} from './theme-utils.js';
const fields={main:'主界面',sidebar:'侧栏',card:'卡片',overlay:'浮层',accent:'强调色',text:'主要文字',muted:'次要文字',border:'边框',hover:'悬停',selected:'选中'};
export function ThemeSettings({close,inline=false}){
 const [saved,setSaved]=useState(loadTheme),[draft,setDraft]=useState(loadTheme),[status,setStatus]=useState('预览修改后，点击保存配色');
 useEffect(()=>{previewTheme(draft);return()=>previewTheme(saved);},[draft,saved]);
 const apply=()=>{try{const value=saveTheme(draft);setSaved(value);setDraft(value);setStatus('配色已保存');}catch{setStatus('保存失败，请检查配置存储权限');}};
 const choose=p=>setDraft({mode:p.mode||'dark',preset:p.id,colors:{...p.colors},schemaVersion:7});
 return <div className={inline?'appearance-inline':'modal-backdrop theme-backdrop'}><div className={'app-dialog appearance-dialog'+(inline?' appearance-dialog-inline':'')}>
 <div className="dialog-head appearance-head"><div><h2>主题与配色</h2><p>即时预览 · 保存后重启仍保留</p></div><Button className="appearance-close" aria-label="关闭主题设置" onClick={close}>×</Button></div>
 <div className="appearance-scroll"><section className="appearance-section"><div className="section-title"><span>主题预设</span></div><div className="theme-preset-buttons">{THEME_PRESETS.map(p=><Button key={p.id} className={draft.preset===p.id?'selected':''} aria-pressed={draft.preset===p.id} onClick={()=>choose(p)}><span style={{background:p.colors.main,borderColor:p.colors.accent}} className="theme-swatch"/>{p.name}</Button>)}</div></section>
 <section className="appearance-section"><div className="section-title"><span>自定义颜色</span><small>所有界面共用同一套配色</small></div><div className="theme-color-controls">{Object.entries(fields).map(([key,label])=><label key={key}><span>{label}</span><input aria-label={label+'颜色'} type="color" value={draft.colors[key].slice(0,7)} onChange={e=>setDraft({...draft,preset:'custom',colors:{...draft.colors,[key]:normalizeHex(e.target.value)}})}/><code>{draft.colors[key]}</code></label>)}</div></section></div>
 <div className="dialog-actions appearance-actions"><span role="status">{status}</span><Button onClick={()=>{setDraft({...DEFAULT_THEME,colors:{...DEFAULT_THEME.colors}});setStatus('已预览默认配色，点击保存生效');}}>恢复默认</Button><Button onClick={()=>{setDraft(saved);setStatus('已撤销未保存的修改');}}>撤销修改</Button><Button className="primary" onClick={apply}>保存配色</Button></div>
 </div></div>;
}
