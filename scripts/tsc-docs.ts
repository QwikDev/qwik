import { execa } from 'execa';
import { type BuildConfig, panic } from './util';

// Run tsc for docs separately because it requires e.g. qwik-react types to be built first
// plus it takes some time to run and we don't need to run it during core dev.
export async function tscDocs(config: BuildConfig) {
  const result = await execa('tsc', ['-p', 'tsconfig-docs.json'], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc -p tsconfig-docs.json failed`);
  }
}
