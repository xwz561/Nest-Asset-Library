import React, { useEffect, useRef, useState } from "react";
import { Button } from "../ready-ui.jsx";
import { CircleHelp, X } from "lucide-react";
import usageDemoVideo from "../assets/usage-demo.mp4";
import { USAGE_DEMO_CHAPTERS } from "../tutorial-steps.js";

// 顶栏「演示方法」打开的窗口：左边播放操作演示视频（在窗口里播，不全屏），
// 右边按章节列出新手教程的每一步说明，点哪章跳到哪，播到哪章就亮哪章。
// 视频由 scripts/usage-demo 录制（npm run render:usage-demo），章节时间和说明都来自 tutorial-steps.js。

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function chapterIndexAt(seconds) {
  let index = 0;
  USAGE_DEMO_CHAPTERS.forEach((chapter, i) => { if (seconds >= chapter.start) index = i; });
  return index;
}

export function UsageDemoDialog({ close, openTour }) {
  const videoRef = useRef(null);
  const listRef = useRef(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 播到的章节保持在列表可见范围里（只滚列表自己，不动页面）
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[active];
    if (!list || !item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 12), behavior: "smooth" });
    }
  }, [active]);

  const seek = (chapter, index) => {
    const video = videoRef.current;
    setActive(index);
    if (!video) return;
    video.currentTime = chapter.start + 0.05;
    void video.play().catch(() => {});
  };

  return (
    <div className="modal-backdrop usage-demo-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="app-dialog usage-demo-dialog" role="dialog" aria-modal="true" aria-labelledby="usage-demo-title">
        <div className="usage-demo-head">
          <div>
            <h2 id="usage-demo-title">演示方法</h2>
            <p>跟着视频看一遍素材库怎么用；右边是新手教程的每一步，点一下跳到对应位置。</p>
          </div>
          <Button className="usage-demo-close" appearance="subtle" aria-label="关闭演示" title="关闭（Esc）" onClick={close}><X size={17} /></Button>
        </div>
        <div className="usage-demo-body">
          <div className="usage-demo-player">
            {failed
              ? <div className="usage-demo-failed">演示视频没能播放，可以先看右边的文字说明。</div>
              : <video
                  ref={videoRef}
                  src={usageDemoVideo}
                  controls
                  autoPlay
                  playsInline
                  disablePictureInPicture
                  controlsList="nofullscreen nodownload noremoteplayback noplaybackrate"
                  onDoubleClick={(event) => event.preventDefault()}
                  onTimeUpdate={(event) => setActive(chapterIndexAt(event.currentTarget.currentTime))}
                  onError={() => setFailed(true)}
                />}
          </div>
          <aside className="usage-demo-chapters" aria-label="新手教程步骤">
            <ol ref={listRef}>
              {USAGE_DEMO_CHAPTERS.map((chapter, index) => (
                <li key={chapter.id}>
                  <button type="button" className={index === active ? "on" : ""} aria-current={index === active ? "step" : undefined} onClick={() => seek(chapter, index)}>
                    <span className="usage-demo-num">{String(index).padStart(2, "0")}</span>
                    <span className="usage-demo-text">
                      <strong>{chapter.title}<time>{clock(chapter.start)}</time></strong>
                      <small>{chapter.body}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <Button className="usage-demo-tour" onClick={openTour}><CircleHelp size={14} /><span>在界面上走一遍新手教程</span></Button>
          </aside>
        </div>
      </section>
    </div>
  );
}
