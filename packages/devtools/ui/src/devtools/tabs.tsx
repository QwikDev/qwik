import type { JSXOutput } from '@qwik.dev/core';
import {
  IconArrowDownTray,
  IconBoltOutline,
  IconChartBarOutline,
  IconClockOutline,
  IconCodeBracketSolid,
  IconCubeOutline,
  IconDiagram3,
  IconFolderTree,
  IconMegaphoneMini,
  IconPhotoOutline,
} from '../components/Icons/Icons';
import type { DevtoolsTabId } from './state';

export interface DevtoolsTabConfig {
  id: DevtoolsTabId;
  title: string;
  renderIcon: () => JSXOutput;
  /** Tab requires the Vite plugin overlay and is not available in the extension. */
  viteOnly?: boolean;
}

export const devtoolsTabs: DevtoolsTabConfig[] = [
  {
    id: 'overview',
    title: 'Overview',
    renderIcon: () => <IconBoltOutline class="h-6 w-6" />,
  },
  {
    id: 'packages',
    title: 'Packages',
    renderIcon: () => <IconCubeOutline class="h-6 w-6" />,
    viteOnly: true,
  },
  {
    id: 'renderTree',
    title: 'Render Tree',
    renderIcon: () => <IconDiagram3 class="h-6 w-6" />,
  },
  {
    id: 'routes',
    title: 'Routes',
    renderIcon: () => <IconFolderTree class="h-6 w-6" />,
    viteOnly: true,
  },
  {
    id: 'assets',
    title: 'Assets',
    renderIcon: () => <IconPhotoOutline class="h-6 w-6" />,
    viteOnly: true,
  },
  {
    id: 'inspect',
    title: 'Inspect',
    renderIcon: () => <IconMegaphoneMini class="h-6 w-6" />,
    viteOnly: true,
  },
  {
    id: 'codeBreak',
    title: 'Code Break',
    renderIcon: () => <IconCodeBracketSolid class="h-6 w-6" />,
  },
  {
    id: 'performance',
    title: 'Performance',
    renderIcon: () => <IconClockOutline class="h-6 w-6" />,
  },
  {
    id: 'preloads',
    title: 'Preloads',
    renderIcon: () => <IconArrowDownTray class="h-6 w-6" />,
  },
  {
    id: 'buildAnalysis',
    title: 'Build Analysis',
    renderIcon: () => <IconChartBarOutline class="h-6 w-6" />,
    viteOnly: true,
  },
];
