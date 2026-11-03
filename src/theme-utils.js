export const THEME_STORAGE_KEY='nest-theme-settings-v2';

export const THEME_PRESETS=[
  {id:'mineradio-glass',name:'Mineradio 深色玻璃',mode:'dark',colors:{main:'#0B0E0F',sidebar:'#111718',card:'#19201F',overlay:'#121817',accent:'#00F5D4',text:'#EAF4F1',muted:'#A0B0AC',border:'#2B3936',hover:'#222C2A',selected:'#173A34'}},
  {id:'eagle-graphite',name:'Eagle 石墨灰',colors:{main:'#393A3D',sidebar:'#3D3E42',card:'#424347',overlay:'#343539',accent:'#2F8CFF',text:'#F1F1F1',muted:'#A3A4A7',border:'#4B4C50',hover:'#48494D',selected:'#505156'}},
];
THEME_PRESETS.push(
 {id:'midnight',name:'午夜蓝',mode:'dark',colors:{main:'#171D29',sidebar:'#202838',card:'#293346',overlay:'#151B26',accent:'#6DA9FF',text:'#F0F4FA',muted:'#A9B5C8',border:'#465369',hover:'#35425A',selected:'#3C5070'}},
 {id:'paper-light',name:'纸白',mode:'light',colors:{main:'#F5F6F8',sidebar:'#E9ECF1',card:'#FFFFFF',overlay:'#F0F2F6',accent:'#2563EB',text:'#111827',muted:'#374151',border:'#B8C0CC',hover:'#E0E6F0',selected:'#D4E1FB'}},
 {id:'soft-orange',name:'柔光橙（浅色卡片）',mode:'light',colors:{main:'#F2F3F7',sidebar:'#FFFFFF',card:'#FFFFFF',overlay:'#F6F7FB',accent:'#FF8A4C',text:'#1F2333',muted:'#8A90A3',border:'#E3E6EE',hover:'#F1F3F8',selected:'#FFEBDD'}},
 {id:'graphite-violet',name:'石墨紫（简洁专业）',mode:'dark',colors:{main:'#121214',sidebar:'#17171A',card:'#1C1C20',overlay:'#1A1A1E',accent:'#8B7CF6',text:'#ECECEF',muted:'#9A9AA3',border:'#34343C',hover:'#25252B',selected:'#2B2850'}}
);
export const THEME_EVENT='nest-theme-change';
export function normalizeTheme(value){
 const base=THEME_PRESETS.find(p=>p.id===value?.preset)||THEME_PRESETS[0];
 const colors=Object.fromEntries(Object.entries(base.colors).map(([key,fallback])=>[key,normalizeHex(value?.colors?.[key],fallback)]));
 return {mode:value?.mode==='light'?'light':'dark',preset:base.id===value?.preset?base.id:'custom',colors,schemaVersion:7};
}
export function saveTheme(value){const theme=normalizeTheme(value);globalThis.localStorage?.setItem(THEME_STORAGE_KEY,JSON.stringify(theme));return theme;}
export function previewTheme(value){const theme=normalizeTheme(value);globalThis.dispatchEvent?.(new CustomEvent(THEME_EVENT,{detail:theme}));return theme;}
// 新用户默认用“柔光橙”配色：浅色、橙色强调。新界面（soft-ui.css）对所有主题都生效，主题只决定颜色。
export const SOFT_UI_PRESET='soft-orange';
// 新界面按钮上的文字：强调色上尽量用白字（柔光风格），白字对比度不到 3 时换成深色字。
export function onAccentText(color){return contrastRatio(color,'#FFFFFF')>=3?'#FFFFFF':readableText(color)}
// 新界面的“选中”色：柔光橙配色用参考图里的浅蓝，其他主题直接用自己的强调色。
// 柔光橙的橙色和浅蓝按钮按参考图固定用白字（对比度略低于 3，是设计上的取舍）。
const SOFT_SELECT={color:'#6FA8F5',strong:'#3B78D8'};
export function softUiColors(theme){
  const c=theme.colors,orange=theme.preset===SOFT_UI_PRESET;
  const select=orange?SOFT_SELECT.color:c.accent;
  return {'--soft-accent-text':orange?'#FFFFFF':onAccentText(c.accent),'--soft-select':select,'--soft-select-text':orange?'#FFFFFF':onAccentText(select),'--soft-select-strong':orange?SOFT_SELECT.strong:`color-mix(in srgb,${select} 72%,${c.text})`};
}
export const DEFAULT_THEME={mode:'light',preset:SOFT_UI_PRESET,colors:{...THEME_PRESETS.find(p=>p.id===SOFT_UI_PRESET).colors},schemaVersion:7};

