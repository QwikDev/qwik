import { type QwikVitePluginOptions } from '@builder.io/qwik/optimizer';

export async function insightsEntryStrategy({
  publicApiKey,
}: {
  publicApiKey: string;
}): Promise<QwikVitePluginOptions['entryStrategy']> {
  const request = await fetch(`https://qwik-insights.builder.io/api/v1/${publicApiKey}/bundles/`);
  const bundles = await request.json();
  return {
    type: 'smart',
    manual: bundles,
  } as any;
}
