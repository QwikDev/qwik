import type { spinner } from '@clack/prompts';

type Sinner = ReturnType<typeof spinner>;

type Params = {
  spinner: Sinner;
  pkgManager: string;
};

export async function installDepsCli(fn: () => Promise<boolean>, { pkgManager, spinner }: Params) {
  spinner.start(`Installing ${pkgManager} dependencies...`);

  const success = await fn();

  spinner.stop(`${success ? 'Installed' : 'Failed to install'} ${pkgManager} dependencies 📋`);

  return success;
}
