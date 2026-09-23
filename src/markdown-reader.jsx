import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownReader({ text }) {
  const [source, setSource] = useState(false);
  const [status, setStatus] = useState('');
  const content = useRef(null);
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setStatus('已复制，可粘贴到 AI Flow 提示词框'); }
    catch { setStatus('复制失败，请选中文字后手动复制'); }
  }
  function CodeBlock({ children }) {
    const code = children?.props?.children || '';
    return <div className="markdown-code"><button onClick={() => copy(String(code).replace(/\n$/, ''))}>复制这段提示词</button><pre>{children}</pre></div>;
  }
  return <section className="document-reader markdown-reader">
    <header><b>Markdown 文档</b><button onClick={() => setSource(!source)}>{source ? '预览' : '查看原文'}</button></header>
    <div className="markdown-actions">
      <button onClick={() => copy(text)}>复制全文到 AI Flow</button>
      <button disabled={source} onClick={() => { const buttons=content.current?.querySelectorAll('button') || []; buttons.forEach(b=>b.hidden=true); const text=content.current?.innerText || ''; buttons.forEach(b=>b.hidden=false); copy(text); }}>复制排版后的正文</button>
    </div>
    <p className="markdown-status" role="status">{status || '代码块可单独复制；复制全文保留原始内容和 @素材引用。'}</p>
    {source ? <pre>{text}</pre> : <div className="markdown-body" ref={content}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      pre: CodeBlock,
      a: ({ children }) => <span>{children}</span>,
      img: ({ alt }) => <span>{alt || '图片'}</span>,
    }}>{text}</ReactMarkdown></div>}
  </section>;
}
