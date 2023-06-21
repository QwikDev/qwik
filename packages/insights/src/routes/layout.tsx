import { Slot, component$ } from '@builder.io/qwik';
import { type RequestHandler } from '@builder.io/qwik-city';
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql';
import { initializeDbIfNeeded } from '../db';

export const onRequest: RequestHandler = async ({ env }) => {
  await initializeDbIfNeeded(async () =>
    drizzle(
      createClient({
        url: env.get('PRIVATE_LIBSQL_DB_URL')!,
        authToken: env.get('PRIVATE_LIBSQL_DB_API_TOKEN')!,
      })
    )
  );
};

export default component$(() => {
  return <Slot />;
});
