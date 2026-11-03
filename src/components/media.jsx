import { useState, useEffect, useRef } from "react";
import { Button } from "../ready-ui.jsx";
import { MarkdownReader } from "./lazy-panels.jsx";
import { FileText, Star, X, Palette, Folder, Tag, Plus, Info, MapPin, ChevronDown, ChevronUp, Download, Search, MoreHorizontal, Trash2, Check, Maximize2, RotateCw, Pencil, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { describeFile } from "../file-manager-adapter.cjs";
import { assetFormat, assetExtension, fmt, isTextEditableAsset, isExternalEditableAsset } from "../lib/app-config.js";
import { waveformCache } from "../waveform-cache.js";
import { audioPreviewManager } from "../audio-preview-manager.js";
import { subscribeAssetAudio } from "../audio-asset-subscription.js";
import { ReadyAudioPreview, ReadyVideoPreview } from "../ready-media.jsx";

export function AssetPalette({ asset }) {
  const [colors, setColors] = useState([
    "#1D4ED8",
    "#2F7DFF",
    "#60A5FA",
    "#0F1B2D",
    "#64748B",
    "#DCE9FF",
  ]);
  useEffect(() => {
    if (!asset?.type?.startsWith("image") || !asset.url) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 48, 48);
        const data = ctx.getImageData(0, 0, 48, 48).data,
          counts = new Map();
        for (let i = 0; i < data.length; i += 20) {
          if (data[i + 3] < 180) continue;
          const rgb = [data[i], data[i + 1], data[i + 2]].map((v) =>
            Math.min(255, Math.round(v / 32) * 32),
          );
          const key = rgb.join(",");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const palette = [...counts]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([key]) =>
              "#" +
              key
                .split(",")
                .map((v) => Number(v).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase(),
          )
          .filter(
            (value, index, array) =>
              array.findIndex((other) => {
                const a = parseInt(value.slice(1), 16),
                  b = parseInt(other.slice(1), 16);
                return (
                  Math.abs((a >> 16) - (b >> 16)) +
                    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
                    Math.abs((a & 255) - (b & 255)) <
                  70
                );
              }) === index,
          )
          .slice(0, 6);
        if (!cancelled && palette.length) setColors(palette);
      } catch {}
    };
    image.src = asset.url;
    return () => {
      cancelled = true;
    };
  }, [asset?.id, asset?.url]);
  return (
    <div className="asset-palette">
      {colors.map((color) => (
        <Button
          key={color}
          title={`复制 ${color}`}
          style={{ background: color }}
          onClick={() => navigator.clipboard?.writeText(color)}
        />
      ))}
    </div>
  );
}

export function DocumentReader({ asset }) {
  const textRef = useRef(null);
  const scenes = asset.documentStructure?.scenes || [];
  const lines = (asset.documentText || "").split("\n");
  const goToScene = (scene) => {
    const reader = textRef.current;
    const target = reader?.querySelector(`[data-line="${scene.line}"]`);
    if (reader && target) reader.scrollTo({ top: Math.max(0, target.offsetTop - reader.offsetTop - 8), behavior: "smooth" });
  };
  if (asset.type === "text/markdown" || /^(MD|MARKDOWN)$/i.test(asset.documentFormat || "")) return <MarkdownReader key={asset.id} text={asset.documentText || ""} />;
  return <section className="document-reader">
    <header><FileText size={16}/><b>剧本文本</b><span>{(asset.documentText || "").length.toLocaleString()} 字符</span></header>
    {scenes.length > 0 && <nav className="fountain-scenes" aria-label="场景导航">
      <strong>{scenes.length} 个场景</strong>
      {scenes.map((scene, index) => <Button key={`${scene.line}-${index}`} onClick={() => goToScene(scene)} title={`${scene.characters.join("、") || "无角色"} · ${scene.dialogueCount} 段对白`}>
        <span>{index + 1}</span>{scene.title}
      </Button>)}
    </nav>}
    {asset.documentText ? <pre ref={textRef}>{lines.map((line, index) => <span key={index} data-line={index + 1} className={scenes.some(scene => scene.line === index + 1) ? "fountain-scene-line" : ""}>{line || " "}{index < lines.length - 1 ? "\n" : ""}</span>)}</pre> : <div className="document-empty">未提取到可搜索文本，可点击“打开”使用系统阅读器查看原文件。</div>}
  </section>;
}

