export default {
  baseDir: './dist-dev/tsc-out',
  groups: [
    {
      path: 'packages/create-qwik/dist/**',
    },
    {
      path: 'packages/qwik/dist/**',
    },
    {
      path: 'packages/qwik-auth/lib/**',
    },
    {
      path: 'packages/qwik-city/lib/**',
    },
    {
      path: 'packages/qwik-react/lib/**',
    },
    {
      path: 'packages/qwik-worker/lib/**',
    },
    {
      path: 'packages/supabase-auth-helpers-qwik/lib/**',
    },
  ],
};
