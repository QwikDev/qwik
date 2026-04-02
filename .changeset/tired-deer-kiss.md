---
'@qwik.dev/core': minor
---

FEAT: `<Suspense />` allows out-of-order rendering of nested content. If the content is not ready to be rendered, a placeholder is rendered instead. When the content is ready, it streams to the client and replaces the placeholder.

Example:

```tsx
import { component$, Suspense } from '@qwik.dev/core';

export const MyComponent = component$(() => {
	return (
		<div>
			<Suspense fallback={<div>Loading...</div>}>
				<NestedComponent />
			</Suspense>
		</div>
	);
});
```
