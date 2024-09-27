// Expect error: { "messageId": "missingExport" }

import { routeLoader$ } from '@qwikdev/city';

const useFormLoader = routeLoader$(() => {
  return null;
});
