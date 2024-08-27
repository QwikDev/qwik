import type { AwaitingRequests } from './types';

export const qBuildCacheName = 'QwikBuild';

export const existingPrefetchUrls = new Set<string>();

export const awaitingRequests: AwaitingRequests = new Map();

export const prefetchQueue: string[] = [];
