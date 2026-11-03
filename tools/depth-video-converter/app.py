from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from queue import Empty, Queue

import cv2
import numpy as np
import onnxruntime as ort
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinterdnd2 import DND_FILES, TkinterDnD
from model_discovery import find_default_model


APP_NAME = "深度视频转换器"
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm"}


def choose_dropped_video(paths) -> str:
    """Return the single supported video path from a drag-and-drop payload."""
    paths = [str(path) for path in paths if str(path).strip()]
    if len(paths) != 1:
        raise ValueError("一次只能拖入一个视频。")
    path = paths[0]
    if Path(path).suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("不支持的文件格式，请拖入 MP4、MOV、MKV、AVI 或 WebM 视频。")
    return path


def parse_drop_data(data: str, splitlist) -> str:
    """Parse TkDND's Tcl-list payload and return one supported video path."""
    return choose_dropped_video(splitlist(data))
OUTPUT_STYLES = ("灰度深度", "伪彩色深度", "白模动画", "伪三维模型")


def resource_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


def find_ffmpeg() -> str | None:
    bundled = resource_path("ffmpeg.exe")
    if bundled.exists():
        return str(bundled)
    return shutil.which("ffmpeg")


class DepthEstimator:
    """ONNX 深度估计封装：加载模型、逐帧推理并渲染多种输出样式。"""

    def __init__(self, model_path: str, use_gpu: bool):
        available = ort.get_available_providers()
        providers = ["CPUExecutionProvider"]
        if use_gpu and "DmlExecutionProvider" in available:
            providers.insert(0, "DmlExecutionProvider")
        elif use_gpu and "CUDAExecutionProvider" in available:
            providers.insert(0, "CUDAExecutionProvider")
        self.session = ort.InferenceSession(model_path, providers=providers)
        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        self.output_name = self.session.get_outputs()[0].name
        shape = inp.shape
        # 动态维度（-1 / None）时回退 384，避免 resize 崩溃
        self.height = int(shape[-2]) if isinstance(shape[-2], int) and shape[-2] > 0 else 384
        self.width = int(shape[-1]) if isinstance(shape[-1], int) and shape[-1] > 0 else 384
        layout = getattr(inp, "layout", None)
        if layout:
            self.layout_nhwc = layout == "NHWC"
        else:
            self.layout_nhwc = (
                len(shape) == 4
                and isinstance(shape[-1], int)
                and shape[-1] == 3
                and shape[-1] != -1
            )
        # 预计算归一化参数：tensor' = tensor * scale + offset（等价于 (t/255-mean)/std）
        mean = np.array([0.485, 0.456, 0.406], np.float32)
        std = np.array([0.229, 0.224, 0.225], np.float32)
        self._norm_scale = 1.0 / (255.0 * std)
        self._norm_offset = -mean / std

    @staticmethod
    def _white_model(frame_bgr: np.ndarray, depth: np.ndarray, luminance: np.ndarray) -> np.ndarray:
        """Render a warm-white clay/plaster look from depth-derived normals."""
        surface = cv2.bilateralFilter(depth.astype(np.float32), 9, 0.08, 7)
        grad_x = cv2.Sobel(surface, cv2.CV_32F, 1, 0, ksize=3) * 4.2
        grad_y = cv2.Sobel(surface, cv2.CV_32F, 0, 1, ksize=3) * 4.2

        nx, ny = -grad_x, -grad_y
        nz = np.ones_like(surface)
        norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
        nx, ny, nz = nx / norm, ny / norm, nz / norm
        light = (-0.38 * nx) + (-0.42 * ny) + (0.82 * nz)
        light = np.clip(light, 0.0, 1.0)

        broad = cv2.GaussianBlur(surface, (0, 0), 11)
        contact_shadow = np.clip((broad - surface) * 2.8, 0.0, 0.22)
        luminance = luminance.astype(np.float32) / 255.0
        fine_detail = luminance - cv2.GaussianBlur(luminance, (0, 0), 2.2)

        shade = 0.66 + 0.32 * light + 0.04 * surface - contact_shadow + 0.10 * fine_detail
        shade = np.clip(shade, 0.56, 1.0)
        plaster = np.empty((*surface.shape, 3), dtype=np.float32)
        plaster[..., 0] = 246.0 * shade
        plaster[..., 1] = 248.0 * shade
        plaster[..., 2] = 250.0 * shade
        return np.clip(plaster, 0, 255).astype(np.uint8)

    @staticmethod
    def _model_3d(frame_bgr: np.ndarray, depth: np.ndarray, frame_index: int, gray: np.ndarray) -> np.ndarray:
        """Render a cool-gray 2.5D model viewport with animated studio lighting."""
        surface = cv2.bilateralFilter(depth.astype(np.float32), 9, 0.07, 7)
        grad_x = cv2.Sobel(surface, cv2.CV_32F, 1, 0, ksize=3) * 5.0
        grad_y = cv2.Sobel(surface, cv2.CV_32F, 0, 1, ksize=3) * 5.0
        nx, ny, nz = -grad_x, -grad_y, np.ones_like(surface)
        norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
        nx, ny, nz = nx / norm, ny / norm, nz / norm

        angle = frame_index * 0.025
        lx = 0.52 * np.cos(angle)
        ly = -0.42
        lz = 0.74 + 0.10 * np.sin(angle)
        light_norm = np.sqrt(lx * lx + ly * ly + lz * lz)
        lx, ly, lz = lx / light_norm, ly / light_norm, lz / light_norm
        diffuse = np.clip(nx * lx + ny * ly + nz * lz, 0.0, 1.0)

        half_x, half_y, half_z = lx, ly, lz + 1.0
        half_norm = np.sqrt(half_x * half_x + half_y * half_y + half_z * half_z)
        specular = np.power(
            np.clip(nx * half_x / half_norm + ny * half_y / half_norm + nz * half_z / half_norm, 0.0, 1.0), 28.0
        )

        broad = cv2.GaussianBlur(surface, (0, 0), 13)
        ambient_occlusion = np.clip((broad - surface) * 3.4, 0.0, 0.30)
        silhouette = cv2.magnitude(grad_x, grad_y)
        rim = np.clip(silhouette * 0.75, 0.0, 0.22)

        original = frame_bgr.astype(np.float32) / 255.0
        original_gray = gray.astype(np.float32) / 255.0
        albedo = 0.76 + 0.10 * (original_gray - 0.5)
        shade = np.clip(albedo * (0.48 + 0.48 * diffuse) - ambient_occlusion + rim + 0.28 * specular, 0.22, 1.0)

        # Cool neutral material with a restrained trace of the source color.
        base = np.empty_like(original)
        base[..., 0], base[..., 1], base[..., 2] = 0.93, 0.88, 0.82
        source_tint = 0.08 * original + 0.92 * base
        model = source_tint * shade[..., None] * 255.0
        return np.clip(model, 0, 255).astype(np.uint8)

    def infer(self, frame_bgr: np.ndarray, invert: bool, output_style: str, frame_index: int = 0) -> np.ndarray:
        rgb = frame_bgr[:, :, ::-1]  # BGR -> RGB 视图，零拷贝
        # 缩小用 INTER_AREA（快且抗锯齿），放大用 INTER_LINEAR（比 CUBIC 快约 3 倍、视觉差异极小）
        if rgb.shape[1] > self.width or rgb.shape[0] > self.height:
            interp = cv2.INTER_AREA
        else:
            interp = cv2.INTER_LINEAR
        resized = cv2.resize(rgb, (self.width, self.height), interpolation=interp)
        tensor = resized.astype(np.float32)
        tensor *= self._norm_scale
        tensor += self._norm_offset
        if self.layout_nhwc:
            tensor = tensor[None, ...]
        else:
            tensor = tensor.transpose(2, 0, 1)[None, ...]
        depth = np.asarray(self.session.run([self.output_name], {self.input_name: tensor})[0]).squeeze()
        if depth.ndim == 3:
            depth = depth[0]
        finite = np.isfinite(depth)
        if not finite.any():
            depth = np.zeros_like(depth, dtype=np.float32)
        else:
            # np.partition 比 np.percentile 快数倍，效果等价
            flat = depth[finite].ravel()
            if flat.size >= 100:
                k_low = max(1, int(flat.size * 0.02))
                k_high = min(flat.size - 1, int(flat.size * 0.98))
                low = float(np.partition(flat, k_low)[k_low])
                high = float(np.partition(flat, k_high)[k_high])
            else:
                low = float(np.min(flat))
                high = float(np.max(flat))
            depth = np.clip((depth - low) / max(high - low, 1e-6), 0, 1)
        if invert:
            depth = 1.0 - depth
        depth = cv2.resize(
            depth.astype(np.float32),
            (frame_bgr.shape[1], frame_bgr.shape[0]),
            interpolation=cv2.INTER_LINEAR,
        )
        gray = (depth * 255).astype(np.uint8)
        if output_style == "伪彩色深度":
            return cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)
        if output_style == "白模动画":
            orig_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            return self._white_model(frame_bgr, depth, orig_gray)
        if output_style == "伪三维模型":
            orig_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            return self._model_3d(frame_bgr, depth, frame_index, orig_gray)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def create_intermediate_writer(fps: float, size: tuple[int, int]):
    """优先创建 FFV1 无损中间视频（AVI），不可用时回退 mp4v。返回 (writer, path)。"""
    fd, avi_path = tempfile.mkstemp(suffix=".avi", prefix="depth_video_")
    os.close(fd)
    writer = cv2.VideoWriter(avi_path, cv2.VideoWriter_fourcc(*"FFV1"), fps, size)
    if writer.isOpened():
        return writer, avi_path
    writer.release()
    try:
        Path(avi_path).unlink()
    except OSError:
        pass
    fd, mp4_path = tempfile.mkstemp(suffix=".mp4", prefix="depth_video_")
    os.close(fd)
    writer = cv2.VideoWriter(mp4_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    if writer.isOpened():
        return writer, mp4_path
    writer.release()
    try:
        Path(mp4_path).unlink()
    except OSError:
        pass
    return None, None


def run_conversion(
    inp: str,
    out: str,
    model: str,
    invert: bool,
    output_style: str,
    use_gpu: bool,
    keep_audio: bool,
    stop_event: threading.Event | None = None,
    log=None,
    progress=None,
):
    """执行一次完整转换。返回 (success: bool, detail: str)。
    success=True 时 detail 为输出路径；False 时 detail 为错误消息或 "已停止"。
    """
    temp_path = None
    cap = writer = None
    try:
        if log:
            log("正在加载深度模型…")
        estimator = DepthEstimator(model, use_gpu)
        if log:
            log("推理后端：" + ", ".join(estimator.session.get_providers()))
        cap = cv2.VideoCapture(inp)
        if not cap.isOpened():
            raise RuntimeError("无法打开输入视频。")
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        writer, temp_path = create_intermediate_writer(fps, (width, height))
        if writer is None:
            raise RuntimeError("无法创建临时输出视频。")
        if log:
            codec_name = "FFV1 无损" if temp_path.endswith(".avi") else "mp4v"
            log(f"视频：{width}x{height} / {fps:.2f} FPS / {total or '未知'} 帧（中间编码：{codec_name}）")
        started, frame_no, last_log = time.time(), 0, 0.0
        while True:
            if stop_event is not None and stop_event.is_set():
                break
            ok, frame = cap.read()
            if not ok:
                break
            if not writer.write(estimator.infer(frame, invert, output_style, frame_no)):
                raise RuntimeError("写入输出视频失败（请检查磁盘空间）。")
            frame_no += 1
            if frame_no % 5 == 0:
                pct = min(99.0, frame_no * 100.0 / total) if total else 0.0
                if progress:
                    progress(pct)
                now = time.time()
                if now - last_log >= 0.8:
                    last_log = now
                    elapsed = max(now - started, 0.01)
                    if log:
                        log(f"已处理 {frame_no}/{total or '?'} 帧，{frame_no / elapsed:.1f} FPS")
        cap.release(); cap = None
        writer.release(); writer = None
        if stop_event is not None and stop_event.is_set():
            return False, "已停止"
        ffmpeg = find_ffmpeg()
        if ffmpeg:
            if keep_audio:
                if log:
                    log("正在压制视频并合并原音频…")
                cmd = [
                    ffmpeg, "-y", "-i", temp_path, "-i", inp,
                    "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264",
                    "-preset", "medium", "-crf", "18", "-c:a", "aac",
                    "-movflags", "+faststart", "-shortest", out,
                ]
            else:
                if log:
                    log("正在压制视频…")
                cmd = [
                    ffmpeg, "-y", "-i", temp_path, "-an",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-movflags", "+faststart", out,
                ]
            proc = subprocess.Popen(
                cmd,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
            )
            stderr = b""
            while True:
                try:
                    _, stderr = proc.communicate(timeout=0.3)
                    break
                except subprocess.TimeoutExpired:
                    if stop_event is not None and stop_event.is_set():
                        proc.kill()
                        proc.wait()
                        return False, "已停止"
            if proc.returncode != 0:
                err_text = stderr.decode("utf-8", errors="replace")[-1800:]
                raise RuntimeError("FFmpeg 压制失败：\n" + err_text)
        else:
            shutil.move(temp_path, out)
            temp_path = None
            if log:
                log("未找到 FFmpeg，已输出无音频的兼容视频。")
        if progress:
            progress(100.0)
        return True, out
    except Exception as exc:
        return False, str(exc)
    finally:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()
        if temp_path and Path(temp_path).exists():
            try:
                Path(temp_path).unlink()
            except OSError:
                pass


class ConverterApp(TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("820x700")
        self.minsize(740, 640)
        self.queue: Queue = Queue()
        self.stop_event = threading.Event()
        self.worker: threading.Thread | None = None
        self._form_widgets: list[tuple[tk.Widget, str]] = []
        self._apply_theme()
        self._build_ui()
        self.after(100, self._poll_queue)

    def _apply_theme(self):
        """Dark Minimal Pro 深色主题（clam 引擎定制，零第三方依赖）。"""
        self.configure(bg="#0e1116")
        self._colors = {
            "bg": "#0e1116",          # 主背景
            "surface": "#151a23",     # 面板 / 卡片
            "surface2": "#1c2330",    # 输入框 / 内嵌区
            "border": "#293242",      # 边框
            "fg": "#e6ebf2",          # 主文字
            "muted": "#8b96a8",       # 次要文字
            "accent": "#4f8dff",      # 强调蓝
            "accent_hover": "#6ba3ff",
            "accent_dark": "#3b6fd6", # 按下
            "danger": "#ff5c6c",
            "on_accent": "#0b0f14",   # 强调底上的深色文字
            "focus_ring": "#7ab3ff",
            "success": "#3dd68c",
            "warning": "#ffc964",
        }
        c = self._colors
        style = ttk.Style(self)
        style.theme_use("clam")

        # 全局默认（正文 9.5 → 9，Tk 字体取整）
        style.configure(".", background=c["bg"], foreground=c["fg"],
                        fieldbackground=c["surface2"], bordercolor=c["border"],
                        troughcolor=c["surface"], focuscolor=c["accent"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("TFrame", background=c["bg"])
        style.configure("TLabel", background=c["bg"], foreground=c["fg"])
        style.configure("Card.TFrame", background=c["surface"])

        # 字体层级：标题 20 bold / 分组标题 11 bold / 正文 9 / 标签 9 / 提示 8 / 日志 Consolas 9
        style.configure("Title.TLabel", background=c["bg"], foreground=c["fg"],
                        font=("Microsoft YaHei UI", 20, "bold"))
        style.configure("Badge.TLabel", background=c["surface2"], foreground=c["muted"],
                        font=("Microsoft YaHei UI", 9), padding=(12, 4))
        style.configure("Hint.TLabel", background=c["bg"], foreground=c["muted"],
                        font=("Microsoft YaHei UI", 8))
        style.configure("Field.TLabel", background=c["surface"], foreground=c["muted"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("Status.TLabel", background=c["bg"], foreground=c["muted"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("StatusActive.TLabel", background=c["bg"], foreground=c["fg"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("StatusOk.TLabel", background=c["bg"], foreground=c["success"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("StatusErr.TLabel", background=c["bg"], foreground=c["danger"],
                        font=("Microsoft YaHei UI", 9))
        style.configure("Percent.TLabel", background=c["bg"], foreground=c["muted"],
                        font=("Consolas", 9))

        # 分组框（标题 11 bold）
        style.configure("TLabelframe", background=c["bg"], bordercolor=c["border"],
                        relief="solid", borderwidth=1)
        style.configure("TLabelframe.Label", background=c["bg"], foreground=c["fg"],
                        font=("Microsoft YaHei UI", 11, "bold"))

        # 输入框：focus 用 accent 边框
        style.configure("TEntry", fieldbackground=c["surface2"], foreground=c["fg"],
                        bordercolor=c["border"], insertcolor=c["fg"], padding=6)
        style.map("TEntry", bordercolor=[("focus", c["accent"])])

        # 按钮：normal / hover / pressed / disabled / focus(focusRing)
        style.configure("TButton", background=c["surface2"], foreground=c["fg"],
                        bordercolor=c["border"], padding=(20, 9))
        style.map("TButton",
                  background=[("active", c["surface"]), ("pressed", c["surface"]),
                              ("disabled", c["surface"])],
                  foreground=[("disabled", c["muted"])],
                  bordercolor=[("focus", c["focus_ring"])])
        style.configure("Accent.TButton", background=c["accent"], foreground=c["on_accent"],
                        bordercolor=c["accent"], padding=(20, 9))
        style.map("Accent.TButton",
                  background=[("active", c["accent_hover"]), ("pressed", c["accent_dark"]),
                              ("disabled", c["surface2"])],
                  foreground=[("disabled", c["muted"])],
                  bordercolor=[("focus", c["focus_ring"])])
        style.configure("Danger.TButton", background=c["danger"], foreground=c["on_accent"],
                        bordercolor=c["danger"], padding=(20, 9))
        style.map("Danger.TButton",
                  background=[("active", "#ff7a88"), ("pressed", "#e04a58"),
                              ("disabled", c["surface2"])],
                  foreground=[("disabled", c["muted"])],
                  bordercolor=[("focus", c["focus_ring"])])

        # 复选框：选中指示器 accent
        style.configure("TCheckbutton", background=c["bg"], foreground=c["fg"])
        style.map("TCheckbutton",
                  background=[("active", c["bg"])],
                  foreground=[("disabled", c["muted"])],
                  indicatorcolor=[("selected", c["accent"]), ("disabled", c["surface2"])])

        # 下拉框
        style.configure("TCombobox", fieldbackground=c["surface2"], foreground=c["fg"],
                        bordercolor=c["border"], arrowcolor=c["muted"], padding=4)
        style.map("TCombobox",
                  fieldbackground=[("readonly", c["surface2"])],
                  foreground=[("readonly", c["fg"]), ("disabled", c["muted"])],
                  bordercolor=[("focus", c["accent"])],
                  arrowcolor=[("disabled", c["muted"])])

        # 进度条：正常 accent / 完成 success / 出错 danger
        style.configure("TProgressbar", background=c["accent"], troughcolor=c["surface"],
                        bordercolor=c["border"])
        style.configure("Success.Horizontal.TProgressbar", background=c["success"],
                        troughcolor=c["surface"], bordercolor=c["border"])
        style.configure("Danger.Horizontal.TProgressbar", background=c["danger"],
                        troughcolor=c["surface"], bordercolor=c["border"])

        # 滚动条
        style.configure("Vertical.TScrollbar", background=c["surface2"], troughcolor=c["surface"],
                        bordercolor=c["border"], arrowcolor=c["muted"])
        style.configure("Horizontal.TScrollbar", background=c["surface2"], troughcolor=c["surface"],
                        bordercolor=c["border"], arrowcolor=c["muted"])

        # Combobox 下拉列表配色
        self.option_add("*TCombobox*Listbox.background", c["surface2"])
        self.option_add("*TCombobox*Listbox.foreground", c["fg"])
        self.option_add("*TCombobox*Listbox.selectBackground", c["accent"])
        self.option_add("*TCombobox*Listbox.selectForeground", c["on_accent"])

    def _build_ui(self):
        c = self._colors
        root = ttk.Frame(self, padding=24)
        root.pack(fill="both", expand=True)
        root.columnconfigure(0, weight=1)
        root.rowconfigure(6, weight=1)  # 日志区随窗口伸缩

        # ① 顶部标题区：大标题 + 右侧徽标
        header = ttk.Frame(root)
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text=APP_NAME, style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(header, text="小旺仔出品", style="Badge.TLabel").grid(row=0, column=1, sticky="e")
        ttk.Label(root, text="将普通视频逐帧转换为深度视频，可选择静音输出。", style="Hint.TLabel").grid(
            row=1, column=0, sticky="w", pady=(4, 16))

        # ② 文件选择三行 → surface 卡片分组
        card = tk.Frame(root, bg=c["surface"], highlightbackground=c["border"],
                        highlightthickness=1, bd=0)
        card.grid(row=2, column=0, sticky="ew")
        card.columnconfigure(0, weight=1)
        form = ttk.Frame(card, padding=14, style="Card.TFrame")
        form.grid(row=0, column=0, sticky="ew")
        form.columnconfigure(1, weight=1)
        self.input_var = tk.StringVar()
        self.output_var = tk.StringVar()
        self.model_var = tk.StringVar(value=find_default_model())
        self.input_entry = self._file_row(form, 0, "输入视频", self.input_var, self._pick_input)
        self._file_row(form, 1, "输出视频", self.output_var, self._pick_output)
        self._file_row(form, 2, "ONNX 模型", self.model_var, self._pick_model)
        self.input_entry.drop_target_register(DND_FILES)
        self.input_entry.dnd_bind("<<Drop>>", self._on_video_drop)
        self.drop_target_register(DND_FILES)
        self.dnd_bind("<<Drop>>", self._on_video_drop)

        # ③ 转换选项（2 列排布）
        options = ttk.LabelFrame(root, text="转换选项", padding=14)
        options.grid(row=3, column=0, sticky="ew", pady=(16, 12))
        options.columnconfigure(3, weight=1)
        self.invert_var = tk.BooleanVar(value=False)
        self.style_var = tk.StringVar(value="灰度深度")
        self.gpu_var = tk.BooleanVar(value=True)
        self.mute_audio_var = tk.BooleanVar(value=False)
        invert_cb = ttk.Checkbutton(options, text="反转近远（黑白互换）", variable=self.invert_var)
        invert_cb.grid(row=0, column=0, sticky="w")
        gpu_cb = ttk.Checkbutton(options, text="优先使用 GPU", variable=self.gpu_var)
        gpu_cb.grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Label(options, text="输出样式").grid(row=0, column=1, sticky="e", padx=(32, 8))
        style_box = ttk.Combobox(options, textvariable=self.style_var, values=OUTPUT_STYLES,
                                 state="readonly", width=16)
        style_box.grid(row=0, column=2, sticky="w")
        mute_cb = ttk.Checkbutton(options, text="不要视频声音（静音输出）", variable=self.mute_audio_var)
        mute_cb.grid(row=1, column=1, columnspan=2, sticky="w", pady=(8, 0))
        self._form_widgets += [(invert_cb, "normal"), (gpu_cb, "normal"),
                               (style_box, "readonly"), (mute_cb, "normal")]

        # ④ 进度区（进度条 + 百分比 + 状态行）
        progress_frame = ttk.Frame(root)
        progress_frame.grid(row=4, column=0, sticky="ew", pady=(4, 2))
        progress_frame.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(progress_frame, mode="determinate", maximum=100)
        self.progress.grid(row=0, column=0, sticky="ew")
        self.percent_var = tk.StringVar(value="0%")
        ttk.Label(progress_frame, textvariable=self.percent_var, style="Percent.TLabel",
                  width=7, anchor="e").grid(row=0, column=1, padx=(10, 0))
        self.status_var = tk.StringVar(value=(
            "已自动识别 ONNX 模型，选择视频后即可开始转换"
            if self.model_var.get() else "未找到 ONNX 模型，请点击浏览选择模型"))
        self.status_label = ttk.Label(root, textvariable=self.status_var, style="Status.TLabel")
        self.status_label.grid(row=5, column=0, sticky="w")

        # ⑤ 运行日志（深色内嵌 + 滚动条）
        log_frame = ttk.LabelFrame(root, text="运行日志", padding=8)
        log_frame.grid(row=6, column=0, sticky="nsew", pady=(12, 0))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        self.log = tk.Text(log_frame, height=7, wrap="word", state="disabled",
                           font=("Consolas", 9),
                           bg=c["surface2"], fg=c["fg"], insertbackground=c["fg"],
                           selectbackground=c["accent"], selectforeground=c["on_accent"],
                           relief="flat", borderwidth=0, highlightthickness=1,
                           highlightbackground=c["border"], padx=10, pady=8)
        self.log.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log.configure(yscrollcommand=scrollbar.set)

        # ⑥ 底部按钮栏
        buttons = ttk.Frame(root)
        buttons.grid(row=7, column=0, sticky="ew", pady=(14, 0))
        self.start_btn = ttk.Button(buttons, text="开始转换", command=self._start,
                                    style="Accent.TButton")
        self.start_btn.pack(side="right")
        self.stop_btn = ttk.Button(buttons, text="停止", command=self._stop,
                                   state="disabled", style="Danger.TButton")
        self.stop_btn.pack(side="right", padx=(0, 10))
        ttk.Button(buttons, text="使用说明", command=self._help).pack(side="left")

        # 快捷键：Ctrl+O 输入 / Ctrl+E 输出 / Ctrl+M 模型 / Ctrl+Enter 开始 / Esc 停止 / F1 说明
        self.bind_all("<Control-o>", lambda e: self._pick_input())
        self.bind_all("<Control-e>", lambda e: self._pick_output())
        self.bind_all("<Control-m>", lambda e: self._pick_model())
        self.bind_all("<Control-Return>", lambda e: self._start())
        self.bind_all("<Escape>", lambda e: self._stop())
        self.bind_all("<F1>", lambda e: self._help())

    def _file_row(self, parent, row, label, variable, command):
        ttk.Label(parent, text=label, style="Field.TLabel", width=10, anchor="w").grid(
            row=row, column=0, sticky="w", pady=4)
        entry = ttk.Entry(parent, textvariable=variable)
        entry.grid(row=row, column=1, sticky="ew", padx=10, pady=4)
        browse = ttk.Button(parent, text="浏览…", width=8, command=command)
        browse.grid(row=row, column=2, pady=4)
        self._form_widgets += [(entry, "normal"), (browse, "normal")]
        return entry

    def _set_form_enabled(self, enabled: bool):
        """转换期间禁用/恢复表单控件（恢复时还原各自原始 state）。"""
        for widget, original_state in self._form_widgets:
            try:
                widget.configure(state=original_state if enabled else "disabled")
            except tk.TclError:
                pass

    def _pick_input(self):
        path = filedialog.askopenfilename(
            filetypes=[("视频文件", "*.mp4 *.mov *.mkv *.avi *.webm"), ("所有文件", "*.*")])
        if path:
            self._set_input_video(path)

    def _set_input_video(self, path: str):
        self.input_var.set(path)
        if not self.output_var.get():
            source = Path(path)
            self.output_var.set(str(source.with_name(source.stem + "_depth.mp4")))

    def _on_video_drop(self, event):
        try:
            path = parse_drop_data(event.data, self.tk.splitlist)
        except (ValueError, tk.TclError) as exc:
            messagebox.showwarning("无法使用拖入文件", str(exc))
            return
        self._set_input_video(path)
        self.status_var.set("已接收拖入视频，可开始转换" if self.model_var.get()
                            else "已接收拖入视频，请选择 ONNX 模型后开始转换")

    def _pick_output(self):
        path = filedialog.asksaveasfilename(defaultextension=".mp4", filetypes=[("MP4 视频", "*.mp4")])
        if path:
            self.output_var.set(path)

    def _pick_model(self):
        path = filedialog.askopenfilename(filetypes=[("ONNX 模型", "*.onnx"), ("所有文件", "*.*")])
        if path:
            self.model_var.set(path)

    def _help(self):
        messagebox.showinfo(
            "使用说明",
            "1. 选择输入视频和输出 MP4；程序会自动识别同目录的 ONNX 模型，也可点击浏览更换。\n"
            "2. 选择输出样式与是否反转近远。\n"
            "3. 如需静音输出，勾选“不要视频声音（静音输出）”。\n"
            "4. 点击“开始转换”，可在过程中随时点击“停止”。\n\n"
            "输出样式：\n"
            "· 灰度深度：深度越近越白；\n"
            "· 伪彩色深度：伪彩色热力图；\n"
            "· 白模动画：白色黏土质感立体光影；\n"
            "· 伪三维模型：冷灰材质 + 动态棚拍灯光。\n\n"
            "快捷键：\n"
            "· Ctrl+O 选择输入视频\n"
            "· Ctrl+E 选择输出路径\n"
            "· Ctrl+M 选择 ONNX 模型\n"
            "· Ctrl+Enter 开始转换\n"
            "· Esc 停止\n"
            "· F1 查看本说明\n\n"
            "推荐模型：MiDaS small 256 或 DPT Hybrid ONNX。\n"
            "固定输入尺寸的模型通常速度更快。")

    def _start(self):
        inp = self.input_var.get().strip()
        out = self.output_var.get().strip()
        model = self.model_var.get().strip()
        if not inp or not Path(inp).is_file():
            messagebox.showerror("缺少输入", "请选择有效的输入视频。")
            return
        if not model or not Path(model).is_file():
            messagebox.showerror("缺少模型", "请选择有效的 ONNX 深度模型。")
            return
        if not out:
            messagebox.showerror("缺少输出", "请选择输出视频路径。")
            return
        if Path(out).resolve() == Path(inp).resolve():
            messagebox.showerror("路径冲突", "输出视频不能与输入视频相同，请更换输出路径。")
            return
        self.stop_event.clear()
        self.progress.configure(style="TProgressbar")
        self.progress["value"] = 0
        self.percent_var.set("0%")
        self.status_label.configure(style="StatusActive.TLabel")
        self.status_var.set("正在准备…")
        self._set_form_enabled(False)
        self.start_btn["state"] = "disabled"
        self.stop_btn["state"] = "normal"
        keep_audio = not self.mute_audio_var.get()
        args = (inp, out, model, self.invert_var.get(), self.style_var.get(), self.gpu_var.get(), keep_audio)
        self.worker = threading.Thread(target=self._convert, args=args, daemon=True)
        self.worker.start()

    def _stop(self):
        if self.worker is not None and self.worker.is_alive():
            self.stop_event.set()
            self.status_var.set("正在停止…")

    def _emit(self, kind, value):
        self.queue.put((kind, value))

    def _poll_queue(self):
        try:
            while True:
                kind, value = self.queue.get_nowait()
                if kind == "log":
                    self.log.configure(state="normal")
                    self.log.insert("end", str(value) + "\n")
                    self.log.see("end")
                    self.log.configure(state="disabled")
                elif kind == "progress":
                    self.progress["value"] = value
                    self.percent_var.set(f"{value:.1f}%")
                    self.status_label.configure(style="StatusActive.TLabel")
                    self.status_var.set(f"正在转换… {value:.1f}%")
                elif kind == "done":
                    self._set_form_enabled(True)
                    self.start_btn["state"] = "normal"
                    self.stop_btn["state"] = "disabled"
                    if isinstance(value, tuple):
                        message, output_path = value
                    else:
                        message, output_path = value, None
                    self.status_var.set(message)
                    if message.startswith("完成"):
                        self.status_label.configure(style="StatusOk.TLabel")
                        self.progress.configure(style="Success.Horizontal.TProgressbar")
                        self.progress["value"] = 100
                        self.percent_var.set("100%")
                    else:
                        self.status_label.configure(style="Status.TLabel")
                        self.progress.configure(style="TProgressbar")
                    if output_path:
                        self.percent_var.set("100%")
                    if message.startswith("完成"):
                        messagebox.showinfo("转换完成", message)
                        if output_path:
                            self._open_output_folder(output_path)
                elif kind == "error":
                    self._set_form_enabled(True)
                    self.start_btn["state"] = "normal"
                    self.stop_btn["state"] = "disabled"
                    self.status_label.configure(style="StatusErr.TLabel")
                    self.status_var.set("转换失败")
                    self.progress.configure(style="Danger.Horizontal.TProgressbar")
                    messagebox.showerror("转换失败", str(value))
        except Empty:
            pass
        self.after(100, self._poll_queue)

    def _open_output_folder(self, output_path: str):
        """Open Explorer and select the generated video."""
        try:
            subprocess.Popen(
                ["explorer.exe", "/select,", os.path.normpath(output_path)],
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except OSError as exc:
            self._emit("log", f"无法自动打开输出文件夹：{exc}")

    def _convert(self, inp, out, model, invert, output_style, use_gpu, keep_audio):
        success, message = run_conversion(
            inp, out, model, invert, output_style, use_gpu, keep_audio,
            stop_event=self.stop_event,
            log=lambda m: self._emit("log", m),
            progress=lambda p: self._emit("progress", p),
        )
        if success:
            self._emit("done", (f"完成：\n{message}", message))
        elif message == "已停止":
            self._emit("done", "已停止")
        else:
            self._emit("log", f"错误：{message}")
            self._emit("error", message)


def _cli_log(message: str) -> None:
    print(f"LOG:{message}", flush=True)


def _convert_from_cli(args: argparse.Namespace) -> int:
    """Run one conversion without constructing a Tk window.

    The desktop material library starts the packaged converter with stdio pipes;
    the deliberately small PROGRESS/DONE protocol lets it show useful progress
    while keeping this tool usable on its own as a GUI application.
    """
    if not Path(args.input).is_file():
        raise RuntimeError("输入视频不存在。")
    if not Path(args.model).is_file():
        raise RuntimeError("ONNX 深度模型不存在。")
    success, message = run_conversion(
        args.input, args.output, args.model, args.invert, args.style,
        not args.cpu, not args.no_audio,
        log=_cli_log,
        progress=lambda p: print(f"PROGRESS:{p:.2f}", flush=True),
    )
    if success:
        print(f"DONE:{message}", flush=True)
        return 0
    print(f"ERROR:{message}", file=sys.stderr, flush=True)
    return 1


def run_cli(argv: list[str]) -> int:
    # Electron reads the converter through UTF-8 pipes.  Windows console
    # defaults to a legacy code page, so make status and error messages stable.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass
    parser = argparse.ArgumentParser(description="将视频转换为深度视频")
    parser.add_argument("--input", required=True, help="输入视频路径")
    parser.add_argument("--output", required=True, help="输出 MP4 路径")
    parser.add_argument("--model", required=True, help="ONNX 深度模型路径")
    parser.add_argument("--style", choices=OUTPUT_STYLES, default="灰度深度", help="输出样式")
    parser.add_argument("--invert", action="store_true", help="反转近远深度")
    parser.add_argument("--cpu", action="store_true", help="不使用 GPU 推理")
    parser.add_argument("--no-audio", action="store_true", help="不保留原音频")
    args = parser.parse_args(argv)
    try:
        return _convert_from_cli(args)
    except Exception as exc:
        print(f"ERROR:{exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    if len(sys.argv) > 1:
        raise SystemExit(run_cli(sys.argv[1:]))
    ConverterApp().mainloop()