export function normalizeHex(value,fallback='#000000'){
  let text=String(value||'').trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(text))text=text.split('').map(x=>x+x).join('');
  if(!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text))return fallback.toUpperCase();
  return `#${text.toUpperCase()}`;
}
export function hexToRgba(value){const hex=normalizeHex(value).slice(1);return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:hex.length===8?parseInt(hex.slice(6,8),16)/255:1}}
export function rgbaToHex({r,g,b,a=1},alpha=false){const part=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');return `#${part(r)}${part(g)}${part(b)}${alpha?part(a*255):''}`.toUpperCase()}
export function rgbToHsv({r,g,b}){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=max===r?60*(((g-b)/d)%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);return {h:(h+360)%360,s:max?d/max:0,v:max}}
export function hsvToRgb({h,s,v,a=1}){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let q=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return {r:(q[0]+m)*255,g:(q[1]+m)*255,b:(q[2]+m)*255,a}}
export function rgbToHsl({r,g,b}){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?60*(((g-b)/d)%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4)}return {h:(h+360)%360,s:s*100,l:l*100}}
const luminance=value=>{const {r,g,b}=hexToRgba(value);return [r,g,b].map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)};
export function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function readableText(background){return contrastRatio(background,'#FFFFFF')>=contrastRatio(background,'#09111C')?'#FFFFFF':'#09111C'}
export function themeStyle(theme,resolvedMode='dark'){
  const c=theme.colors;
  return {'--accent':c.accent,'--accent-text':readableText(c.accent),'--bg-main':c.main,'--bg-sidebar':c.sidebar,'--titlebar-bg':c.sidebar,'--bg-card':c.card,'--bg-overlay':c.overlay,'--text-primary':c.text,'--text-secondary':c.muted,'--ui-border':`color-mix(in srgb,${c.border} 20%,color-mix(in srgb,${c.text} 9%,${c.main}))`,'--theme-border':c.border,'--hover-bg':c.hover,'--selected-bg':c.selected,
    // 团队素材库面板用的是这三个变量；以前没有定义，浅色主题下它会退回到写死的深色。
    '--bg-primary':c.card,'--bg-secondary':c.overlay,'--border-subtle':`color-mix(in srgb,${c.border} 60%,transparent)`,
    ...softUiColors(theme),
    colorScheme:resolvedMode};
}
export function loadTheme(){
  const theme={...DEFAULT_THEME,colors:{...DEFAULT_THEME.colors}};
  const storage=globalThis.localStorage;
  try{
    const saved=JSON.parse(storage?.getItem(THEME_STORAGE_KEY)||'null');
    if(saved?.schemaVersion===7){
      const normalized=normalizeTheme(saved);
      const legacyPaper=saved.preset==='paper-light'&&normalizeHex(saved.colors?.text)==='#202634'&&normalizeHex(saved.colors?.muted)==='#596577';
      if(legacyPaper){
        const paper=THEME_PRESETS.find(p=>p.id==='paper-light');
        normalized.colors={...normalized.colors,text:paper.colors.text,muted:paper.colors.muted,border:paper.colors.border};
        storage?.setItem(THEME_STORAGE_KEY,JSON.stringify(normalized));
      }
      return normalized;
    }
    if(saved?.schemaVersion===6){
      const normalized=normalizeTheme(saved);
      const legacyPaper=saved.preset==='paper-light'&&normalizeHex(saved.colors?.text)==='#202634'&&normalizeHex(saved.colors?.muted)==='#596577';
      if(legacyPaper){
        const paper=THEME_PRESETS.find(p=>p.id==='paper-light');
        normalized.colors={...normalized.colors,text:paper.colors.text,muted:paper.colors.muted,border:paper.colors.border};
      }
      const previousDefault={main:'#393A3D',sidebar:'#3D3E42',card:'#424347',overlay:'#343539',accent:'#2F8CFF',text:'#F1F1F1',muted:'#A3A4A7',border:'#4B4C50',hover:'#48494D',selected:'#505156'};
      const wasDefaultGraphite=saved.preset==='eagle-graphite'&&Object.entries(previousDefault).every(([key,value])=>normalizeHex(saved.colors?.[key],value)===value);
      const migrated=wasDefaultGraphite?{...DEFAULT_THEME,mode:normalized.mode,colors:{...DEFAULT_THEME.colors}}:normalized;
      storage?.setItem(THEME_STORAGE_KEY,JSON.stringify(migrated));
      return migrated;
    }
    storage?.setItem(THEME_STORAGE_KEY,JSON.stringify(theme));
    storage?.removeItem('nest-theme-color');
    storage?.removeItem('nest-recent-colors');
  }catch{}
  return theme;
}
