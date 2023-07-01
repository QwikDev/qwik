export function computeDistanceMatrix(values: number[][]) {
  const distanceMatrix: number[][] = [];
  const len = values.length;
  for (let i = 0; i < len; i++) {
    distanceMatrix[i] = [];
    for (let j = 0; j < len; j++) {
      distanceMatrix[i][j] = distance(values[i], values[j]);
    }
  }
  return distanceMatrix;
}

function distance(a: number[], b: number[]): number {
  let d = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) {
    d += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(d);
}
