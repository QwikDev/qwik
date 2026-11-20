import { z } from 'zod';

function relativePath(path: string): string | null {
  const normalized = path.replace(/^\.\//, '').replace(/\/$/, '');
  const hasControlCharacter = [...normalized].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
  );
  if (path.startsWith('/') || /[\\%:?#]/.test(normalized) || hasControlCharacter) {
    return null;
  }
  if (normalized && normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    return null;
  }
  return normalized;
}

export const SourceSettings = z.object({
  repository: z
    .string()
    .trim()
    .max(300)
    .transform((url) => url.replace(/\/$/, '').replace(/\.git$/, ''))
    .refine(
      (url) =>
        !url ||
        (/^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(url) &&
          !url.endsWith('/..') &&
          !url.endsWith('/.')),
      'Use a GitHub repository URL, such as https://github.com/owner/repo.'
    ),
  revision: z
    .string()
    .trim()
    .min(1, 'Enter a branch, tag, or commit.')
    .max(200)
    .refine(
      (revision) =>
        /^[a-zA-Z0-9_./+-]+$/.test(revision) &&
        !revision.includes('..') &&
        relativePath(revision) === revision,
      'Enter a valid branch, tag, or commit.'
    ),
  sourceRoot: z
    .string()
    .trim()
    .max(500)
    .refine((path) => relativePath(path) !== null, 'Use a relative directory without .. segments.')
    .transform((path) => relativePath(path)!),
});
export type SourceSettings = z.infer<typeof SourceSettings>;

export function sourceUrls(settings: SourceSettings, origin: string) {
  const parsed = SourceSettings.safeParse(settings);
  const path = relativePath(origin);
  if (!parsed.success || !parsed.data.repository || !path) {
    return null;
  }
  const { repository, revision, sourceRoot } = parsed.data;
  const file = [sourceRoot, path]
    .filter(Boolean)
    .join('/')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const ref = encodeURIComponent(revision);
  return {
    raw: `https://raw.githubusercontent.com/${repository.slice('https://github.com/'.length)}/${ref}/${file}`,
    browser: `${repository}/blob/${ref}/${file}`,
  };
}
