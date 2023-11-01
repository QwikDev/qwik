import type { RequestEventBase } from '@builder.io/qwik-city';
import type {
  CookieOptionsWithName,
  SupabaseClientOptionsWithoutAuth,
} from '@supabase/auth-helpers-shared';
import {
  BrowserCookieAuthStorageAdapter,
  createSupabaseClient,
} from '@supabase/auth-helpers-shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenericSchema } from '@supabase/supabase-js/dist/module/lib/types';
import { QwikServerAuthStorageAdapter } from './storageAdapter';

export function createBrowserClient<
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
  {
    options,
    cookieOptions,
  }: {
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>;
    cookieOptions?: CookieOptionsWithName;
  } = {}
): SupabaseClient<Database, SchemaName, Schema> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.'
    );
  }

  return createSupabaseClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, {
    ...options,
    global: {
      ...options?.global,
      headers: {
        ...options?.global?.headers,
        'X-Client-Info': 'supabase-auth-helpers-qwik@0.0.3',
      },
    },
    auth: {
      storageKey: cookieOptions?.name,
      storage: new BrowserCookieAuthStorageAdapter(cookieOptions),
    },
  });
}

/**
 * ## Authenticated Supabase client
 *
 * ### Loader
 *
 * ```ts
 * import { createServerClient } from '@supabase/auth-helpers-qwik';
 * import { routeLoader$ } from '@builder.io/qwik-city';
 *
 * export const useSession = routeLoader$(async (requestEv) => {
 *   const supabaseClient = createServerClient(
 *     import.meta.env.PUBLIC_SUPABASE_URL,
 *     import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
 *     requestEv
 *   );
 *
 *   const { data } = await supabaseClient.from('test').select('*');
 *
 *   return {
 *     data,
 *   };
 * });
 * ```
 *
 * ### Action
 *
 * ```ts
 * import { createServerClient } from '@supabase/auth-helpers-remix';
 * import { routeAction$ } from '@builder.io/qwik-city';
 *
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
 *     const { data: supabaseData } = await supabaseClient.from('test').select('*');
 *
 *     console.log({ data });
 *   };
 *
 *   getData();
 * }, []);
 * ```
 */
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
  opts?: {
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>;
    cookieOptions?: CookieOptionsWithName;
  }
): SupabaseClient<Database, SchemaName, Schema> {
  const options = opts?.options;
  const cookieOptions = opts?.cookieOptions;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'supabaseUrl and supabaseKey are required to create a Supabase client! Find these under `Settings` > `API` in your Supabase dashboard.'
    );
  }

  return createSupabaseClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, {
    ...options,
    global: {
      ...options?.global,
      headers: {
        ...options?.global?.headers,
        'X-Client-Info': 'supabase-auth-helpers-qwik@0.0.3',
      },
    },
    auth: {
      storageKey: cookieOptions?.name,
      storage: new QwikServerAuthStorageAdapter(requestEv, cookieOptions),
    },
  });
}
