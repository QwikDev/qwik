export interface Package {
  name: string;
  version: string;
  description: string;
  /**
   * Npm package.json `author` can be:
   *
   * - String: "Jane Doe [jane@example.com](mailto:jane@example.com) (https://example.com)"
   * - Object: { name, email?, url? }
   * - Missing / partial
   *
   * Runtime data may not match strict typings, so keep this permissive.
   */
  author?:
    | string
    | {
        name?: string;
        email?: string;
        url?: string;
      };
  authorAvatar?: string;
  packageAvatar?: string;
  homepage?: string;
  repository?: string;
  npmUrl?: string;
  iconUrl?: string | null;
}
