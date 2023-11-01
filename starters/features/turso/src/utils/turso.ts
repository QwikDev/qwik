import type { RequestEventCommon } from "@builder.io/qwik-city";
import { createClient, type Client } from "@libsql/client/web";

export function tursoClient(env: RequestEventCommon["env"]): Client {
  const url = env.get("PRIVATE_TURSO_DB_URL")?.trim();
  if (url === undefined) {
    throw new Error("PRIVATE_TURSO_DB_URL is not defined");
  }

  const authToken = env.get("PRIVATE_TURSO_DB_AUTH_TOKEN")?.trim();
  if (authToken === undefined) {
    if (!url.includes("file:")) {
      throw new Error("PRIVATE_TURSO_DB_AUTH_TOKEN is not defined");
    }
  }

  return createClient({
    url,
    authToken,
  });
}
