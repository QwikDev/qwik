export function getCodeLanguage(pathId: string) {
  if (pathId.endsWith('.js')) {
    return 'js';
  }
  if (pathId.endsWith('.ts')) {
    return 'ts';
  }
  if (pathId.endsWith('.jsx')) {
    return 'jsx';
  }
  if (pathId.endsWith('.tsx')) {
    return 'tsx';
  }
  return 'tsx';
}
