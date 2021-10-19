Infers `State` from `QComponent`.

Given:

```
type MyComponent = qComponent<{}, {propA: string}>({...});
```

Then:

```
const myState: StateOf<typeof MyComponent> = ...; // Same as `{propA: string}`
```

@public
