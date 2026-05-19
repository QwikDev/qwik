// Expect error: { "messageId": "missingExport" }

import { routeLoader$ } from '@qwik.dev/router';

const useFormLoader = routeLoader$(() => {
  return null;
});
