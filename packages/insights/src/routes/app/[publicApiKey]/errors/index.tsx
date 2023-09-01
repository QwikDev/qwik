import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB, errorTable, type ErrorRow } from '~/db';
import { eq, sql } from 'drizzle-orm';
import { css, cx } from '~/styled-system/css';
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

const column = css({
  border: '1px solid black',
  overflow: 'scroll',
  maxWidth: '300px',
  maxHeight: '100px',
  verticalAlign: 'top',
  padding: '3px',
});

const columnTimestamp = cx(
  css({
    fontSize: '12px',
  }),
  column
);
const columnUrl = cx(
  css({
    maxWidth: '300px',
  }),
  column
);
const columnUrlCell = cx(
  css({
    fontFamily: 'monospace',
  }),
  columnUrl
);
const columnMessage = cx(
  css({
    maxWidth: '100%',
  }),
  column
);
const columnMessageCell = cx(
  css({
    maxWidth: '100%',
    fontFamily: 'monospace',
  }),
  columnMessage
);

export default component$(() => {
  const errors: ReadonlySignal<ErrorRow[]> = useErrors();
  return (
    <div>
      <h1>
        <ErrorIcon />
        Errors
      </h1>
      <table
        class={css({
          border: '1px solid black',
        })}
      >
        <tbody>
          <tr>
            <th class={cx(css({ fontWeight: 'bold' }), columnTimestamp)}>Timestamp</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnUrl)}>URL</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnMessage)}>Message</th>
          </tr>
          {errors.value.map((error) => (
            <tr key={error.id} onPopup$={(e: PopupEvent) => e.detail.show(Popup, error)}>
              <td class={cx(css({}), columnTimestamp)}>
                {new Date(error.timestamp).toLocaleString()}
              </td>
              <td class={cx(css({}), columnUrlCell)}>
                <a href={error.url}>{error.url}</a>
              </td>
              <td class={cx(css({}), columnMessageCell)}>{error.message}</td>
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
    <div
      class={css({
        maxWidth: '75pv',
        minWidth: '300px',
        overflow: 'scroll',
        margin: '10px',
      })}
    >
      <h1 class={labelStyle}>
        Timestamp: <code class={codeStyle}>{timestamp.toLocaleString()}</code>
      </h1>
      <h1 class={labelStyle}>
        URL:{' '}
        <code class={codeStyle}>
          <a href={url} class={linkStyle} target="_blank">
            {url}
          </a>
        </code>
      </h1>
      <h1 class={labelStyle}>
        Manifest: <code class={codeStyle}>{manifestHash}</code>
      </h1>
      <h1 class={labelStyle}>Message:</h1>
      <pre class={codeStyle}>{message}</pre>
      <h1 class={labelStyle}>Error:</h1>
      <pre class={codeStyle}>{error}</pre>
      <h1 class={labelStyle}>Stack:</h1>
      <pre class={codeStyle}>{stack}</pre>
    </div>
  );
});

const labelStyle = css({
  fontWeight: 'bold',
  marginTop: '10px',
});
const codeStyle = css({
  fontFamily: 'monospace',
  whiteSpace: 'break-spaces',
});
const linkStyle = css({
  color: 'blue',
  textDecoration: 'underline',
  '&:hover': {
    color: 'lightblue',
  },
});
