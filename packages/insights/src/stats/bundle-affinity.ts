import { hashCode } from './edges';

export interface AffinityLink {
  from: number;
  to: number;
  distance: number;
}

// A minimum spanning tree preserves every single-link clustering threshold.
export function createAffinityTree(vectors: number[][]): AffinityLink[] {
  if (vectors.length < 2) {
    return [];
  }
  const sparseVectors = vectors.map((row) =>
    row.flatMap((value, index) => (value ? [index, value] : []))
  );
  const binaryVectors = vectors.map((row) => {
    const words = new Uint32Array(Math.ceil(row.length / 32));
    for (let dimension = 0; dimension < row.length; dimension++) {
      const value = row[dimension];
      if (value !== 0 && value !== 1) {
        return null;
      }
      if (value === 1) {
        words[dimension >>> 5] |= 1 << (dimension & 31);
      }
    }
    return words;
  });
  const visited = new Set<number>();
  const distances = vectors.map(() => Infinity);
  const parents = vectors.map(() => 0);
  const links: AffinityLink[] = [];
  distances[0] = 0;
  for (let count = 0; count < vectors.length; count++) {
    let nearest = -1;
    for (let index = 0; index < vectors.length; index++) {
      if (!visited.has(index) && (nearest === -1 || distances[index] < distances[nearest])) {
        nearest = index;
      }
    }
    visited.add(nearest);
    if (count > 0) {
      links.push({ from: parents[nearest], to: nearest, distance: distances[nearest] });
    }
    for (let index = 0; index < vectors.length; index++) {
      if (visited.has(index)) {
        continue;
      }
      const left = sparseVectors[nearest];
      const right = sparseVectors[index];
      const leftBinary = binaryVectors[nearest];
      const rightBinary = binaryVectors[index];
      const closestSquaredDistance = distances[index] * distances[index];
      const canUseBinaryDistance =
        leftBinary !== null &&
        rightBinary !== null &&
        leftBinary.length === rightBinary.length &&
        leftBinary.length < (left.length + right.length) / 2;
      const sum = canUseBinaryDistance
        ? binarySquaredDistance(leftBinary, rightBinary, closestSquaredDistance)
        : sparseSquaredDistance(left, right, closestSquaredDistance);
      const distance = Math.sqrt(sum);
      if (distance < distances[index]) {
        distances[index] = distance;
        parents[index] = nearest;
      }
    }
  }
  return links;
}

function binarySquaredDistance(left: Uint32Array, right: Uint32Array, maximum: number): number {
  let sum = 0;
  for (let word = 0; word < left.length; word++) {
    // Binary Euclidean distance counts coordinates with different values.
    let differences = left[word] ^ right[word];
    differences -= (differences >>> 1) & 0x55555555;
    differences = (differences & 0x33333333) + ((differences >>> 2) & 0x33333333);
    sum += (((differences + (differences >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    if (sum > maximum) {
      return sum;
    }
  }
  return sum;
}

function sparseSquaredDistance(left: number[], right: number[], maximum: number): number {
  let leftIndex = left.length - 2;
  let rightIndex = right.length - 2;
  let sum = 0;
  while (leftIndex >= 0 || rightIndex >= 0) {
    const leftDimension = leftIndex >= 0 ? left[leftIndex] : -1;
    const rightDimension = rightIndex >= 0 ? right[rightIndex] : -1;
    let difference: number;
    if (leftDimension === rightDimension) {
      difference = left[leftIndex + 1] - right[rightIndex + 1];
      leftIndex -= 2;
      rightIndex -= 2;
    } else if (leftDimension > rightDimension) {
      difference = left[leftIndex + 1];
      leftIndex -= 2;
    } else {
      difference = right[rightIndex + 1];
      rightIndex -= 2;
    }
    sum += difference * difference;
    if (sum > maximum) {
      return sum;
    }
  }
  return sum;
}

export function groupByAffinity<T extends { name: string }>(
  symbols: T[],
  links: AffinityLink[],
  affinity: number
): { name: string; symbols: T[] }[] {
  const level = Math.max(0, Math.min(100, affinity));
  const defaultDistance = 0.95 * Math.sqrt(2);
  const maximum = Math.max(defaultDistance, ...links.map((link) => link.distance));
  const threshold =
    level === 50
      ? defaultDistance
      : level < 50
        ? maximum + ((defaultDistance - maximum) * level) / 50
        : (defaultDistance * (100 - level)) / 50;
  const parents = symbols.map((_, index) => index);
  function root(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }
  for (const link of links) {
    if (
      link.distance < threshold ||
      (level === 0 && link.distance <= threshold) ||
      (level === 100 && link.distance === 0)
    ) {
      parents[root(link.to)] = root(link.from);
    }
  }
  const groups = new Map<number, T[]>();
  symbols.forEach((symbol, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(symbol);
    groups.set(key, group);
  });
  return Array.from(groups.values())
    .map((group) => ({
      name:
        'bundle_' +
        hashCode(
          group
            .map((symbol) => symbol.name)
            .sort()
            .join(',')
        ),
      symbols: group,
    }))
    .sort((left, right) => right.symbols.length - left.symbols.length);
}
