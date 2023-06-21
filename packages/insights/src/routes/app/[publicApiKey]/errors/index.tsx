import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB, errorTable } from '~/db';
import { eq } from 'drizzle-orm';

export const useErrors = routeLoader$(async ({ params }) => {
  const db = getDB();
  const errors = await db
    .select()
    .from(errorTable)
    .where(eq(errorTable.publicApiKey, params.publicApiKey))
    .limit(1000)
    .all();
  return errors;
});

export default component$(() => {
  const errors = useErrors();
  return (
    <div>
      <h1>Errors</h1>
      <table>
        <tbody>
          <tr>
            <th>id</th>
            <th>timestamp</th>
            <th>Session</th>
            <th>URL</th>
            <th>source</th>
            <th>message</th>
            <th>error</th>
            <th>stack</th>
          </tr>
          {errors.value.map((error) => (
            <tr key={error.id}>
              <td>{error.id}</td>
              <td>{new Date(error.timestamp).toLocaleString()}</td>
              <td>{error.sessionID}</td>
              <td>
                <a href={error.url}>{error.url}</a>
              </td>
              <td>
                {error.source}:{error.line}:{error.column}
              </td>
              <td>{error.message}</td>
              <td>{error.error}</td>
              <td>
                <pre>{error.stack}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
