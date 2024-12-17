import { PluginOption } from 'vite';

export declare function qwikInsights(qwikInsightsOpts: {
  publicApiKey: string;
  baseUrl?: string;
  outDir?: string;
}): Promise<PluginOption>;
