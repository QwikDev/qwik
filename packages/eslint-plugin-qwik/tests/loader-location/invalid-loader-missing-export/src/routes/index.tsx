// Expect error: { "messageId": "missingExport" }

import { routeLoader$ } from '@qwik.dev/city';

const useFormLoader = routeLoader$(() => {
  return null;
});
