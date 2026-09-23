// Notify the current card and the card losing playback, not every audio card.
export function subscribeAssetAudio(manager, assetId, listener) {
  let previousId;
  let initialized = false;
  return manager.subscribe(next => {
    const relevant = !initialized || next.id === assetId || previousId === assetId;
    initialized = true;
    previousId = next.id;
    if (relevant) listener(next);
  });
}
