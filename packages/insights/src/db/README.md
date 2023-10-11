Debugging SQLite responses:

```
curl https://qwik-bundalyzer-mhevery.turso.io/v2/pipeline \
  -d '{"requests":[{"type": "execute", "stmt": {"sql": "'$QUERY'"}}]}'
  -H "Authorization: Bearer $PRIVATE_LIBSQL_DB_API_TOKEN"
```
