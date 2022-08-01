const useHooks$ = [
  'useWatch$',
  'useServerMount$',
  'useMount$',
  'useClientEffect$',
  'useCleanup$',
  'useStyles$',
  'useScopedStyles$',
  'useResource$',
];

export const isUseFunction = (string: string) => {
  return useHooks$.includes(string);
};
