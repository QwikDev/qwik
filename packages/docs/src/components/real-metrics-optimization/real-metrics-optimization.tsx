export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`
  ((d) => {
    const id = () =>
      Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const sessionId = (sessionStorage["q:sId"] =
      sessionStorage["q:sId"] || id());
    const visitorId = (localStorage["q:vId"] = localStorage["q:vId"] || id());
    const qEvents = [];
    const logged = new Set();

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

    d.addEventListener("qsymbol", (ev) => {
      try {
        const qsymbol = ev.detail?.symbol;
        if (qsymbol && !logged.has(qsymbol)) {
          logged.add(qsymbol);
          console.debug("QSymbol", qsymbol);

          qEvents.push({
            type: "qrl",
            data: {
              metadata: {
                url: location.href,
                sinceStart: Math.round(performance.now()),
                qsymbol: qsymbol,
              },
              ownerId: ${JSON.stringify(props.builderApiKey)},
              sessionId: sessionId,
              visitorId: visitorId,
            },
          });

          if (qEvents.length > 9) {
            send();
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

    let sentPerf = false;

    d.addEventListener("visibilitychange", () => {
      if (d.visibilityState === "hidden") {
        try {
          if (!sentPerf && performance.getEntriesByType) {
            sentPerf = true;

            const perf = [];
            const entryTypes = ["navigation", "paint", "longtask"];

            for (const entryTypeName of entryTypes) {
              for (const entry of performance.getEntriesByType(entryTypeName)) {
                perf.push(entry.toJSON());
              }
            }

            if (perf.length > 0) {
              qEvents.push({
                type: "qperf",
                data: {
                  metadata: {
                    url: location.href,
                    perf: perf,
                  },
                  ownerId: ${JSON.stringify(props.builderApiKey)},
                  sessionId: sessionId,
                  visitorId: visitorId,
                },
              });
            }
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
