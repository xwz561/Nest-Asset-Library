import { useEffect, useState } from 'react';

export function useLanFriends() {
  const [friends, setFriends] = useState([]);
  useEffect(() => {
    const api = window.nestDesktop?.peerChat;
    if (!api) return;
    let active = true;
    const update = state => { if (active && Array.isArray(state?.peers)) setFriends(state.peers); };
    const unsubscribe = api.onState(update);
    api.state().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);
  return friends;
}
