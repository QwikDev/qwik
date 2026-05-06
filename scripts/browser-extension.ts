import { execa } from 'execa';
import { panic, type BuildConfig } from './util.ts';

export async function buildBrowserExtension(config: BuildConfig) {
  const result = await execa('npm', ['run', 'build'], {
    stdout: 'inherit',
    cwd: config.browserExtensionPkgDir,
  });

  if (result.failed) {
    panic(`wxt build for browser-extension failed`);
  }

  console.log(`browser-extension`);
}
