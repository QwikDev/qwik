import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { eq } from 'drizzle-orm';
import { getDB, symbolTable } from '~/db';

export const useSymbols = routeLoader$(async ({ params }) => {
  const db = getDB();
  const symbols = await db
    .select()
    .from(symbolTable)
    .where(eq(symbolTable.publicApiKey, params.publicApiKey))
    .limit(1000)
    .all();
  return symbols;
});

export default component$(() => {
  const errors = useSymbols();
  return (
    <div>
      <h1>Symbols</h1>
      <table>
        <tbody>
          <tr>
            <th>id</th>
            <th>Session ID</th>
            <th>symbol</th>
            <th>previous symbol</th>
            <th>load delay</th>
            <th>time delta</th>
            <th>interaction</th>
          </tr>
          {errors.value.map((symbol) => (
            <tr key={symbol.id}>
              <td>{symbol.id}</td>
              <td>{symbol.sessionID}</td>
              <td>{symbol.symbol}</td>
              <td>{symbol.previousSymbol}</td>
              <td>{symbol.loadDelay}</td>
              <td>{symbol.timeDelta}</td>
              <td>{symbol.interaction > 0 ? '👆' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
