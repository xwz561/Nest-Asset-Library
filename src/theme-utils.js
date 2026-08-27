export const THEME_STORAGE_KEY='nest-theme-settings-v2';

export const THEME_PRESETS=[
  {id:'deep-blue',name:'深海蓝',colors:{main:'#07101d',sidebar:'#091729',card:'#122238',overlay:'#102239',accent:'#2f7dff',text:'#dce7f7',muted:'#8298b3',border:'#29435f',hover:'#142b47',selected:'#17365a'}},
  {id:'polar-purple',name:'极夜紫',colors:{main:'#0d0b18',sidebar:'#131023',card:'#1b1730',overlay:'#211b38',accent:'#8b6cff',text:'#eeeaff',muted:'#a099bb',border:'#40375c',hover:'#292145',selected:'#352963'}},
  {id:'emerald',name:'翡翠青',colors:{main:'#071512',sidebar:'#0a1d19',card:'#102923',overlay:'#14322b',accent:'#26c99a',text:'#e0f7f0',muted:'#86aa9f',border:'#285548',hover:'#173a31',selected:'#1a4c3f'}},
  {id:'graphite',name:'石墨灰',colors:{main:'#111315',sidebar:'#171a1e',card:'#20242a',overlay:'#252a31',accent:'#8ea4be',text:'#edf1f5',muted:'#949da8',border:'#3b424b',hover:'#2a3037',selected:'#35404c'}},
  {id:'twilight-orange',name:'暮光橙',colors:{main:'#15100d',sidebar:'#1d1511',card:'#2a1d17',overlay:'#34231b',accent:'#ff8a45',text:'#fff0e8',muted:'#b9a092',border:'#5b3b2d',hover:'#3a261d',selected:'#55311f'}},
  {id:'sakura',name:'樱粉',colors:{main:'#160d14',sidebar:'#20121d',card:'#2c1928',overlay:'#362031',accent:'#f47cab',text:'#fff0f7',muted:'#b99aaa',border:'#5c3850',hover:'#3d2337',selected:'#592a47'}}
];

export const DEFAULT_THEME={mode:'dark',preset:'deep-blue',colors:{...THEME_PRESETS[0].colors}};
export const THEME_FIELDS=[['main','主背景'],['sidebar','侧边栏背景'],['card','卡片背景'],['overlay','浮层 / 弹窗'],['accent','强调色'],['text','主文字'],['muted','次要文字'],['border','边框'],['hover','Hover 背景'],['selected','Selected 背景']];

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
  return {'--accent':c.accent,'--accent-text':readableText(c.accent),'--bg-main':c.main,'--bg-sidebar':c.sidebar,'--bg-card':c.card,'--bg-overlay':c.overlay,'--text-primary':c.text,'--text-secondary':c.muted,'--ui-border':c.border,'--hover-bg':c.hover,'--selected-bg':c.selected,colorScheme:resolvedMode};
}
export function loadTheme(){try{const saved=JSON.parse(localStorage.getItem(THEME_STORAGE_KEY));if(saved?.colors)return {...DEFAULT_THEME,...saved,colors:{...DEFAULT_THEME.colors,...saved.colors}}}catch{}const accent=localStorage.getItem('nest-theme-color');return accent?{...DEFAULT_THEME,preset:'custom',colors:{...DEFAULT_THEME.colors,accent:normalizeHex(accent)}}:DEFAULT_THEME}
