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
    .limit(1000)
    .orderBy(sql`${errorTable.timestamp} DESC`)
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
      <table>
        <tbody>
          <tr>
            <th>Timestamp</th>
            <th>URL</th>
            <th>Message</th>
          </tr>
          {errors.value.map((error) => (
            <tr key={error.id} onPopup$={(e: PopupEvent) => e.detail.show(Popup, error)}>
              <td>{new Date(error.timestamp).toLocaleString()}</td>
              <td>
                <a href={error.url}>{error.url}</a>
              </td>
              <td>{error.message}</td>
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
    <div>
      <h1>
        Timestamp: <code>{timestamp.toLocaleString()}</code>
      </h1>
      <h1>
        URL:{' '}
        <code>
          <a href={url} target="_blank">
            {url}
          </a>
        </code>
      </h1>
      <h1>
        Manifest: <code>{manifestHash}</code>
      </h1>
      <h1>Message:</h1>
      <pre>{message}</pre>
      <h1>Error:</h1>
      <pre>{error}</pre>
      <h1>Stack:</h1>
      <pre>{stack}</pre>
    </div>
  );
});
