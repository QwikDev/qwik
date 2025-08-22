export default {
  versionGroups: [
    {
      label: 'Be lenient in vite versions for prod. v4 is broken, v5 is good',
      dependencyTypes: ['prod', 'peer'],
      dependencies: ['vite'],
      pinVersion: '>=5 <8',
    },
    {
      label:
        'use workspace protocol for local packages and allow patch versions (used in e.g. qwik-react)',
      dependencies: ['$LOCAL'],
      dependencyTypes: ['!local', '!dev'],
      pinVersion: 'workspace:^',
    },
    {
      label:
        'dev: use workspace protocol for local packages - split from prod and peer version group',
      dependencies: ['$LOCAL'],
      dependencyTypes: ['dev'],
      pinVersion: 'workspace:^',
    },
    {
      label: 'Separate prod deps from dev deps',
      dependencyTypes: ['prod', 'peer'],
    },
    {
      label: 'Playwright should have the same version as in flake.nix',
      dependencies: ['@playwright/test'],
      dependencyTypes: ['dev'],
      pinVersion: '1.50.1',
    },
  ],
  semverGroups: [
    {
      label: 'Undici should always be * until we remove it',
      dependencies: ['undici'],
      range: '*',
    },
    {
      label: 'use exact version numbers for devDependencies',
      dependencyTypes: ['dev'],
      range: '',
    },
  ],
} satisfies import('syncpack').RcFile;
