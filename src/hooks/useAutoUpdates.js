import { useEffect, useState } from 'react';

export function useAutoUpdates() {
  const [value, setValue] = useState({ enabled: true, phase: 'idle', ready: false });
  useEffect(() => {
    const api = window.nestDesktop;
    if (!api?.autoUpdateState) return;
    let active = true;
    const update = next => { if (active && next && !next.error?.startsWith('窗口不可用')) setValue(next); };
    const unsubscribe = api.onAutoUpdateState(update);
    api.autoUpdateState().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);
  return value;
}
