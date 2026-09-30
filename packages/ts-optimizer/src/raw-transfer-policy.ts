/**
 * Oxc's raw-transfer parse reserves ~6 GB of address space per thread (virtual only, pages are
 * touched as the AST is written). fork() refuses when a single mapping exceeds RAM plus swap, and
 * the buffers of several threads in one process coalesce into one mapping, so a build that later
 * spawns children (SSG, editors, test runners) fails with ENOMEM once enough threads reserved. Keep
 * raw transfer where physical memory holds the reservation with room to spare;
 * `QWIK_TS_OPTIMIZER_RAW_TRANSFER` forces it on or off instead.
 */
export const RAW_TRANSFER_ENV = 'QWIK_TS_OPTIMIZER_RAW_TRANSFER';

/** Address space one raw-transfer parser reserves: a 2 GiB buffer aligned to 4 GiB. */
export const RAW_TRANSFER_RESERVATION_BYTES = 6 * 1024 ** 3;

/** Physical memory must hold this many reservations before raw transfer is worth the risk. */
const MEMORY_HEADROOM_FACTOR = 2;

export function shouldUseRawTransfer(env: string | undefined, totalMemoryBytes: number): boolean {
  const override = env?.trim();
  if (override) {
    return !/^(0|false|off|no)$/i.test(override);
  }
  return totalMemoryBytes >= RAW_TRANSFER_RESERVATION_BYTES * MEMORY_HEADROOM_FACTOR;
}
