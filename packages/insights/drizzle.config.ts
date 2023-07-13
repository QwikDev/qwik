import { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

export const PRIVATE_LIBSQL_DB_URL = process.env.PRIVATE_LIBSQL_DB_URL!;
export const PRIVATE_LIBSQL_DB_API_TOKEN = process.env.PRIVATE_LIBSQL_DB_API_TOKEN!;
const isLocalDB = PRIVATE_LIBSQL_DB_URL.startsWith('ws://');

export default (isLocalDB
  ? {
      schema: './src/db/schema.ts',
      out: './drizzle',
      driver: 'libsql',
      dbCredentials: {
        url: PRIVATE_LIBSQL_DB_URL,
      },
    }
  : {
      schema: './src/db/schema.ts',
      out: './drizzle',
      driver: 'turso',
      dbCredentials: {
        url: PRIVATE_LIBSQL_DB_URL,
        authToken: PRIVATE_LIBSQL_DB_API_TOKEN,
      },
    }) satisfies Config;
