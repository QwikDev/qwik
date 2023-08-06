import type { RequestHandler } from "@builder.io/qwik-city";
import os from "node:os";
import url from "node:url";
import path from "node:path";
import fs from "node:fs";

export const onRequest: RequestHandler = ({
  request,
  headers,
  query,
  sharedMap,
  json,
  html,
  send,
  getWritableStream,
  status,
}) => {
  const format = query.get("format");

  if (format === "img") {
    const faviconPath = path.join(
      path.dirname(url.fileURLToPath(import.meta.url)),
      "..",
      "public",
      "favicon.ico",
    );

    status(200);
    headers.set("Content-Type", "image/x-icon");

    const writer = getWritableStream().getWriter();
    fs.createReadStream(faviconPath)
      .on("data", (chunk) => {
        writer.write(chunk as any);
      })
      .on("end", () => {
        writer.close();
      });

    return;
  }

  if (format === "csv") {
    status(203);
    headers.set("Content-Type", "text/plain");
    const { writable, readable } = new TextEncoderStream();
    readable.pipeTo(getWritableStream());
    const stream = writable.getWriter();
    setTimeout(() => {
      stream.write(csvLine(0));
      setTimeout(() => {
        stream.write(csvLine(1));
        setTimeout(() => {
          stream.write(csvLine(2));
          stream.close();
        }, 500);
      }, 500);
    }, 500);
    return;
  }

  if (format === "text") {
    headers.set("Content-Type", "text/plain");
    send(202, format + " " + request.method + " " + new Date().toISOString());
    return;
  }

  if (format === "html") {
    html(201, format + " " + request.method + " " + new Date().toISOString());
    return;
  }

  json(200, {
    shared: sharedMap.get("root") ?? "not set",
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  });
};

function csvLine(num: number) {
  let l = String(num);
  while (l.length < 18000) {
    l += "," + new Date().toISOString();
  }
  return l + "\n";
}
