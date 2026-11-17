export function getDevIdentity(isDevelopment: boolean, url: URL, email?: string): string | null {
  if (!isDevelopment || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return null;
  }
  return email?.trim() || null;
}