export function Detail({
  asset,
  folders = [],
  close,
  patch,
  del,
  open,
  reveal,
  confirmAction,
  canEdit,
  openMore,
}) {
  const [tag, setTag] = useState("");
  const fileInfo = describeFile(asset);
  const isDocument = asset.type?.startsWith("text") || asset.type === "application/pdf" || asset.documentFormat === "DOCX";
  const add = () => {
    if (tag.trim()) {
      patch(asset.id, {
        tags: [...new Set([...(asset.tags || []), tag.trim()])],
      });
      setTag("");
    }
  };
  const folderName =
    folders.find((folder) => folder.id === asset.folderId)?.name || "未分类";
  return (
    <aside className="detail">
      <div className="detail-head">
        <strong>{asset.name}</strong>
        <div>
          <Button
            title="收藏"
            onClick={() => patch(asset.id, { favorite: !asset.favorite })}
          >
            <Star size={17} fill={asset.favorite ? "currentColor" : "none"} />
          </Button>
          <Button aria-label="关闭详情" title="关闭 (Esc)" onClick={close}>
            <X size={18} />
          </Button>
        </div>
      </div>
      <div className="detail-preview">
        <Media asset={asset} preview />
      </div>
      <div className="detail-body">
        <input
          className="name-input"
          value={asset.name}
          onChange={(e) => patch(asset.id, { name: e.target.value })}
        />
        <div className="rating" aria-label="评分">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              className={n <= (asset.rating || 0) ? "rated" : ""}
              onClick={() =>
                patch(asset.id, { rating: n === asset.rating ? 0 : n })
              }
            >
              ★
            </Button>
          ))}
        </div>
        {isDocument && <DocumentReader asset={asset}/>} 
        {!isDocument && <><label><Palette size={15} /> 主色板</label><AssetPalette asset={asset} /></>}
        <div className="facts">
          <div>
            <span>格式</span>
            <b>{assetFormat(asset) || "—"}</b>
          </div>
          <div>
            <span>尺寸</span>
            <b>
              {asset.width || "—"} × {asset.height || "—"}
            </b>
          </div>
          <div>
            <span>大小</span>
            <b>{fmt(asset.size)}</b>
          </div>
        </div>
        <label>
          <Folder size={15} /> 所在文件夹
        </label>
        <select
          className="folder-select"
          value={asset.folderId || ""}
          onChange={(e) =>
            patch(asset.id, { folderId: e.target.value || null })
          }
        >
          <option value="">未分类</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {"— ".repeat(f.depth)}
              {f.name}
            </option>
          ))}
        </select>
        <label>
          <Tag size={15} /> 标签
        </label>
        {fileInfo.filenameTags.some(t => !(asset.tags || []).includes(t)) && <Button disabled={!canEdit} onClick={() => patch(asset.id, {tags: [...new Set([...(asset.tags || []), ...fileInfo.filenameTags])]})}>读取文件名标签</Button>}
        <div className="tags">
          {(asset.tags || []).map((t) => (
            <Button
              key={t}
              onClick={() =>
                patch(asset.id, { tags: asset.tags.filter((x) => x !== t) })
              }
            >
              {t}
              <X size={12} />
            </Button>
          ))}
        </div>
        <div className="add-tag">
          <input
            placeholder="添加标签"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button onClick={add}>
            <Plus size={16} />
          </Button>
        </div>
        <label>
          <Info size={15} /> 备注
        </label>
        <textarea
          placeholder="写下关于这个素材的想法…"
          value={asset.note || ""}
          onChange={(e) => patch(asset.id, { note: e.target.value })}
        />
        <label>
          <MapPin size={15} /> 使用位置
        </label>
        <Button className="usage-row" onClick={() => reveal(asset.id)}>
          <span>
            <b>{folderName}</b>
            <small>素材库索引 · 1 个位置</small>
          </span>
          <b>›</b>
        </Button>
        <div className="detail-actions">
          <Button className="open" onClick={() => open(asset.id)}>
            打开 <ChevronDown size={15} />
          </Button>
          <Button title="定位文件" onClick={() => reveal(asset.id)}>
            <Download size={16} />
          </Button>
          <Button title="更多操作" onClick={(e) => openMore?.(e, asset)}>
            <MoreHorizontal size={17} />
          </Button>
        </div>
        <Button
          className="delete"
          onClick={async () => {
            if (
              await confirmAction(
                "删除这个素材？",
                "原文件会移到系统回收站或废纸篓。",
              )
            )
              del(asset.id);
          }}
        >
          <Trash2 size={16} /> 删除素材
        </Button>
      </div>
    </aside>
  );
}

