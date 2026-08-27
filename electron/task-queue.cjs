function createTaskQueue({ onError = error => console.error('Queued task failed:', error) } = {}) {
  let tail = Promise.resolve();
  let pending = 0;
  const run = task => {
    pending += 1;
    const result = tail.then(task, task);
    tail = result.catch(onError);
    return result.finally(() => { pending -= 1; });
  };
  run.pending = () => pending;
  return run;
}

module.exports = { createTaskQueue };
