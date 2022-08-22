const stallThreshold = 200;
let stalledTimer: any;

export function setStalled(cb: () => void) {
  stalledTimer = setTimeout(() => {
    cb();
  }, stallThreshold);
}

export function clearStalled() {
  if (stalledTimer) {
    clearTimeout(stalledTimer);
    stalledTimer = undefined;
  }
}
