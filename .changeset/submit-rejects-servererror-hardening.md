---
'@qwik.dev/router': major
---

`action.submit()`/`run()` now rejects when the submission aborts (a thrown `error()` or unexpected server error); `<Form>` handles this internally and emits `submitcompleted` with `detail.aborted`. `ServerError` no longer flattens reserved payload keys (`message`, `status`, `data`, ...) onto the error — `error.message` is always a string.
