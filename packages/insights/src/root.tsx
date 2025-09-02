import { component$ } from '@qwik.dev/core';
import { Insights } from '@qwik.dev/core/insights';
import {
  DocumentHeadTags,
  RouterOutlet,
  useDocumentHead,
  useLocation,
  useQwikRouter,
  z,
} from '@qwik.dev/router';
import './global.css';

export const InsightsError = /* @__PURE__ */ z.object({
  manifestHash: z.string(),
  url: z.string(),
  timestamp: z.number(),
  source: z.string(),
  line: z.number(),
  column: z.number(),
  message: z.string(),
  error: z.string(),
  stack: z.string(),
});

export const InsightSymbol = /* @__PURE__ */ z.object({
  symbol: z.string(),
  route: z.string(),
  delay: z.number(),
  latency: z.number(),
  timeline: z.number(),
  interaction: z.boolean(),
});

export const InsightsPayload = /* @__PURE__ */ z.object({
  qVersion: z.string(),
  manifestHash: z.string(),
  publicApiKey: z.string(),
  // we retain nullable for older clients
  previousSymbol: z.string().optional().nullable(),
  symbols: z.array(InsightSymbol),
});

export default component$(() => {
  useQwikRouter();
  const loc = useLocation();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <link rel="manifest" href="/manifest.json" />

        <DocumentHeadTags />

        <link rel="canonical" href={loc.url.href} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

        <Insights />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});
