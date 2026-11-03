function createMessageController(setValue, timers = globalThis) {
  let timer = null;
  let generation = 0;
  function cancel() {
    generation += 1;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }
  function clearAfter(duration) {
    cancel();
    const current = generation;
    if (duration > 0) timer = timers.setTimeout(() => {
      if (generation !== current) return;
      timer = null;
      setValue("");
    }, duration);
  }
  function show(text, duration = 0) {
    cancel();
    setValue(text);
    if (text && duration > 0) clearAfter(duration);
  }
  return { show, clearAfter, dispose: cancel };
}
module.exports = { createMessageController };
