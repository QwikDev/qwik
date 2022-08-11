import { normalizePath } from '../../buildtime/utils/fs';
import type { NormalizedStaticGeneratorOptions, StaticGeneratorOptions } from './types';

export function normalizeOptions(input: StaticGeneratorOptions | undefined) {
  const output: NormalizedStaticGeneratorOptions = { ...input } as any;

  output.ourDir = normalizePath(output.ourDir);

  const baseUrl = new URL(output.baseUrl);
  baseUrl.hash = '';
  baseUrl.search = '';
  output.baseUrl = baseUrl.href;

  if (!Array.isArray(output.urls)) {
    output.urls = [output.baseUrl];
  }
  output.urls = output.urls
    .map((url) => normalizePathname(url, baseUrl)!)
    .filter((url) => typeof url === 'string');

  if (typeof output.crawl !== 'boolean') {
    output.crawl = true;
  }

  if (typeof output.maxTasksPerWorker !== 'number') {
    output.maxTasksPerWorker = MAX_TASKS_PER_WORKER;
  }

  return output;
}

const MAX_TASKS_PER_WORKER = 12;

export function normalizePathname(url: string, baseUrl: URL) {
  if (typeof url === 'string') {
    try {
      const u = new URL(url, baseUrl);
      if (u.origin === baseUrl.origin) {
        return u.pathname;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}
