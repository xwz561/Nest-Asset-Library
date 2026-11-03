# Ready Components Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. Preserve dirty state; do not commit or publish.

Goal: implement the agreed MVP with ready-made Fluent UI, TagSpaces common, WaveSurfer and Video.js modules.
Architecture: retain Electron IPC/data and existing grid/selection state. A UI provider supplies common components; file metadata adapter performs read-only parsing; selected media mounts disposable players.
Tech Stack: existing React/Electron/Vite, Fluent UI React, TagSpaces common MIT, WaveSurfer.js, Video.js.
Spec: 2026-10-10-ui-components-spec.md

Global constraints: isolated QA source/data only; preserve chats/prank/AI Flow; no remote/paid calls; Eagle graphite default; no overwrite of installers.
Review focus: deeply nested folder name ellipsis/action overlap; multiple simultaneous audio players; broken media errors; stale event listeners after asset switching; context menus not swallowing native shortcuts.

- [x] Install pinned dependencies in physical isolated copy; record versions and licenses.
- [x] File metadata: write failing boundary tests for Windows/UNC paths, Chinese filenames, tag containers, no extension. Implement adapter backed by TagSpaces Paths. Use in file display/details.
- [x] UI: FluentProvider and button/tree controls; preserve handlers, refs, drag/drop and keyboard semantics. Consolidate interface styling and remove conflicting import look.
- [x] Media: detail audio reuses shared audio element in WaveSurfer, video uses Video.js with no autoplay. Verify destroy/cancel/error; keep grid cheap.
- [x] Test all units/build; use local-only browser mock QA including navigation/actions/media. Record actual validation.
- [x] Review final changes. Backup precise source files, sync verified MVP; retain QA and original installers. Update HANDOFF and dated project notes, read back.

