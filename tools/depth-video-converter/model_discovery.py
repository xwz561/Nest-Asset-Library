from pathlib import Path
import sys


DEFAULT_MODEL_NAME = "depth-anything-v2-small-quantized.onnx"


def find_default_model() -> str:
    """Find a local model, preferring the one shipped beside the executable."""
    app_dir = (Path(sys.executable).resolve().parent if getattr(sys, "frozen", False)
               else Path(__file__).resolve().parent)
    roots = [app_dir]
    if getattr(sys, "_MEIPASS", None):
        roots.append(Path(sys._MEIPASS))
    roots.append(Path.cwd())
    roots = list(dict.fromkeys(roots))
    for root in roots:
        preferred = root / DEFAULT_MODEL_NAME
        if preferred.is_file():
            return str(preferred.resolve())
    for root in roots:
        try:
            models = [file for file in root.glob("*.onnx") if file.is_file()]
        except OSError:
            continue
        if len(models) == 1:
            return str(models[0].resolve())
        if len(models) > 1:
            return ""
    return ""
