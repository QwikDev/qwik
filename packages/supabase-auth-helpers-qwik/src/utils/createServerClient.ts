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
