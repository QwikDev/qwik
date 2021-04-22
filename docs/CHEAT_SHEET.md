# Cheat sheet

Special attributes in the HTML

1. always contain `:` characters to make them less likely to collide with existing attributes.
2. Consists of a key as seen in a table
3. Have a value that evaluates according to the table.

| Syntax              | Meaning                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `:`                 | Marker which signifies that the element has injector                                                                              |
| `on:<name>="<QRL>"` | If `event` is detected than `import(url)` and call `default` function                                                             |
| `bind:<key>="attr"` | Data with `key` is bound to `attr`. NOTE: Key/value is reversed so that it is easy to query for all of the data bindings by `key` |
| `::name=QRL`        | Service definition. `QRL` points to the `Service`.                                                                                |
| `::=QRL`            | Component render `QRL` points to the template.                                                                                    |
| `key:=JSON`         | Serialized data for `key` `Service`.                                                                                              |
| `:.=JSON`           | Component state.                                                                                                                  |

## QRL

| Syntax             | Meaning                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `./path`           | URL => results in an import of code from the URL <div> `(await import('./path.js')).default.call(injector) `</div>                  |
| `key:/path`        | URL => results in an import of code from the URL <div> `(await import(CONFIG.protocol[key] + '/path.js')).default(injector) `</div> |
| `./path.foo`       | URL => results in an import of code from the URL <div> `(await import('./path.js')).foo(injector) `</div>                           |
| `./path?key=value` | URL => results in an import of code from the URL <div> `(await import('./path.js')).default(injector) `</div>                       |
