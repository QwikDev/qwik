import { resolve } from 'node:path';

// Convergence target: the live Rust insta snapshots, not a vendored copy.
export const SNAP_DIR = resolve(import.meta.dirname, '../../rust-optimizer/core/src/snapshots');
