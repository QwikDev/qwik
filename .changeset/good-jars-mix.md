---
'@builder.io/qwik': minor
---

CHORE: Prepare backwards compatibility for V1 libraries in V2.

We move internal fields `immutableProps` and `flags` out of JSXNode as they are not meant for public use.

This will allow projects using older V1 libraries to continue to work with the Qwik V2 by adding the following `package.json` changes:

```json
{
  "dependencies": {
    "@builder.io/qwik": "^1.11.0",
    "@qwik.dev/core": "^2.0.0"
  }
}
```

And will prevent typescript errors when using libraries which haven't upgraded to V2 yet.
