import React, {lazy, Suspense} from 'react';

const Assistant=lazy(()=>import('./ai-assistant.jsx').then(m=>({default:m.AIAssistant})));
const Settings=lazy(()=>import('./ai-settings.jsx').then(m=>({default:m.AISettings})));
const FlowImport=lazy(()=>import('./aiflow-import-dialog.jsx').then(m=>({default:m.AIFlowImportDialog})));
const Markdown=lazy(()=>import('../markdown-reader.jsx').then(m=>({default:m.MarkdownReader})));
const loading=<p role="status">正在打开…</p>;
export function AIAssistant(props){return <Suspense fallback={loading}><Assistant {...props}/></Suspense>;}
export function AISettings(props){return <Suspense fallback={loading}><Settings {...props}/></Suspense>;}
export function AIFlowImportDialog(props){return <Suspense fallback={loading}><FlowImport {...props}/></Suspense>;}
export function MarkdownReader(props){return <Suspense fallback={loading}><Markdown {...props}/></Suspense>;}
