import { type RequestHandler } from '@builder.io/qwik-city';
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql';
import { type AppDatabase, initializeDbIfNeeded } from '~/db';

export const onRequest: RequestHandler = async ({ env }) => {
  const url = env.get('PRIVATE_LIBSQL_DB_URL')!;
  const authToken = env.get('PRIVATE_LIBSQL_DB_API_TOKEN')!;
  await initializeDbIfNeeded(initLibSql(url, authToken));
};

const LOG_QUERY: boolean = false;

function initLibSql(url: string, authToken: string): () => Promise<AppDatabase> {
  return async () =>
    drizzle(
      createClient({
        url,
        authToken,
      }),
      LOG_QUERY
        ? {
            logger: {
              logQuery(query: string, params: unknown[]): void {
                console.debug('___QUERY___');
                console.debug(query);
                console.debug(params);
                console.debug('___END_QUERY___');
              },
            },
          }
        : undefined
    );
}