export function TextDocumentEditor({ asset, canEdit, save }) {
  const [value, setValue] = useState(asset.documentText || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const dirty = value !== (asset.documentText || "");
  useEffect(() => {
    setValue(asset.documentText || "");
    setStatus("");
  }, [asset.id]);
  const commit = async () => {
    if (!canEdit || saving || !dirty) return;
    setSaving(true);
    setStatus("正在保存…");
    const result = await save(asset.id, value);
    setSaving(false);
    setStatus(result?.error || "已保存");
  };
  return (
    <section className="text-document-editor" aria-label={`编辑 ${asset.name}`}>
      <header>
        <span><FileText size={16} /><b>{asset.name}</b></span>
        <small>{status || (dirty ? "有未保存的修改" : `${value.length.toLocaleString()} 字符`)}</small>
        <Button disabled={!canEdit || saving || !dirty} onClick={commit} title="保存 (Ctrl+S)">
          <Check size={15} /> {saving ? "保存中" : "保存"}
        </Button>
      </header>
      <textarea
        autoFocus
        readOnly={!canEdit}
        spellCheck="false"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            void commit();
          }
        }}
      />
    </section>
  );
}

function ScriptSourceReader({ asset, exportAsset }) {
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const listRef = useRef(null);
  const lines = (asset.documentText || "").split("\n");
  const matches = [];
  if (query.trim()) {
    const needle = query.trim().toLocaleLowerCase();
    lines.forEach((line, index) => {
      let from = 0;
      const lower = line.toLocaleLowerCase();
      while ((from = lower.indexOf(needle, from)) !== -1) {
        matches.push({ line: index + 1, start: from });
        from += needle.length;
      }
    });
  }
  const matchIndexByPosition = new Map(matches.map((match, index) => [`${match.line}:${match.start}`, index]));
  useEffect(() => { setActiveMatch(0); }, [query, asset.id]);
  useEffect(() => {
    const match = matches[activeMatch];
    if (!match) return;
    listRef.current?.querySelector(`[data-source-line="${match.line}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, query, asset.id]);
  const moveMatch = (direction) => {
    if (!matches.length) return;
    setActiveMatch((current) => (current + direction + matches.length) % matches.length);
  };
  const highlightLine = (line, lineNumber) => {
    if (!query.trim()) return line || " ";
    const needle = query.trim().toLocaleLowerCase();
    const lower = line.toLocaleLowerCase();
    const pieces = [];
    let cursor = 0;
    while (cursor < line.length) {
      const index = lower.indexOf(needle, cursor);
      if (index < 0) { pieces.push(line.slice(cursor)); break; }
      if (index > cursor) pieces.push(line.slice(cursor, index));
      const matchIndex = matchIndexByPosition.get(`${lineNumber}:${index}`) ?? -1;
      pieces.push(<mark className={matchIndex === activeMatch ? "active" : ""} key={`${index}-${matchIndex}`}>{line.slice(index, index + needle.length)}</mark>);
      cursor = index + needle.length;
    }
    return pieces.length ? pieces : " ";
  };
  const format = assetFormat(asset) || asset.documentFormat || "文档";
  return <section className="script-source-reader" aria-label={`剧本原文：${asset.name}`}>
    <header className="script-source-toolbar">
      <div className="script-source-title"><b>剧本原文</b><span>{format} · {lines.length.toLocaleString()} 行</span></div>
      <label className="script-source-search"><Search size={15}/><input aria-label="搜索剧本" placeholder="搜索集数、场次、台词…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); } }}/></label>
      <span className="script-source-count">{query ? `${matches.length ? activeMatch + 1 : 0} / ${matches.length}` : ""}</span>
      <Button disabled={!matches.length} title="上一个匹配项" onClick={() => moveMatch(-1)}><ChevronUp size={16}/></Button>
      <Button disabled={!matches.length} title="下一个匹配项" onClick={() => moveMatch(1)}><ChevronDown size={16}/></Button>
      <Button title="下载原文件" onClick={() => exportAsset?.(asset.id)}><Download size={15}/> 下载</Button>
    </header>
    {asset.documentText ? <div className="script-source-lines" ref={listRef}>
      {lines.map((line, index) => <div className="script-source-line" data-source-line={index + 1} key={index}>
        <span className="script-source-gutter">{index + 1}</span><span className="script-source-text">{highlightLine(line, index + 1)}</span>
      </div>)}
    </div> : <div className="document-empty">没有提取到可搜索的文本，仍可下载原文件后使用 Word 或 PDF 阅读器查看。</div>}
  </section>;
}

export function Preview({
  asset,
  zoom,
  rotation,
  checker,
  setZoom,
  setRotation,
  setChecker,
  reset,
  close,
  previous,
  next,
  canEdit,
  saveText,
  openExternal,
  exportAsset,
}) {
  const image = asset.type?.startsWith("image");
  const textEditable = isTextEditableAsset(asset);
  const documentLike = textEditable || isExternalEditableAsset(asset) || asset.type === "application/pdf";
  const scriptSource = asset.type === "application/pdf" || ["pdf", "doc", "docx"].includes(assetExtension(asset));
  const overlayRef = useRef(null);
  const panDrag = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const changeZoom = (delta) => setZoom((value) => {
    const next = Math.min(4, Math.max(0.25, value + delta));
    if (next <= 1) setPan({ x: 0, y: 0 });
    return next;
  });
  const resetImageView = () => {
    setPan({ x: 0, y: 0 });
    panDrag.current = null;
    setPanning(false);
    reset();
  };
  const startImagePan = (event) => {
    if (event.button !== 1 || !image || zoom <= 1) return;
    event.preventDefault();
    panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  };
  const moveImagePan = (event) => {
    const drag = panDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
  };
  const stopImagePan = (event) => {
    const drag = panDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panDrag.current = null;
    setPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  useEffect(() => { setPan({ x: 0, y: 0 }); }, [asset.id]);
  useEffect(() => { if (zoom <= 1) setPan({ x: 0, y: 0 }); }, [zoom]);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!image) return;
      e.preventDefault();
      changeZoom(e.deltaY < 0 ? 0.25 : -0.25);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image]);
  return (
    <div className="preview-overlay" ref={overlayRef}>
      <div className="preview-top">
        <strong>{asset.name}</strong>
        {image && (
          <>
            <Button title="适应窗口" onClick={resetImageView}>
              <Maximize2 size={17} />
              适应
            </Button>
            <Button
              title="向右旋转 90°"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw size={17} />
              旋转
            </Button>
            <Button
              className={checker ? "on" : ""}
              title="透明背景"
              onClick={() => setChecker((v) => !v)}
            >
              <i className="checker-icon" />
              透明背景
            </Button>
            <Button
              title="缩小"
              onClick={() => changeZoom(-0.25)}
            >
              −
            </Button>
            <b>{Math.round(zoom * 100)}%</b>
            <Button
              title="放大"
              onClick={() => changeZoom(0.25)}
            >
              ＋
            </Button>
          </>
        )}
        {documentLike && (
          <Button title={textEditable ? "使用系统默认应用打开" : "打开原文件进行编辑"} onClick={openExternal}>
            <Pencil size={16} />
            {textEditable ? "外部编辑" : "编辑原文件"}
          </Button>
        )}
        <Button
          className="preview-close"
          title="关闭预览 (Esc)"
          aria-label="关闭预览"
          onClick={close}
        >
          <X size={18} />
          <span>关闭预览</span>
        </Button>
      </div>
      <Button
        className="preview-arrow left"
        title="上一个 (←)"
        onClick={previous}
      >
        ‹
      </Button>
      <div
        className={`preview-stage ${checker ? "checker" : ""} ${image && zoom > 1 ? "is-pannable" : ""} ${panning ? "is-panning" : ""}`}
        onPointerDown={startImagePan}
        onPointerMove={moveImagePan}
        onPointerUp={stopImagePan}
        onPointerCancel={stopImagePan}
        onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}
        onDoubleClick={resetImageView}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {scriptSource ? (
          <ScriptSourceReader asset={asset} exportAsset={exportAsset} />
        ) : textEditable ? (
          <TextDocumentEditor asset={asset} canEdit={canEdit} save={saveText} />
        ) : (
          <Media
            asset={asset}
            preview
            persistControls
            style={
              image
                ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)` }
                : undefined
            }
          />
        )}
      </div>
      <Button className="preview-arrow right" title="下一个 (→)" onClick={next}>
        ›
      </Button>
    </div>
  );
}

