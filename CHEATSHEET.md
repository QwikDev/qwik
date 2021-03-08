# Cheat sheet

Special attributes in the HTML

1. always contain `:` characters to make them less likely to collide with existing attributes.
2. Consists of a key as seen in a table
3. Have a value that evaluates according to the table.

## QRL

| Syntax             | Meaning                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `./path`           | URL => results in an import of code from the URL <div> `(await import('./path.js')).default.call(injector) `</div>                  |
| `key:/path`        | URL => results in an import of code from the URL <div> `(await import(CONFIG.protocol[key] + '/path.js')).default(injector) `</div> |
| `./path.foo`       | URL => results in an import of code from the URL <div> `(await import('./path.js')).foo(injector) `</div>                           |
| `./path?key=value` | URL => results in an import of code from the URL <div> `(await import('./path.js')).default(injector) `</div>                       |

## Events

| Syntax               | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `on:name="url"`      | If `event` is detected than `import(url)` and call `default` function                                                             |
| `bind:key="attr"`    | Data with `key` is bound to `attr`. NOTE: Key/value is reversed so that it is easy to query for all of the data bindings by `key` |
| `data:key=JSON`      | Serialized data for `key`                                                                                                         |
| `provide:token:=QRL` | Provider of `token`                                                                                                               |
| `::=QRL`             | Component definition. `QRL` points to the template.                                                                               |
| `:.=JSON`            | Component state.                                                                                                                  |
