import type { RequestEventBase } from "@builder.io/qwik-city";
import { createClient, type Client } from "@libsql/client";

export function tursoClient(requestEvent: RequestEventBase): Client {
  const url = requestEvent.env.get("PRIVATE_TURSO_DATABASE_URL")?.trim();
  if (url === undefined) {
    throw new Error("PRIVATE_TURSO_DATABASE_URL is not defined");
  }

  const authToken = requestEvent.env.get("PRIVATE_TURSO_AUTH_TOKEN")?.trim();
  if (authToken === undefined) {
    if (!url.includes("file:")) {
      throw new Error("PRIVATE_TURSO_AUTH_TOKEN is not defined");
    }
  }

  return createClient({
    url,
    authToken,
  });
}
