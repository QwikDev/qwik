import type { RequestEventCommon } from "@builder.io/qwik-city";
import { createClient, type Client } from "@libsql/client/web";

export function tursoClient(requestEvent: RequestEventCommon): Client {
  const url = requestEvent.env.get("TURSO_DB_URL")?.trim();
  if (url === undefined) {
    throw new Error("TURSO_DB_URL is not defined");
  }

  const authToken = requestEvent.env.get("TURSO_DB_AUTH_TOKEN")?.trim();
  if (authToken === undefined) {
    if (!url.includes("file:")) {
      throw new Error("TURSO_DB_AUTH_TOKEN is not defined");
    }
  }

  return createClient({
    url,
    authToken,
  });
}
