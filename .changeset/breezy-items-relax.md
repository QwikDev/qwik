---
'@builder.io/qwik-city': patch
---

FIX: When a form POST is done, keys like "name.1" mean it's an array. However, later keys could be strings like "name.value". Now, we check if all the keys are numbers, otherwise we make an object instead of an array. This allows for more correct form data handling.
