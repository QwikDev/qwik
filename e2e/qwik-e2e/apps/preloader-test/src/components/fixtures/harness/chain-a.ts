export const runA = async () => (await import('./chain-b')).runB();
