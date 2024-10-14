# Qwik Insights

## Local Development

Ensure you have `.env.local` set up like so:

```
PRIVATE_LIBSQL_DB_URL=ws://127.0.0.1:8080
PRIVATE_LIBSQL_DB_API_TOKEN=(none)
PRIVATE_AUTH_BASE_API=/api/auth
```

```sh
npm run db.local
```

in another window

```sh
npm run db.migrate
```

### Local Development with

If you would like to run the application with production database set up `.env.local` like so:

```
PRIVATE_LIBSQL_DB_URL=libsql://qwik-bundalyzer-mhevery.turso.io
PRIVATE_LIBSQL_DB_API_TOKEN=<API_TOKEN>
PRIVATE_AUTH_SECRET=<AUTH_SECRET>
PRIVATE_AUTH_BASE_API=/api/auth
```

You need two pieces of information:

- `AUTH_SECRET`:
  - run `turso auth login` to authenticate
  - run `turso auth api-tokens mint insights-<you-username>` to get a new token
- `API_TOKEN`: This is needed for using github as authentication. See: https://qwik.dev/docs/integrations/authjs/#github
