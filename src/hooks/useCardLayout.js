import React from "react";
import { CARD_CRAZY_KEY, CARD_DESK_KEY, PANEL_CARDS, allCardsFloating, bringCardToFront, canGoToDesk, cardStackOrder, dockCard, loadCardLayout, loadDeskCards, normalizeDeskCards, placeCard, placeCards, sameCardLayout, saveCardLayout } from "../card-layout.js";

export const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight });

// 侧栏卡片的摆放状态。平时卡片锁定；打开"编辑布局"开关后拖动只改草稿，
// 点"保存"才写进本机（localStorage，每台电脑、每个系统用户各记各的），点"取消"丢掉草稿。
export function useCardLayout(availableIds) {
  const [saved, setSaved] = React.useState(loadCardLayout);
  const [draft, setDraft] = React.useState(null);
  const [viewport, setViewport] = React.useState(readViewport);
  const [layer, setLayer] = React.useState(null);
  const dockRef = React.useRef(null);
  // 桌面小窗口要套和主窗口一样的外层类名和主题变量，main.jsx 每次渲染时写进来
  const shellRef = React.useRef(null);
  const editing = draft !== null;
  // 疯狂模式：卡片可以拖出窗口放到桌面上；desk 记着桌面上的卡片在屏幕上的位置
  const [crazy, setCrazyState] = React.useState(() => {
    try { return window.localStorage.getItem(CARD_CRAZY_KEY) === "true"; } catch { return false; }
  });
  const [desk, setDesk] = React.useState(loadDeskCards);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(CARD_CRAZY_KEY, String(crazy));
      if (Object.keys(desk).length) window.localStorage.setItem(CARD_DESK_KEY, JSON.stringify(desk));
      else window.localStorage.removeItem(CARD_DESK_KEY);
    } catch {
      // 存不下时本次照样能用
    }
  }, [crazy, desk]);

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
  const placeMany = React.useCallback((updates) => editDraft((current) => placeCards(current, updates, readViewport())), [editDraft]);
  const dock = React.useCallback((id) => editDraft((current) => dockCard(current, id)), [editDraft]);
  // 点一下浮动卡片把它提到最上面：编辑时改草稿，平时直接记住（只是叠放顺序）
  const front = React.useCallback((id) => (editing ? editDraft((current) => bringCardToFront(current, id)) : setSaved((current) => bringCardToFront(current, id))), [editing, editDraft]);
  const startEditing = React.useCallback(() => setDraft((current) => current ?? saved), [saved]);
  const save = React.useCallback(() => {
    if (draft !== null) setSaved(draft);
    setDraft(null);
  }, [draft]);
  const cancel = React.useCallback(() => setDraft(null), []);
  // 关掉疯狂模式时，桌面上的卡片全部回到素材库窗口
  const setCrazy = React.useCallback((on) => {
    setCrazyState(Boolean(on));
    if (!on) setDesk({});
  }, []);
  // 拖出窗口：卡片放到桌面上（窗口里的位置记录清掉，回来时回到默认位置）
  const toDesk = React.useCallback((id, bounds) => {
    if (!canGoToDesk(id)) return;
    setDesk((current) => ({ ...current, ...normalizeDeskCards({ [id]: bounds }) }));
    editDraft((current) => dockCard(current, id));
  }, [editDraft]);
  const fromDesk = React.useCallback((id) => setDesk((current) => {
    if (!(id in current)) return current;
    const next = { ...current };
    delete next[id];
    return next;
  }), []);
  const moveDesk = React.useCallback((id, bounds) => setDesk((current) => (id in current ? { ...current, ...normalizeDeskCards({ [id]: bounds }) } : current)), []);
  // 编辑时的"一键重置"：卡片全部回侧栏，还要点保存才生效（点取消能撤回）
  const resetDraft = React.useCallback(() => {
    editDraft(() => ({}));
    setDesk({});
  }, [editDraft]);
  // 设置页的"恢复默认布局"：立即生效
  const resetAll = React.useCallback(() => {
    setSaved({});
    setDesk({});
    setDraft((current) => (current === null ? null : {}));
  }, []);

  const layout = draft ?? saved;
  const availableKey = availableIds.join(",");
  return React.useMemo(() => {
    const ids = availableKey ? availableKey.split(",") : [];
    const panelIds = ids.filter((id) => PANEL_CARDS.includes(id));
    // 放到桌面上的卡片也不在原位：和浮在窗口里的一样算"离开了"
    const onDesk = crazy ? desk : {};
    const away = { ...onDesk, ...layout };
    return {
      layout,
      editing,
      dirty: editing && !sameCardLayout(draft, saved),
      viewport,
      layer,
      setLayer,
      dockRef,
      shellRef,
      crazy,
      desk: onDesk,
      setCrazy,
      toDesk,
      fromDesk,
      moveDesk,
      order: cardStackOrder(layout),
      floatingCount: ids.filter((id) => id in away).length,
      // 侧栏面板里的五张小卡片都拖走了（面板变空）
      panelEmpty: allCardsFloating(away, panelIds),
      railOut: "rail" in away,
      panelOut: "panel" in away,
      headerOut: "header" in layout,
      toolbarOut: "toolbar" in layout,
      place,
      placeMany,
      dock,
      front,
      startEditing,
      save,
      cancel,
      resetDraft,
      resetAll,
    };
  }, [layout, editing, draft, saved, viewport, layer, availableKey, crazy, desk, setCrazy, toDesk, fromDesk, moveDesk, place, placeMany, dock, front, startEditing, save, cancel, resetDraft, resetAll]);
}
