---
'@builder.io/qwik': minor
---

Async functions in `useComputed$` are deprecated.

**Why?**

- Qwik can't track used signals after the first await, which leads to subtle bugs.
- When calculating the first time, it will see it's a promise and it will restart the render function.
- Both `useTask$` and `useResource$` are available, without these problems.

In v2, async functions won't work.

Again, to get the same functionality use `useTask$` or `useResource$` instead, or this function:

```tsx
export const useAsyncComputed$ = (qrlFn: QRL<() => Promise<any>>) => {
  const sig = useSignal();
  useTask(({ track }) => {
    const result = track(qrlFn);
    if (result && 'then' in result) {
      result.then(
        (val) => (sig.value = val),
        (err) => {
          console.error('async computed function threw!', err);
          throw error;
        }
      );
    } else {
      sig.value = result;
    }
  });
  return sig;
};
```
