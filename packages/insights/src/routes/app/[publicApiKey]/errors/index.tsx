import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB, errorTable, type ErrorRow } from '~/db';
import { eq, sql } from 'drizzle-orm';
import { ErrorIcon } from '~/components/icons/error';
import { type PopupEvent } from '~/components/popup-manager';

export const useErrors = routeLoader$(async ({ params }) => {
  const db = getDB();
  const errors: ErrorRow[] = await db
    .select()
    .from(errorTable)
    .where(eq(errorTable.publicApiKey, params.publicApiKey))
    .orderBy(sql`${errorTable.timestamp} DESC`)
    .limit(1000)
    .all();
  return errors;
});

export default component$(() => {
  const errors: ReadonlySignal<ErrorRow[]> = useErrors();
  return (
    <div>
      <h1 class="h3">
        <ErrorIcon />
        Errors
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Timestamp
            </th>
            <th scope="col" class="px-6 py-3">
              URL
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Message
            </th>
          </tr>
        </thead>
        <tbody>
          {errors.value.map((error) => (
            <tr
              key={error.id}
              onPopup$={(e: PopupEvent) => e.detail.show(Popup, error)}
              class="border-b border-slate-200 text-xs"
            >
              <td scope="col" class="px-6 py-3 bg-slate-50 whitespace-nowrap">
                {new Date(error.timestamp).toLocaleString()}
              </td>
              <td scope="col" class="px-6 py-3 max-w-lg break-words">
                <a href={error.url} target="_blank">
                  {error.url}
                </a>
              </td>
              <td scope="col" class="px-6 py-3 bg-slate-50">
                {error.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const Popup = component$<{
  timestamp: Date;
  url: string;
  manifestHash: string | null;
  message: string;
  error: string;
  stack: string;
}>(({ timestamp, url, manifestHash, message, error, stack }) => {
  return (
    <div class="max-w-[75vw] min-w-[300px] overflow-scroll">
      <h2 class="h5 px-6 py-3">Details</h2>
      <table class="w-full text-sm text-left mb-6">
        <tbody>
          <tr class="border-y border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Timestamp
            </th>
            <td scope="col" class="px-6 py-3">
              <code>{timestamp.toLocaleString()}</code>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              URL
            </th>
            <td scope="col" class="px-6 py-3">
              <code>{url}</code>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Manifest
            </th>
            <td scope="col" class="px-6 py-3">
              <code>{manifestHash}</code>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Message
            </th>
            <td scope="col" class="px-6 py-3">
              <pre>{message}</pre>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Error
            </th>
            <td scope="col" class="px-6 py-3">
              <pre>{error}</pre>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Stack
            </th>
            <td scope="col" class="px-6 py-3">
              <pre>{stack}</pre>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
