import { component$ } from '@builder.io/qwik';
// import { routeLoader$ } from '@builder.io/qwik-city';
// import { createClient } from '@supabase/supabase-js';

// export const useQueryData = routeLoader$(async (ev) => {
//   const token = ev.query.get('token');
//   if (token !== ev.env.get('DEBUG_TOKEN')) {
//     throw ev.redirect(308, '/');
//   }
//   const supabase = createClient(ev.env.get('SUPABASE_URL')!, ev.env.get('SUPABASE_KEY')!);
//   const output = await supabase.rpc('list_queries_2', {
//     match_count: 100,
//   });

//   return {
//     token,
//     results: output,
//   };
// });

export default component$(() => {
  // const queryData = useQueryData().value;
  const queryData = null;
  if (queryData === null) {
    return <div>Query not found</div>;
  }

  // return (
  //   <div>
  //     <h2>Results</h2>
  //     <table class="border border-slate-500">
  //       <tbody>
  //         {queryData.results.data?.map((result: any, i: any) => (
  //           <tr
  //             key={i}
  //             class={{
  //               'bg-red-400': result.rate < 0,
  //               'bg-green-400': result.rate > 0,
  //               'bg-blue-400': result.approved > 0,
  //             }}
  //           >
  //             <td class="border border-slate-500">{i}</td>
  //             <td class="border border-slate-500">{result.query}</td>
  //             <td class="border border-slate-500">{result.created_at}</td>
  //             <td class="border border-slate-500">
  //               <a href={`/query/${result.id}/?token=${queryData.token}`}>Open</a>
  //             </td>
  //           </tr>
  //         ))}
  //       </tbody>
  //     </table>
  //   </div>
  // );
});
