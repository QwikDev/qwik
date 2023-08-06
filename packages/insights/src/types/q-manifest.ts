import { z } from 'zod';

export const QManifestSymbol = z.object({
  origin: z.string(),
  displayName: z.string(),
  canonicalFilename: z.string(),
  hash: z.string(),
  ctxKind: z.string(),
  ctxName: z.string(),
  captures: z.boolean(),
  loc: z.array(z.number()),
});

export const QManifestBundle = z.object({
  size: z.number(),
  imports: z.array(z.string()).optional(),
  origins: z.array(z.string()).optional(),
});

export const QManifestInjection = z.object({
  tag: z.string(),
  location: z.string(),
  attributes: z.record(z.string(), z.string()),
});

export const QManifestOptions = z.object({
  target: z.string(),
  // buildModule: z.string(),
  // forceFullBuild: z.boolean(),
  entryStrategy: z.object({
    type: z.string(),
  }),
});

export const QManifestPlatform = z.object({
  qwik: z.string(),
  vite: z.string(),
  rollup: z.string(),
  env: z.string(),
  os: z.string(),
  node: z.string(),
});

export const QManifest = z.object({
  manifestHash: z.string(),
  symbols: z.record(z.string(), QManifestSymbol),
  mapping: z.record(z.string(), z.string()),
  bundles: z.record(z.string(), QManifestBundle),
  injections: z.array(QManifestInjection),
  version: z.string(),
  options: QManifestOptions,
  platform: QManifestPlatform,
});
