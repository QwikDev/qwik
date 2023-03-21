export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`
  ((d, sentStats) => {
    const id = () => Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const pageId = id();
    const sessionId = (sessionStorage["q:sId"] = sessionStorage["q:sId"] || id());
    const now = Date.now();
    const sessionStart = parseInt((sessionStorage["q:sTs"] = sessionStorage["q:sTs"] || now), 10);
    const sessionOffset = now - sessionStart;
    const visitorId = (localStorage["q:vId"] = localStorage["q:vId"] || id());
    const qEvents = [];
    const loggedQrls = new Set();

    const send = () => {
      if (qEvents.length > 0) {
        fetch("https://cdn.builder.io/api/v1/track", {
          method: "POST",
          body: JSON.stringify({ events: qEvents }),
          keepalive: true,
        });
        qEvents.length = 0;
      }

    };

    const queue = (type, metadata) => {
      qEvents.push({
        type: type,
        data: {
          metadata: {
            url: location.href,
            pageId: pageId,
            sessionOffset: sessionOffset,
            ...metadata
          },
          ownerId: ${JSON.stringify(props.builderApiKey)},
          sessionId: sessionId,
          visitorId: visitorId
        },
      });
    };

    d.addEventListener("qsymbol", (ev) => {
      try {
        const detail = ev.detail;
        const qsymbol = detail?.symbol;
        console.debug('Symbol', qsymbol);
        if (qsymbol && !loggedQrls.has(qsymbol)) {
          loggedQrls.add(qsymbol);

          queue("qrl", {
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

    d.addEventListener("visibilitychange", () => {
      if (d.visibilityState === "hidden") {
        try {
          if (!sentStats) {
            sentStats = true;

            const metadata = {
              perf: [],
              ua: navigator.userAgent,
            };
            const entryTypes = ["navigation", "paint", "longtask"];

            if (performance.getEntriesByType) {
              for (const entryTypeName of entryTypes) {
                for (const entry of performance.getEntriesByType(entryTypeName)) {
                  metadata.perf.push(entry.toJSON());
                }
              }
            }

            if (navigator.connection) {
              metadata.conn = {};
              for (const n in navigator.connection) {
                if (navigator.connection[n] && typeof navigator.connection[n] !== "function") {
                  metadata.conn[n] = navigator.connection[n];
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
  })(document);
`}
  />
);

interface RealMetricsOptimizationProps {
  builderApiKey: string;
}
