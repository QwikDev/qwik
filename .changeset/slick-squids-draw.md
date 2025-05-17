---
'@builder.io/qwik-city': minor
'@builder.io/qwik': minor
---

FEAT: useVisibleTask$ now accepts the strategy "idle-visible", which waits until document idle before running visible tasks. This improves the LCP Web Vitals metric. It typically delays visible tasks for less than a second at document load, and is our recommended setting.
