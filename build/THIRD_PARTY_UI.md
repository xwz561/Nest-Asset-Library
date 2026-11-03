# Reused UI components

- Fluent UI React Components 9.74.9 — MIT — https://github.com/microsoft/fluentui
- TagSpaces Common 4.8.9 — MIT — https://github.com/tagspaces/tagspaces-common
- WaveSurfer.js 8.0.2 — BSD-3-Clause — https://github.com/katspaugh/wavesurfer.js
- Video.js 8.24.1 — Apache-2.0 — https://github.com/videojs/video.js
- TwintailLauncher main-window layout — visual reference only; no source or assets copied — https://github.com/TwintailTeam/TwintailLauncher
- An Anime Game Launcher progress presentation — visual reference only; no source or assets copied — https://github.com/an-anime-team/an-anime-game-launcher

The independent Windows installer wizard is implemented with electron-builder's bundled NSIS and its built-in nsDialogs controls. The earlier character artwork and animation were removed from the current installer at the user's request; the existing artwork files are retained outside the installer package. No third-party installer plugin is used.

Exact package license texts are distributed in their node_modules directories. TagSpaces Common is used only for filename extension/tag parsing. Electron DAM source and the full TagSpaces application are not copied. Media preview uses the above independently licensed libraries.
