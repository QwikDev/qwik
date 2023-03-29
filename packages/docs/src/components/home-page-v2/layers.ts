const PATH: StyleFrame[] = [
  {
    pos: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    marginLeft: 0,
    marginTop: 0,
    opacity: 0,
    layerAlpha: 0,
  },
  {
    pos: 0.5,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    marginLeft: 0,
    marginTop: 0,
    opacity: 0,
    layerAlpha: 0.2,
  },
  {
    pos: 1,
    rotateX: 0,
    rotateY: 50,
    rotateZ: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    marginLeft: 420,
    marginTop: 0,
    opacity: 1,
    layerAlpha: 0,
  },
];

export interface StyleFrame {
  pos: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  translateX: number;
  translateY: number;
  translateZ: number;
  marginLeft: number;
  marginTop: number;
  opacity: number;
  layerAlpha: number;
}

export function setPosition(pos: number) {
  const prev = findPos(pos, 0);
  const next = findPos(pos, 1);
  return interpolate(pos, prev, next);
}

function findPos(pos: number, offset: number) {
  let lastPos = 0;
  for (let i = 0; i < PATH.length; i++) {
    if (PATH[i].pos <= pos) {
      lastPos = i;
    }
  }
  return PATH[lastPos + offset] || PATH[PATH.length - 1];
}

function interpolate(pos: number, prev: StyleFrame, next: StyleFrame) {
  if (prev.pos === next.pos) {
    return next;
  }
  const percent = (pos - prev.pos) / (next.pos - prev.pos);
  const values: StyleFrame = {} as any;
  (Object.keys(prev) as Array<keyof StyleFrame>).forEach((k) => {
    values[k] = prev[k] * (1 - percent) + next[k] * percent;
  });
  return values;
}
