import { Slot, component$, useSignal } from '@builder.io/qwik';
import Tabs from '../tabs';
import { PnpmIcon } from './pnpm';
import { YarnIcon } from './yarn';
import { NpmIcon } from './npm';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm';

const packageManagersTabs = [
  {
    name: 'npm',
    key: 'npm',
  },
  {
    name: 'yarn',
    key: 'yarn',
  },
  {
    name: 'pnpm',
    key: 'pnpm',
  },
];

export default component$(() => {
  const toActive = useSignal('pnpm');

  return (
    <Tabs tabs={packageManagersTabs} activeTab={toActive}>
      <span q:slot="tab-npm" class="inline-flex items-center gap-x-2">
        <NpmIcon width={18} height={18} />
        npm
      </span>
      <span q:slot="tab-yarn" class="inline-flex items-center gap-x-2">
        <YarnIcon width={18} height={18} />
        yarn
      </span>
      <span q:slot="tab-pnpm" class="inline-flex items-center gap-x-2">
        <PnpmIcon width={18} height={18} />
        pnpm
      </span>

      <span q:slot="panel-npm">
        <Slot name="npm" />
      </span>
      <span q:slot="panel-yarn">
        <Slot name="yarn" />
      </span>
      <span q:slot="panel-pnpm">
        <Slot name="pnpm" />
      </span>
    </Tabs>
  );
});
