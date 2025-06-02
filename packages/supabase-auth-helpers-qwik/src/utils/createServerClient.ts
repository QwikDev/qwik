import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient as serverClient } from '@supabase/ssr';
import type { CookieMethodsBrowser, CookieOptionsWithName } from '@supabase/ssr';
import type {
  GenericSchema,
  SupabaseClientOptions,
} from '@supabase/supabase-js/dist/module/lib/types';
import type { RequestEventBase } from 'packages/qwik-city/lib';

export function createServerClient<
  Database = any,
  SchemaName extends string & keyof Database = 'public' extends keyof Database
    ? 'public'
    : string & keyof Database,
  Schema extends GenericSchema = Database[SchemaName] extends GenericSchema
    ? Database[SchemaName]
    : any,
>(
  supabaseUrl: string,
  supabaseKey: string,
  requestEv: RequestEventBase,
  options?: SupabaseClientOptions<SchemaName> & {
    cookies?: CookieMethodsBrowser;
    cookieOptions?: CookieOptionsWithName;
    cookieEncoding?: 'raw' | 'base64url';
    isSingleton?: boolean;
  }
): SupabaseClient<Database, SchemaName, Schema> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.'
    );
  }

  return serverClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, {
    ...options,
    global: {
      ...options?.global,
      headers: {
        ...options?.global?.headers,
        'X-Client-Info': 'supabase-auth-helpers-qwik@0.0.3',
      },
    },
    auth: {
      storageKey: options?.cookieOptions?.name,
    },
    cookies: {
      getAll: () => {
        const cookies = requestEv.cookie.getAll();
        return Object.keys(cookies).map((name) => {
          return { name, value: cookies[name].value };
        });
      },
      setAll: (cookies) => {
        cookies.map((cookie) => {
          requestEv.cookie.set(cookie.name, cookie.value, cookie.options);
        });
      },
    },
  });
}
