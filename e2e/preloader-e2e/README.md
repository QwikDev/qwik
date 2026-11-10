# Preloader e2e suite

Counts the network round trips a click, a scroll or a navigation needs in the
[preloader test app](../qwik-e2e/apps/preloader-test), on a production build in Chromium.

```bash
pnpm build.core
pnpm test.e2e.preloader
```

## Words

| Word                | Meaning                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round trip          | One wait on the network: the requests the page sends before any of their responses come back. A click that takes 2 round trips makes the user wait twice.                         |
| Cap                 | Every click should show its result within 2 round trips: its handler, then everything the handler needs. A title that says "over the cap" pins today's count.                     |
| Needed chunk        | A chunk the click, scroll or navigation runs.                                                                                                                                     |
| Speculative preload | A preload sent on a guess, before anything needs the chunk. The preloader marks it `fetchpriority="low"`.                                                                         |
| Ongoing             | A request still in flight.                                                                                                                                                        |
| Gate                | The test's hold on the network (`utils/gate.ts`): it keeps requests ongoing and releases them one round trip at a time, which is how round trips get counted.                     |
| Cold click          | A click once the page's own load work is done, while one speculative preload is still ongoing. None of the fixture's chunks has loaded, except those an in-view visible task ran. |
| Warm click          | A click once the preloader has nothing left to preload. It should need no request.                                                                                                |
| Result              | The fixture's `output[data-testid=result]` with `data-done` set: every step ran.                                                                                                  |
| Long task           | A main-thread task that takes 50 ms or more of CPU time, with the CPU slowed to a mid-tier phone's. Time the machine paused the browser doesn't count.                            |

## Expected failures

A `test.fail()` test names a known issue on `main` in its reason. A click whose count differs from
the cap is pinned in `utils/fixtures.ts`, with its reason. Both start failing when a fix changes the
behaviour: update them in the same PR as the fix.

The tests under `gate:` check the gate itself, not Qwik.
