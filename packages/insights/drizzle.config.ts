import { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

export const PRIVATE_LIBSQL_DB_URL = process.env.PRIVATE_LIBSQL_DB_URL!;
export const PRIVATE_LIBSQL_DB_API_TOKEN = process.env.PRIVATE_LIBSQL_DB_API_TOKEN!;
const isLocalDB = PRIVATE_LIBSQL_DB_URL.startsWith('ws://');

const local: Config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: PRIVATE_LIBSQL_DB_URL,
  },
};

const prod: Config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: PRIVATE_LIBSQL_DB_URL,
    authToken: PRIVATE_LIBSQL_DB_API_TOKEN,
  },
};
console.log('Drizzle config:', isLocalDB ? 'local' : 'prod');
export default isLocalDB ? local : prod;