export const durationText = (value) => {
  if (!Number.isFinite(value)) return "";
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function AudioWaveform({ src, large = false }) {
  const canvasRef = useRef(null),
    [visible, setVisible] = useState(large);
  useEffect(() => {
    if (large || !canvasRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "260px 0px" },
    );
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [large]);
  useEffect(() => {
    if (!src || !visible) return;
    const controller = new AbortController();
    let context;
    const draw = async () => {
      try {
        const columns = large ? 180 : 88;
        const cacheKey = JSON.stringify([src, columns, "rgb"]);
        let peaks = waveformCache.get(cacheKey);
        if (!peaks) {
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) throw new Error(`Audio fetch: ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (controller.signal.aborted) return;
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          context = new AudioCtx();
          const buffer = await context.decodeAudioData(bytes);
          if (controller.signal.aborted) return;
          const samples = buffer.getChannelData(0),
            sampleRate = buffer.sampleRate,
            lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate),
            midAlpha = 1 - Math.exp((-2 * Math.PI * 2400) / sampleRate);
          peaks = {
            low: new Float32Array(columns),
            mid: new Float32Array(columns),
            high: new Float32Array(columns),
          };
          let lowState = 0,
            midState = 0;
          for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
            const sample = samples[sampleIndex];
            lowState += lowAlpha * (sample - lowState);
            midState += midAlpha * (sample - midState);
            const column = Math.min(
              columns - 1,
              Math.floor((sampleIndex * columns) / samples.length),
            );
            peaks.low[column] = Math.max(peaks.low[column], Math.abs(lowState));
            peaks.mid[column] = Math.max(
              peaks.mid[column],
              Math.abs(midState - lowState),
            );
            peaks.high[column] = Math.max(
              peaks.high[column],
              Math.abs(sample - midState),
            );
          }
          waveformCache.set(cacheKey, peaks);
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = large ? 720 : 300,
          height = large ? 150 : 92,
          dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        const barWidth = width / columns;
        for (let i = 0; i < columns; i++) {
          const low = peaks.low[i],
            mid = peaks.mid[i],
            high = peaks.high[i],
            peak = Math.max(low, mid, high, 0.001),
            h = Math.max(2, peak * (height - 8));
          ctx.fillStyle = `rgb(${Math.round((low / peak) * 255)},${Math.round((mid / peak) * 255)},${Math.round((high / peak) * 255)})`;
          ctx.fillRect(
            i * barWidth,
            (height - h) / 2,
            Math.max(1, barWidth - 1),
            h,
          );
        }
      } catch (error) {
        if (error.name !== "AbortError")
          console.warn("Audio waveform:", error.message);
      } finally {
        context?.close?.();
      }
    };
    draw();
    return () => {
      controller.abort();
      context?.close?.();
    };
  }, [src, large, visible]);
  return (
    <canvas ref={canvasRef} className="audio-waveform" aria-hidden="true" />
  );
}

export function useAudioPreviewState(assetId) {
  const [state, setState] = useState(audioPreviewManager.getState());
  useEffect(
    () => subscribeAssetAudio(audioPreviewManager, assetId, (next) => setState({ ...next })),
    [assetId],
  );
  return state;
}

export function AudioMedia({ asset, preview = false, style }) {
  const state = useAudioPreviewState(asset.id),
    active = state.id === asset.id,
    playing = active && state.playing,
    current = active ? state.currentTime : 0,
    duration = active ? state.duration : 0,
    progress = duration ? current / duration : 0;
  const format = (
    asset.type?.split("/")[1] ||
    asset.name.split(".").pop() ||
    "audio"
  )
    .replace("mpeg", "mp3")
    .toUpperCase();
  const bpm = asset.name.match(
    /(?:^|[\s_\-])BPM[\s_\-:]*(\d{2,3})(?:\D|$)/i,
  )?.[1];
  const scrubbingPointer = useRef(null),
    progressRef = useRef(null),
    guideRef = useRef(null);
  // 播放进度条只由这里写入（不走 React 的 style），播放时每帧读取真实播放位置，
  // 这样进度线是连续平滑移动，而不是随 timeupdate 一格一格地跳。
  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return;
    // 进度为 0 时整条隐藏，否则宽度 0 的进度条右边框会在卡片左边缘露出一条细线
    bar.style.visibility = playing || progress > 0 ? "visible" : "hidden";
    if (!playing) {
      bar.style.width = `${progress * 100}%`;
      return;
    }
    let frame = 0;
    const tick = () => {
      const player = audioPreviewManager.getAudio();
      if (player && Number.isFinite(player.duration) && player.duration > 0)
        bar.style.width = `${Math.min(1, (player.currentTime || 0) / player.duration) * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [playing, progress]);
  useEffect(() => {
    if (preview) audioPreviewManager.openFull(asset);
    return () => {
      if (preview && audioPreviewManager.getState().id === asset.id)
        audioPreviewManager.stop();
    };
  }, [preview, asset.id, asset.url]);
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(),
      ratio = (e.clientX - rect.left) / rect.width;
    if (preview) audioPreviewManager.seek(asset, ratio);
  };
  const hoverFromPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (guideRef.current) {
      guideRef.current.style.transform = `translateX(${ratio * rect.width}px)`;
      guideRef.current.style.opacity = "1";
    }
    audioPreviewManager.hoverAt(asset, ratio);
  };
  const hideGuide = () => {
    if (guideRef.current) guideRef.current.style.opacity = "0";
  };
  return (
    <div
      className={`audio-media ${preview ? "preview" : ""} ${playing ? "is-playing" : ""}`}
      style={style}
      onPointerEnter={() => {
        if (preview) return;
        audioPreviewManager.preload(asset);
        audioPreviewManager.hover(asset);
      }}
      onPointerLeave={() => {
        if (preview) return;
        hideGuide();
        audioPreviewManager.leave(asset.id);
      }}
    >
      <div
        className="audio-wave-card"
        onPointerDown={preview ? (event) => {
          event.preventDefault();
          scrubbingPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event);
        } : undefined}
        onPointerMove={!preview ? (event) => {
          hoverFromPosition(event);
        } : (event) => {
          if (scrubbingPointer.current === event.pointerId) seek(event);
        }}
        onPointerUp={preview ? (event) => {
          if (scrubbingPointer.current !== event.pointerId) return;
          scrubbingPointer.current = null;
          seek(event);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } : undefined}
      >
        <span className="audio-badge">
          {format}
          {bpm ? ` / BPM: ${bpm}` : ""}
        </span>
        {active && duration > 0 && (
          <span className="audio-duration">
            {durationText(current)} / {durationText(duration)}
          </span>
        )}
        <AudioWaveform src={asset.url} large={preview} />
        <i className="audio-play-depth" ref={progressRef} />
        {!preview && <i className="audio-scrub-guide" ref={guideRef} aria-hidden="true" />}
        {playing && (
          <div className="audio-playing-indicator" aria-label="正在试听">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {preview ? (
        <>
          <span>{asset.name}</span>
          {duration > 0 && (
            <small>
              时长 {durationText(duration)} · {format}
            </small>
          )}
          <div className="audio-full-controls">
            <Button
              onClick={() => audioPreviewManager.toggle(asset)}
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </Button>
            <span>{durationText(current) || "0:00"}</span>
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max="1000"
              value={Math.round(progress * 1000)}
              onChange={(e) =>
                audioPreviewManager.seek(asset, Number(e.target.value) / 1000)
              }
            />
            <Volume2 size={16} />
            <input
              aria-label="音量"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.volume}
              onChange={(e) =>
                audioPreviewManager.setVolume(Number(e.target.value))
              }
            />
          </div>
        </>
      ) : (
        playing && (
          <div className="audio-hover-status">
            <Pause size={11} />
            <span>正在播放</span>
            <Volume2 size={11} />
          </div>
        )
      )}
    </div>
  );
}

export function AudioPreviewChoice({asset, preview, style}) {
  const state = useAudioPreviewState(asset.id);
  return preview ? <ReadyAudioPreview asset={asset} state={state} style={style}/> : <AudioMedia asset={asset} style={style}/>;
}

export function VideoCardMedia({ asset, onSize, style }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [asset.id, asset.url]);

  const stopCardAction = (event) => event.stopPropagation();
  const togglePlayback = async (event) => {
    stopCardAction(event);
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  };
  const seek = (event) => {
    stopCardAction(event);
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const next = Number(event.target.value);
    video.currentTime = next;
    setCurrent(next);
  };
  const toggleMuted = (event) => {
    stopCardAction(event);
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
  };

  return (
    <div
      className={`video-card-media ${playing ? "is-playing" : ""}`}
      style={style}
    >
      <video
        ref={videoRef}
        src={asset.url}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        draggable={false}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          onSize?.(video.videoWidth, video.videoHeight);
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          if (Number.isFinite(video.duration) && video.duration > 0.1)
            video.currentTime = 0.1;
        }}
        onDurationChange={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
        }
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div
        className="video-card-controls"
        aria-label="视频卡片控制栏"
        onPointerDown={stopCardAction}
        onClick={stopCardAction}
        onDoubleClick={stopCardAction}
      >
        <button
          type="button"
          className="video-card-control-button"
          aria-label={playing ? "暂停视频" : "播放视频"}
          title={playing ? "暂停" : "播放"}
          onClick={togglePlayback}
        >
          {playing ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
        </button>
        <input
          type="range"
          aria-label="视频播放进度"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(current, duration || 0)}
          onChange={seek}
          onClick={stopCardAction}
        />
        <span className="video-card-time">
          {durationText(current) || "0:00"}/{durationText(duration) || "0:00"}
        </span>
        <button
          type="button"
          className="video-card-control-button"
          aria-label={muted ? "开启视频声音" : "静音视频"}
          title={muted ? "开启声音" : "静音"}
          onClick={toggleMuted}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
    </div>
  );
}

export function Media({ asset, preview = false, persistControls = false, onSize, style }) {
  if (preview && asset.type?.startsWith("video")) return <ReadyVideoPreview asset={asset} style={style} onSize={onSize} persistControls={persistControls}/>;
  if (asset.type?.startsWith("audio"))
    return <AudioPreviewChoice asset={asset} preview={preview} style={style} />;
  if (asset.type?.startsWith("text") || asset.type === "application/pdf" || asset.documentFormat)
    return <DocumentMedia asset={asset} preview={preview} style={style} />;
  return asset.type?.startsWith("video") ? (
    <VideoCardMedia asset={asset} onSize={onSize} style={style} />
  ) : (
    <img
      src={(preview ? asset.url : asset.thumbnailUrl || asset.url) || undefined}
      alt={asset.name || ""}
      draggable={false}
      loading={preview ? "eager" : "lazy"}
      decoding="async"
      style={style}
      onError={(event) => {
        if (!preview && asset.thumbnailUrl && event.currentTarget.getAttribute("src") === asset.thumbnailUrl)
          event.currentTarget.src = asset.url || "";
      }}
      onLoad={(e) => {
        if (preview || !asset.thumbnailUrl)
          onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
      }}
    />
  );
}

export function DocumentMedia({ asset, preview, style }) {
  const excerpt = (asset.documentText || "").replace(/\s+/g, " ").trim();
  return <div className={`document-media ${preview ? "preview" : ""}`} style={style}>
    <FileText size={preview ? 48 : 28}/><b>{assetFormat(asset) || "DOC"}</b>
    <span>{excerpt ? excerpt.slice(0, preview ? 240 : 72) : "文档素材"}</span>
  </div>;
}
