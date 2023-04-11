import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { createClient } from '@supabase/supabase-js';

export const useQueryData = routeLoader$(async (ev) => {
  const query_id = ev.params.id;
  const supabase = createClient(ev.env.get('SUPABASE_URL')!, ev.env.get('SUPABASE_KEY')!);
  const output = await supabase
    .from('search_queries')
    .select('query, embedding, results, model')
    .filter('id', 'eq', query_id)
    .limit(1);

  if (!output.data || output.data.length !== 1) {
    return null;
  }
  const entry = output.data[0];

  const all_results = await supabase.rpc('match_docs_7', {
    query_text: entry.query,
    query_embedding: entry.embedding,
    match_count: 40,
    similarity_threshold: 0.8,
  });

  all_results.data.forEach((result: any) => {
    result.included = entry.results.some((r: any) => r.key === result.key);
  });

  return {
    query: entry.query,
    results: all_results,
    model: entry.model,
  };
});

export default component$(() => {
  const queryData = useQueryData().value;
  if (queryData === null) {
    return <div>Query not found</div>;
  }

  return (
    <div>
      <h1>Query: {queryData.query}</h1>
      <h2>Model: {queryData.model}</h2>
      <h2>Results</h2>
      <table class="text-xs table-auto border-collapse border border-slate-500">
        <tbody>
          {queryData.results.data.map((result: any, i: any) => (
            <tr
              class="border-spacing-5"
              style={{ background: result.included ? 'green' : 'transparent' }}
            >
              <td class="border border-slate-600">{i}</td>
              <td class="border border-slate-600">{(result.similarity as number).toFixed(2)}</td>
              <td class="border border-slate-600">
                {result.file.replace('packages/docs/src/routes/', '')}:{result.line}
              </td>
              <td class="border border-slate-600">{result.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
