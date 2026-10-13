export function isLoopback(address: string | undefined) {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}
