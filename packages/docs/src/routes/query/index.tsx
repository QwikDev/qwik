import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { createClient } from '@supabase/supabase-js';

export const useQueryData = routeLoader$(async (ev) => {
  if (ev.query.get('token') !== ev.env.get('DEBUG_TOKEN')) {
    throw ev.redirect(308, '/');
  }
  const supabase = createClient(ev.env.get('SUPABASE_URL')!, ev.env.get('SUPABASE_KEY')!);
  const output = await supabase
    .from('search_queries')
    .select('id, query, created_at')
    .order('created_at', {
      ascending: false,
    })
    .limit(100);

  return {
    results: output,
  };
});

export default component$(() => {
  const queryData = useQueryData().value;
  if (queryData === null) {
    return <div>Query not found</div>;
  }

  return (
    <div>
      <h2>Results</h2>
      <table class="border border-slate-500">
        <tbody>
          {queryData.results.data?.map((result: any, i: any) => (
            <tr>
              <td class="border border-slate-500">{i}</td>
              <td class="border border-slate-500">{result.query}</td>
              <td class="border border-slate-500">{result.created_at}</td>
              <td class="border border-slate-500">
                <a href={`/query/${result.id}`}>Open</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
