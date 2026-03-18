export const BASELINE_UNITS = 400;

const MEMORY_SLOTS = 512;

type MemCell = { a: number; b: number; c: number; d: number };

/**
 * Shared workload used to normalize benchmark results across machines. It mixes branchy integer
 * arithmetic with deterministic memory churn and returns a checksum to prevent dead-code
 * elimination.
 */
export const sharedBaselineWorkload = (units = BASELINE_UNITS): number => {
  let acc = 0x9e3779b9;
  const ring = new Uint32Array(MEMORY_SLOTS);
  const cells: MemCell[] = new Array(MEMORY_SLOTS);

  for (let i = 0; i < MEMORY_SLOTS; i++) {
    cells[i] = { a: i, b: i << 1, c: i << 2, d: i << 3 };
  }

  for (let unit = 0; unit < units; unit++) {
    for (let i = 0; i < MEMORY_SLOTS; i++) {
      acc = (acc ^ (i + unit * 131)) >>> 0;
      acc = Math.imul(acc, 2654435761) >>> 0;
      acc ^= acc >>> ((i & 7) + 1);

      const idx = (acc + i * 17) & (MEMORY_SLOTS - 1);
      ring[idx] = (ring[idx] + acc + i) >>> 0;

      const cell = cells[idx];
      cell.a = (cell.a + (ring[idx] & 0xff)) >>> 0;
      cell.b = (cell.b ^ ((ring[idx] >>> 8) & 0xff)) >>> 0;
      cell.c = (cell.c + cell.a + unit) >>> 0;
      cell.d = (cell.d ^ cell.c ^ acc) >>> 0;

      // Keep unpredictable branches so this does not simplify into a fast path.
      if ((cell.d & 3) === 0) {
        acc ^= cell.b;
      } else if ((cell.d & 3) === 1) {
        acc = (acc + cell.c) >>> 0;
      } else {
        acc = Math.imul(acc ^ cell.a, 2246822519) >>> 0;
      }
    }
  }

  return (acc ^ ring[acc & (MEMORY_SLOTS - 1)]) >>> 0;
};

export const formatRatio = (value: number): string => {
  const step = value < 10 ? 5 : value < 100 ? 25 : value < 1000 ? 250 : 2000;
  const lower = Math.floor(value / step) * step;
  const upper = lower + step;
  return `${lower}-${upper}x`;
};

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};
