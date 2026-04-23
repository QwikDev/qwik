export interface Package {
  name: string;
  version: string;
  description: string;
  /**
   * npm package.json `author` can be:
   * - string: "Jane Doe <jane@example.com> (https://example.com)"
   * - object: { name, email?, url? }
   * - missing / partial
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
