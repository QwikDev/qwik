import type { RequestEventCommon } from "@builder.io/qwik-city";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseMapKey = "__supabase";

export const createSupabase = (event: RequestEventCommon): SupabaseClient => {
  const cached = event.sharedMap.get(supabaseMapKey);

  if (cached) {
    return cached;
  }

  const url = event.env.get("PUBLIC_SUPABASE_URL");
  const key = event.env.get("PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !key) {
    throw new Error("NO ENV VARIABLES");
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  event.sharedMap.set(supabaseMapKey, client);

  return client;
};
