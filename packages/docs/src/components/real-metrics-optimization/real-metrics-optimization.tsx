export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`(${collectRealMetricsOptimization.toString()})(document, ${JSON.stringify(
      props.builderApiKey
    )});`}
  />
);

interface QSymbolEventPayload {
  type: string;
  data: {
    metadata: {
      url: string;
      pageId: string;
      sessionOffset: number;
      ///
      [key: string]: any;
    };
    ownerId: string;
    sessionId: string;
    visitorId: string;
  };
}

function collectRealMetricsOptimization(d: Document, builderApiKey: string, sentStats?: boolean) {
  const id = () => Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  const pageId = id();
  const sessionId = (sessionStorage['q:sId'] = sessionStorage['q:sId'] || id());
  const now = Date.now();
  const sessionStart = parseInt((sessionStorage['q:sTs'] = sessionStorage['q:sTs'] || now), 10);
  const sessionOffset = now - sessionStart;
  const visitorId = (localStorage['q:vId'] = localStorage['q:vId'] || id());
  const qEvents: QSymbolEventPayload[] = [];
  const loggedQrls = new Set();

  const send = () => {
    if (qEvents.length > 0) {
      fetch('https://cdn.builder.io/api/v1/track', {
        method: 'POST',
        body: JSON.stringify({ events: qEvents }),
        keepalive: true,
      });
      qEvents.length = 0;
    }
  };

  const queue = (type: string, metadata: Record<string, any>) => {
    qEvents.push({
      type: type,
      data: {
        metadata: {
          url: location.href,
          pageId: pageId,
          sessionOffset: sessionOffset,
          ...metadata,
        },
        ownerId: builderApiKey,
        sessionId: sessionId,
        visitorId: visitorId,
      },
    });
  };

  d.addEventListener('qsymbol', (ev) => {
    try {
      const detail = ev.detail;
      const qsymbol = detail?.symbol;
      /* eslint-disable no-console */
      console.debug('Symbol', qsymbol);
      if (qsymbol && !loggedQrls.has(qsymbol)) {
        loggedQrls.add(qsymbol);

        queue('qrl', {
          reqTime: Math.round(detail?.reqTime ?? -1),
          execTime: Math.round(performance.now()),
          qsymbol: qsymbol,
        });

        if (qEvents.length > 9) {
          send();
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  d.addEventListener('visibilitychange', () => {
    if (d.visibilityState === 'hidden') {
      try {
        if (!sentStats) {
          sentStats = true;

          const metadata = {
            perf: [] as any[],
            ua: navigator.userAgent,
            conn: {} as Record<string, any>,
          };
          const entryTypes = ['navigation', 'paint', 'longtask'];

          if (performance.getEntriesByType) {
            for (const entryTypeName of entryTypes) {
              for (const entry of performance.getEntriesByType(entryTypeName)) {
                metadata.perf.push(entry.toJSON());
              }
            }
          }

          if ('connection' in navigator && navigator.connection) {
            metadata.conn = {};
            const connection: Record<string, any> = navigator.connection;
            for (const n in navigator.connection) {
              if (connection[n] && typeof connection[n] !== 'function') {
                metadata.conn[n] = connection[n];
              }
            }
          }
          queue('qstats', metadata);
        }
        send();
      } catch (e) {
        console.error(e);
      }
    }
  });
}

interface RealMetricsOptimizationProps {
  builderApiKey: string;
}
