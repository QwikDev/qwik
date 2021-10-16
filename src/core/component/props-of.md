Infers `Props` from `QComponent`.

Given:

```
type MyComponent = qComponent<{propA: string}>({...});
```

Then:

```
const myProps: PropsOf<typeof MyComponent> = ...; // Same as `{propA: string}`
```
