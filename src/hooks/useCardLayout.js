import React from "react";
import { allCardsFloating, bringCardToFront, cardStackOrder, dockCard, loadCardLayout, placeCard, sameCardLayout, saveCardLayout } from "../card-layout.js";

export const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight });

// 侧栏卡片的摆放状态。平时卡片锁定；打开"编辑布局"开关后拖动只改草稿，
// 点"保存"才写进本机（localStorage，每台电脑、每个系统用户各记各的），点"取消"丢掉草稿。
export function useCardLayout(availableIds) {
  const [saved, setSaved] = React.useState(loadCardLayout);
  const [draft, setDraft] = React.useState(null);
  const [viewport, setViewport] = React.useState(readViewport);
  const [layer, setLayer] = React.useState(null);
  const dockRef = React.useRef(null);
  const editing = draft !== null;

  React.useEffect(() => {
    saveCardLayout(saved);
  }, [saved]);

  React.useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(readViewport()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const editDraft = React.useCallback((change) => setDraft((current) => (current === null ? current : change(current))), []);
  const place = React.useCallback((id, rect, options) => editDraft((current) => placeCard(current, id, rect, readViewport(), options)), [editDraft]);
  const dock = React.useCallback((id) => editDraft((current) => dockCard(current, id)), [editDraft]);
  // 点一下浮动卡片把它提到最上面：编辑时改草稿，平时直接记住（只是叠放顺序）
  const front = React.useCallback((id) => (editing ? editDraft((current) => bringCardToFront(current, id)) : setSaved((current) => bringCardToFront(current, id))), [editing, editDraft]);
  const startEditing = React.useCallback(() => setDraft((current) => current ?? saved), [saved]);
  const save = React.useCallback(() => {
    if (draft !== null) setSaved(draft);
    setDraft(null);
  }, [draft]);
  const cancel = React.useCallback(() => setDraft(null), []);
  // 编辑时的"一键重置"：卡片全部回侧栏，还要点保存才生效（点取消能撤回）
  const resetDraft = React.useCallback(() => editDraft(() => ({})), [editDraft]);
  // 设置页的"恢复默认布局"：立即生效
  const resetAll = React.useCallback(() => {
    setSaved({});
    setDraft((current) => (current === null ? null : {}));
  }, []);

  const layout = draft ?? saved;
  const availableKey = availableIds.join(",");
  return React.useMemo(() => {
    const ids = availableKey ? availableKey.split(",") : [];
    return {
      layout,
      editing,
      dirty: editing && !sameCardLayout(draft, saved),
      viewport,
      layer,
      setLayer,
      dockRef,
      order: cardStackOrder(layout),
      floatingCount: ids.filter((id) => id in layout).length,
      panelEmpty: allCardsFloating(layout, ids),
      place,
      dock,
      front,
      startEditing,
      save,
      cancel,
      resetDraft,
      resetAll,
    };
  }, [layout, editing, draft, saved, viewport, layer, availableKey, place, dock, front, startEditing, save, cancel, resetDraft, resetAll]);
}
