---
'@builder.io/qwik': patch
---

CHORE: Async functions in `useComputed$` are deprecated. Use `useTask$` or `useResource$` instead, or this function:

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
