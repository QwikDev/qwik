import type { RequestEventBase } from '@builder.io/qwik-city';
import {
  createBrowserSupabaseClient,
  createServerSupabaseClient,
  type CookieOptions,
  type SupabaseClientOptionsWithoutAuth,
} from '@supabase/auth-helpers-shared';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ## Authenticated Supabase client
 * ### Loader
 *
 * ```ts
 * import { createServerClient } from '@supabase/auth-helpers-qwik';
 * import { routeLoader$ } from '@builder.io/qwik-city';
 *
 * export const useSession = routeLoader$(async (requestEv) => {
 *
 *   const supabaseClient = createServerClient(
 *     import.meta.env.PUBLIC_SUPABASE_URL,
 *     import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
 *     requestEv
 *   );
 *
 *   const { data } = await supabaseClient.from('test').select('*');
 *
 *   return {
 *     data
 *   };
 * });
 * ```
 *
 * ### Action
 *
 * ```ts
 * import { createServerClient } from '@supabase/auth-helpers-remix';
 * import { routeAction$ } from '@builder.io/qwik-city';

 * export const useaction = routeAction$(async (_, requestEv) => {
 *   const response = new Response();
 *
 *   const supabaseClient = createServerClient(requestEv);
 *
 *   const { data } = await supabaseClient.from('test').select('*');
 *
 *   return { data };
 * });
 * ```
 *
 * ### Component
 *
 * ```ts
 * import { createBrowserClient } from '@supabase/auth-helpers-remix';
 * import { useVisibleTask$ } from '@builder.io/qwik';
 *
 * useVisibleTask$(() => {
 *   const supabaseClient = createBrowserClient(
 *     import.meta.env.PUBLIC_SUPABASE_URL,
 *     import.meta.env.PUBLIC_SUPABASE_ANON_KEY
 *   );
 *
 *   const getData = async () => {
 *     const { data: supabaseData } = await supabaseClient
 *       .from('test')
 *       .select('*');
 *
 *     console.log({ data });
 *   };
 *
 *   getData();
 * }, []);
 * ```
 *
 */

export function createBrowserClient<
  Database = any,
  SchemaName extends string & keyof Database = 'public' extends keyof Database
    ? 'public'
    : string & keyof Database
>(
  supabaseUrl: string,
  supabaseKey: string,
  {
    options,
    cookieOptions,
  }: {
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>;
    cookieOptions?: CookieOptions;
  } = {}
): SupabaseClient<Database, SchemaName> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.'
    );
  }

  return createBrowserSupabaseClient<Database, SchemaName>({
    supabaseUrl,
    supabaseKey,
    options: {
      ...options,
      global: {
        ...options?.global,
        headers: {
          ...options?.global?.headers,
          'X-Client-Info': `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
        },
      },
    },
    cookieOptions,
  });
}

export function createServerClient<
  Database = any,
  SchemaName extends string & keyof Database = 'public' extends keyof Database
    ? 'public'
    : string & keyof Database
>(
  supabaseUrl: string,
  supabaseKey: string,
  requestEv: RequestEventBase,
  opts?: {
    supabaseUrl?: string;
    supabaseKey?: string;
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>;
    cookieOptions?: CookieOptions;
  }
): SupabaseClient<Database, SchemaName> {
  const options = opts?.options;
  const cookieOptions = opts?.cookieOptions;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.'
    );
  }
  return createServerSupabaseClient<Database, SchemaName>({
    supabaseUrl,
    supabaseKey,
    getRequestHeader: (key) => {
      return requestEv.request.headers.get(key) ?? undefined;
    },
    getCookie: (name) => {
      return requestEv.cookie.get(name)?.value;
    },
    setCookie(name, value, options) {
      requestEv.cookie.set(name, value, {
        ...(options as any),
        // Allow supabase-js on the client to read the cookie as well
        httpOnly: false,
      });
    },
    options: {
      ...options,
      global: {
        ...options?.global,
        headers: {
          ...options?.global?.headers,
          'X-Client-Info': `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
        },
      },
    },
    cookieOptions,
  });
}
