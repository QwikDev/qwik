import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBrowserClient as browserClient,
  type CookieMethodsBrowser,
  type CookieOptionsWithName,
} from "@supabase/ssr";
import type {
  GenericSchema,
  SupabaseClientOptions,
} from "@supabase/supabase-js/dist/module/lib/types";

export function createBrowserClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
  Schema extends GenericSchema = Database[SchemaName] extends GenericSchema
    ? Database[SchemaName]
    : any,
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<SchemaName> & {
    cookies?: CookieMethodsBrowser;
    cookieOptions?: CookieOptionsWithName;
    cookieEncoding?: "raw" | "base64url";
    isSingleton?: boolean;
  },
): SupabaseClient<Database, SchemaName, Schema> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.",
    );
  }

  return browserClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, {
    ...options,
    global: {
      ...options?.global,
      headers: {
        ...options?.global?.headers,
        "X-Client-Info": "supabase-auth-helpers-qwik@0.0.3",
      },
    },
    auth: {
      storageKey: options?.cookieOptions?.name,
    },
  });
}
