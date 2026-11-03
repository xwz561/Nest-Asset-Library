# DeepSeek Leads Silver Kitten Implementation Plan

> **For agentic workers:** Execute inline with `superpowers:executing-plans`. The human approved the design and inline implementation in this conversation.

**Goal:** Add a selectable desktop pet mode where the DeepSeek whale leads the silver kitten on a visible leash.

**Architecture:** Keep the existing single-pet modes intact. Add a `deepseek-silver-kitten` mode in the current transparent pet window, reusing the whale's WebM and the user-provided kitten atlas; synchronize both actors' idle and directional walking states and draw a leash between them.

**Tech Stack:** Electron, vanilla JavaScript, CSS, React settings UI, Vite public assets.

**Spec:** Conversation on 2026-10-22; user selected “鲸鱼牵绳带猫走” and approved the composite desktop-pet design.

## Global Constraints

- Preserve existing whale, Liu Hai, and glasses pet choices and settings behavior.
- Leave all chat features and chat source files untouched.
- Keep the user-provided ZIP unchanged; copy only needed animation assets into the app.
- Keep pet size, drag, feed, hunger, and autonomy controls working in combo mode.
- Do not change the app version or publish/package unless separately requested.

## Review Focus

- Existing single-pet modes retain their current layout and animation selection.
- Left/right walking places the whale in front and kitten behind, with the leash connected visibly.
- Window resizing and 50–200% size scaling keep both characters inside the transparent window.
- Feeding and hunger state changes apply to the combined pet without breaking recovery or drag behavior.
- Combo mode survives settings reload and is included by the existing public-asset build pipeline.

---

### Task 1: Register combo mode and add kitten atlas

**Files:**
- Modify `src/pet-settings.jsx` to add the “DeepSeek牵猫” choice and a composite preview.
- Modify `electron/desktop-pet.cjs` to accept the new pet ID and allocate a wider window.
- Create `public/pets/silver-kitten/spritesheet-extended-final.png` and `public/pets/silver-kitten/atlas-manifest-extended.json` from the supplied archive.

- [ ] Add the new mode metadata while preserving all existing choice IDs.
- [ ] Extract only the final atlas and its manifest; retain the supplied ZIP untouched.
- [ ] Confirm Vite's existing `public` asset handling covers both new files.

### Task 2: Render and synchronize the leash scene

**Files:**
- Modify `electron/pet-window.html`, `electron/pet-window.css`, and `electron/pet-window.js`.

- [ ] Add a pair scene with whale, kitten, and an SVG leash layer.
- [ ] Use the whale's existing idle/walk videos and kitten atlas idle/running rows.
- [ ] Keep both actors synchronized through idle, walk, sleep, interaction, hunger, and feed actions.
- [ ] Reverse scene order and facing for left/right movement; preserve whole-window drag and context-menu behavior.

### Task 3: Build verification and review

- [ ] Run `npm run build` and inspect its exit status and generated pet assets.
- [ ] Review the branch diff for scope, existing-mode regressions, and accidental chat changes.
- [ ] Automated tests are not added or run for this request; the user asked for implementation, not test execution.
