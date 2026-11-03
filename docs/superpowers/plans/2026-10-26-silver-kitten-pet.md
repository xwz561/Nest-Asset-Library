# Silver Kitten Desktop Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make silver-kitten selectable and render it as a desktop pet in the 3.0.54 Windows build.

**Architecture:** Reuse the current sprite pet implementation. Register the kitten in the settings choices and Electron allowlist, and map its bundled atlas in the pet renderer.

**Tech Stack:** Electron CommonJS, React/Vite, Node.js built-in test runner, electron-builder NSIS script.

**Spec:** `docs/superpowers/specs/2026-10-26-silver-kitten-pet-design.md`

## Global Constraints

- Preserve all existing uncommitted files and changes.
- Do not modify `electron/file-lock.cjs`, `test/file-lock.test.cjs`, `src/motion-polish.css`, or `src/main.jsx`.
- Do not run `npm run package:win`; run `npm run build` before `node scripts/package-windows-setup.cjs`.
- Write the new package to a separate output directory so the existing release remains recoverable.

## Review Focus

- Existing/invalid pet IDs must retain current fallback behavior; test kitten acceptance and unknown-ID fallback.
- The UI preview and desktop renderer must point at the exact `spritesheet-extended-final.png`; verify those entries in the built app.asar.
- Existing three pet behaviors must remain unchanged; run the desktop-pet tests and full test command.

---

### Task 1: Register and render silver-kitten

**Files:**
- Modify: `test/desktop-pet.test.cjs`
- Modify: `electron/desktop-pet.cjs`
- Modify: `src/pet-settings.jsx`
- Modify: `electron/pet-window.js`

**Interfaces:** Existing pet ID `silver-kitten`; atlas `public/pets/silver-kitten/spritesheet-extended-final.png`; renderer resource URL `../dist/pets/silver-kitten/spritesheet-extended-final.png`.

- [x] Add a test proving `normalizePetSettings({petId:'silver-kitten'}).petId` stays `silver-kitten`, while an unknown ID still falls back to `maid-deepseek-whale`.
- [x] Run the desktop-pet test and observe the expected kitten assertion fail before production edits.
- [x] Add `silver-kitten` to the Electron pet allowlist, settings choices, and sprite renderer map; use label `银渐层小猫` and the exact bundled atlas path.
- [x] The kitten regression test passes; `node --test test/file-lock.test.cjs` passes 10/10. The complete desktop-pet test file retains four unrelated pre-existing failures; see the execution ledger ruling.
- [x] Run the full `npm test` suite: 417 tests, 391 pass and 26 fail. The four `desktop-pet.test.cjs` failures were reproduced before production edits; other failures are not attributed without a baseline comparison. Do not change unrelated code.

### Task 2: Build and verify Windows delivery

**Files:**
- Build artifacts: a fresh dated folder under `release-silver-kitten-20261026`.

- [x] Run `npm run build` (exit 0; only existing missing-calendar-source and large-chunk warnings).
- [x] Run `node scripts/package-windows-setup.cjs` with `NEST_PACKAGE_OUTPUT=release-silver-kitten-20261026` (exit 0).
- [x] Verify Setup.exe, nonzero `win-unpacked/resources/app.asar`, and archive entries for the kitten preview/atlas, renderer, and settings bundle with the package verification script.
- [x] Recheck protected-file hashes; all four match their starting values.

## Final Review

- Fresh read-only reviewer found no blocker for kitten selection and atlas rendering. Deferred the inherited greeting/feed `play('waving')` mapping issue and uncertainty about kitten row-6 sleep semantics because this request was scoped to making the kitten selectable/displayable; see the ledger and handoff for user-visible risk.
