export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`
  ((d) => {
    const id = () => Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
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
          metadata: metadata,
          ownerId: ${JSON.stringify(props.builderApiKey)},
          sessionId: (sessionStorage["q:sId"] = sessionStorage["q:sId"] || id()),
          visitorId: (localStorage["q:vId"] = localStorage["q:vId"] || id()),
        },
      });
    };

    d.addEventListener("qsymbol", (ev) => {
      try {
        const qsymbol = ev.detail?.symbol;
        if (qsymbol && !loggedQrls.has(qsymbol)) {
          loggedQrls.add(qsymbol);
          console.debug("QSymbol", qsymbol);

          queue("qrl", {
            url: location.href,
            sinceStart: Math.round(performance.now()),
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
              queue("qperf", {
                url: location.href,
                perf: perf,
              }); 
            }

            if (navigator.connection) {
              const qconn = {};
              for (const n in navigator.connection) {
                if (navigator.connection[n] && typeof navigator.connection[n] !== "function") {
                  qconn[n] = navigator.connection[n];
                }
              }
              queue("qconn", {
                connection: qconn,
              }); 
            }

            if (navigator.userAgentData) {
              queue("quseragent", {
                userAgentData: navigator.userAgentData.toJSON()
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
