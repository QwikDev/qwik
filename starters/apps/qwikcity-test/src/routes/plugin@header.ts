import { routeLoader$, type RequestHandler } from "@builder.io/qwik-city";

export const useRootLoader = routeLoader$(() => {
  return {
    serverTime: new Date(),
    reg: new RegExp(""),
    nu: Infinity,
    nodeVersion: process.version,
  };
});

export const onRequest: RequestHandler = ({ headers, url, json }) => {
  headers.set("X-Qwik", "handled");
  if (url.pathname === "/qwikcity-test/virtual/auth") {
    json(200, {
      message: "handled",
    });
  }
};
