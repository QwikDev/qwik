/**
 * @alpha
 */
export class CacheControl {
  private policies: string[] = [];
  constructor(private headers: Headers) {}

  /**
   * The max-age=N response directive indicates that the response remains fresh until N seconds after the response is generated.
   * Note that max-age is not the elapsed time since the response was received; it is the elapsed time since the response was generated on the origin server. So if the other cache(s) — on the network route taken by the response — store the response for 100 seconds (indicated using the Age response header field), the browser cache would deduct 100 seconds from its freshness lifetime.
   */
  maxAge(seconds: number) {
    return this.set(`max-age=${seconds}`);
  }

  /**
   * The s-maxage response directive also indicates how long the response is fresh for (similar to max-age) — but it is specific to shared caches, and they will ignore max-age when it is present.
   */
  sMaxAge(seconds: number) {
    return this.set(`max-age=${seconds}`);
  }

  /**
   * The stale-while-revalidate response directive indicates that the cache could reuse a stale response while it revalidates it to a cache.
   */
  staleWhileRevalidate(seconds: number) {
    return this.set(`stale-while-revalidate=${seconds}`);
  }

  /**
   * The no-store response directive indicates that any caches of any kind (private or shared) should not store this response.
   */
  noStore() {
    return this.set(`no-store`);
  }

  /**
   * The no-cache response directive indicates that the response can be stored in caches, but the response must be validated with the origin server before each reuse, even when the cache is disconnected from the origin server.
   */
  noCache() {
    return this.set(`no-cache`);
  }

  /**
   * The public response directive indicates that the response can be stored in a shared cache.
   * Responses for requests with Authorization header fields must not be stored in a shared cache; however, the public directive will cause such responses to be stored in a shared cache.
   */
  public() {
    return this.set(`public`);
  }

  /**
   * The private response directive indicates that the response can be stored only in a private cache (e.g. local caches in browsers).
   * You should add the private directive for user-personalized content, especially for responses received after login and for sessions managed via cookies.
   * If you forget to add private to a response with personalized content, then that response can be stored in a shared cache and end up being reused for multiple users, which can cause personal information to leak.
   */
  private() {
    return this.set(`private`);
  }

  /**
   * The immutable response directive indicates that the response will not be updated while it's fresh.
   *
   * A modern best practice for static resources is to include version/hashes in their URLs, while never modifying the resources — but instead, when necessary, updating the resources with newer versions that have new version-numbers/hashes, so that their URLs are different. That's called the cache-busting pattern.
   */
  immutable() {
    return this.set(`immutable`);
  }

  set(policy: string) {
    this.policies.push(policy);
    this.headers.set('Cache-Control', this.policies.join(', '));
    return this;
  }
}
