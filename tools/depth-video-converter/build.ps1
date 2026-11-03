$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

& $Python -m pip install -r (Join-Path $ProjectDir "requirements.txt")
$Ffmpeg = & $Python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
if (-not (Test-Path $Ffmpeg)) { throw "FFmpeg 下载/定位失败" }
$BundledFfmpeg = Join-Path $ProjectDir "ffmpeg.exe"
Copy-Item -LiteralPath $Ffmpeg -Destination $BundledFfmpeg -Force

Push-Location $ProjectDir
try {
    & $Python -m PyInstaller --noconfirm --clean --onefile `
        --windowed `
        --name "DepthVideoConverterV2" `
        --collect-all onnxruntime `
        --collect-all tkinterdnd2 `
        --add-binary "$BundledFfmpeg;." `
        app.py
    & $Python -m PyInstaller --noconfirm --clean --onefile `
        --console `
        --name "DepthVideoConverterCLI" `
        --collect-all onnxruntime `
        --collect-all tkinterdnd2 `
        --add-binary "$BundledFfmpeg;." `
        app.py
    Write-Host "构建完成：$ProjectDir\dist\DepthVideoConverterV2.exe"
    Write-Host "命令行版：$ProjectDir\dist\DepthVideoConverterCLI.exe"
}
finally {
    Pop-Location
    if (Test-Path $BundledFfmpeg) { Remove-Item -LiteralPath $BundledFfmpeg -Force }
}
