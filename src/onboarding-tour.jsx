import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  {
    target: "[data-tour='import']",
    title: "导入素材",
    body: "从这里添加图片、视频、音频和文档。导入文件夹可以保留素材的目录结构。",
  },
  {
    target: "[data-tour='friend-tools']",
    title: "打开友商工具集",
    body: "点击顶部这个按钮打开友商工具集，再点击工具卡片即可启动对应的小工具。",
  },
  {
    target: "[data-tour='lan-signals']",
    title: "局域网信号与表情",
    body: "同一局域网的电脑打开素材库后会自动加入房间。按住 Alt 或 Ctrl 并拖动鼠标，可在桌面任意软件上发送信号或表情。",
  },
  {
    target: "[data-tour='categories']",
    title: "按类型浏览",
    body: "用左侧分类快速查看全部素材、收藏、最近添加的内容，或只看图片、视频、音频和剧本。",
  },
  {
    target: "[data-tour='folders']",
    title: "用文件夹整理",
    body: "在这里查看和切换文件夹，也可以新建文件夹；素材卡片可以拖到目标文件夹里。",
  },
  {
    target: "[data-tour='search']",
    title: "搜索素材",
    body: "输入名称或关键词快速查找素材。搜索会和当前分类、文件夹一起生效。",
  },
  {
    target: "[data-tour='organize']",
    title: "整理显示方式",
    body: "在右上方可以全选、调整排序、筛选类型，并切换标准、紧凑或列表视图。",
  },
  {
    target: "[data-tour='assets']",
    title: "打开和管理素材",
    body: "单击素材查看详情，双击打开预览；可以收藏、添加标签和备注，也能拖动素材进行整理。",
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function OnboardingTour({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [geometry, setGeometry] = useState(null);
  const nextRef = useRef(null);
  const step = STEPS[stepIndex];

  useLayoutEffect(() => {
    let raf = 0;
    const update = () => {
      const target = document.querySelector(step.target);
      if (!target) {
        setGeometry({ rect: null, left: Math.max(16, (window.innerWidth - 360) / 2), top: Math.max(16, (window.innerHeight - 210) / 2) });
        return;
      }
      raf = window.requestAnimationFrame(() => {
        const r = target.getBoundingClientRect();
        const rect = {
          top: Math.max(4, r.top - 5),
          left: Math.max(4, r.left - 5),
          width: Math.min(window.innerWidth - 8, r.width + 10),
          height: Math.min(window.innerHeight - 8, r.height + 10),
        };
        const popoverWidth = Math.min(360, window.innerWidth - 32);
        const popoverHeight = 226;
        const gap = 16;
        let left = r.right + gap;
        if (left + popoverWidth > window.innerWidth - 16) left = r.left - popoverWidth - gap;
        if (left < 16) left = (window.innerWidth - popoverWidth) / 2;
        let top = r.top;
        if (top + popoverHeight > window.innerHeight - 16) top = window.innerHeight - popoverHeight - 16;
        setGeometry({ rect, left: clamp(left, 16, window.innerWidth - popoverWidth - 16), top: clamp(top, 16, window.innerHeight - popoverHeight - 16) });
      });
    };
    document.querySelector(step.target)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    nextRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, stepIndex]);

  const content = (
    <div className="onboarding-tour" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-body">
      <button type="button" className="onboarding-tour-backdrop" aria-label="跳过新手教程" onClick={onClose} />
      {geometry?.rect && (
        <div
          className="onboarding-tour-spotlight"
          aria-hidden="true"
          style={{ top: geometry.rect.top, left: geometry.rect.left, width: geometry.rect.width, height: geometry.rect.height }}
        />
      )}
      <section className="onboarding-tour-card" style={{ left: geometry?.left ?? 16, top: geometry?.top ?? 16 }}>
        <header className="onboarding-tour-head">
          <span>新手教程</span>
          <button type="button" aria-label="关闭新手教程" title="按 Esc 关闭" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="onboarding-tour-progress" aria-label={`第 ${stepIndex + 1} 步，共 ${STEPS.length} 步`}>
          <i style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>
        <p className="onboarding-tour-count">第 {stepIndex + 1} 步 / 共 {STEPS.length} 步</p>
        <h2 id="onboarding-title">{step.title}</h2>
        <p id="onboarding-body">{step.body}</p>
        <footer>
          <button type="button" className="onboarding-tour-skip" onClick={onClose}>跳过</button>
          <div>
            <button type="button" className="onboarding-tour-prev" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
              <ArrowLeft size={14} /> 上一步
            </button>
            <button ref={nextRef} type="button" className="onboarding-tour-next" onClick={() => stepIndex === STEPS.length - 1 ? onClose() : setStepIndex((current) => current + 1)}>
              {stepIndex === STEPS.length - 1 ? "完成" : <>下一步 <ArrowRight size={14} /></>}
            </button>
          </div>
        </footer>
        <small className="onboarding-tour-esc">按 Esc 可随时关闭</small>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}

