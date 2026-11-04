import React, {useEffect,useState} from 'react';
import {loadTheme,THEME_EVENT,themeStyle} from './theme-utils.js';
import {FluentProvider, webDarkTheme, webLightTheme, Button as FluentButton} from '@fluentui/react-components';
const graphite = {...webDarkTheme, colorNeutralBackground1:'#393a3d', colorNeutralBackground2:'#333438',
 colorNeutralBackground3:'#303135', colorNeutralForeground1:'#ededee', colorNeutralForeground2:'#b9bbc1',
 colorNeutralStroke1:'#515359', colorBrandBackground:'#357bd3', colorBrandForeground1:'#8abbff',
 fontFamilyBase:'"Source Han Sans SC", "Segoe UI", "Microsoft YaHei", sans-serif', fontSizeBase300:'12px'};
// targetDocument：疯狂模式下卡片渲染进桌面小窗口时，主题和按钮样式要写进那个窗口的页面
export function ReadyUI({children, targetDocument}) {
 const [theme,setTheme]=useState(loadTheme);
 useEffect(()=>{const change=e=>setTheme(e.detail);window.addEventListener(THEME_EVENT,change);return()=>window.removeEventListener(THEME_EVENT,change);},[]);
 const c=theme.colors;
 const fluent={...(theme.mode==='light'?webLightTheme:graphite),fontFamilyBase:graphite.fontFamilyBase,fontSizeBase300:graphite.fontSizeBase300,colorNeutralBackground1:c.main,colorNeutralBackground2:c.sidebar,colorNeutralBackground3:c.overlay,colorNeutralBackground1Hover:c.hover,colorNeutralForeground1:c.text,colorNeutralForeground2:c.muted,colorNeutralForeground3:c.muted,colorNeutralStroke1:c.border,colorNeutralStroke2:c.border,colorBrandBackground:c.accent,colorBrandForeground1:c.accent,colorNeutralBackground1Selected:c.selected};
 return <FluentProvider theme={fluent} targetDocument={targetDocument} style={{display:'contents',...themeStyle(theme,theme.mode)}}>{children}</FluentProvider>;
}
export const Button = React.forwardRef(function Button(props, ref) {
 return <FluentButton ref={ref} appearance="subtle" size="small" aria-label={props['aria-label'] || (typeof props.title === 'string' ? props.title : undefined)} {...props}/>;
});
