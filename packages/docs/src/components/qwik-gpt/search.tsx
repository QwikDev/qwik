// import { server$ } from '@builder.io/qwik-city';
// import { createClient } from '@supabase/supabase-js';
import gpt from './gpt.md?raw';
// import { chatCompletion } from './streaming-gpt';

const files = new Map<string, Promise<string>>();

// export const qwikGPT = server$(async function* (query: string) {
//   const supabase = createClient(this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!);
//   const normalizedQuery = normalizeLine(query);
//   const response = await fetch('https://api.openai.com/v1/embeddings', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${this.env.get('OPENAI_KEY')}`,
//     },
//     body: JSON.stringify({
//       input: normalizedQuery,
//       model: 'text-embedding-ada-002',
//     }),
//   });
//   const data = await response.json();
//   const embeddings = data.data[0].embedding;

//   const docs = await supabase.rpc('match_docs_10', {
//     query_text: normalizedQuery.replaceAll(' ', '|'),
//     query_embedding: embeddings,
//     match_count: 6,
//     similarity_threshold: 0.79,
//   });

//   const resultsHash = await getResultsHash(docs.data);
//   const existingQuery = await supabase.rpc('match_query_3', {
//     query_embedding: embeddings,
//     similarity_threshold: 0.95,
//     hash: resultsHash,
//   });
//   if (existingQuery.data.length === 1) {
//     const entry = existingQuery.data[0];
//     yield {
//       type: 'id',
//       content: entry.id,
//     };
//     yield entry.output;
//     return;
//   }

//   // Download docs
//   try {
//     const docsStr = await resolveContext(docs.data);
//     let model = 'gpt-4';
//     if (docsStr.length < 3500 * 3 && Math.random() < 0.5) {
//       model = 'gpt-3.5-turbo';
//     }
//     const insert = supabase
//       .from('search_queries')
//       .insert({
//         query: query,
//         embedding: embeddings,
//         results: docs.data,
//         results_hash: resultsHash,
//         model,
//       })
//       .select('id');

//     const id = (await insert).data?.[0].id as string;
//     yield {
//       type: 'id',
//       content: id,
//     };

//     if (docs.data.length === 0) {
//       yield 'We could not find any documentation that matches your question. Please try again rephrasing your question to be more factual.';
//       return;
//     }

//     const generator = chatCompletion(this.env.get('OPENAI_KEY')!, {
//       model: model,
//       temperature: 0,
//       messages: [
//         {
//           role: 'system',
//           content:
//             'You are QwikGPT, your job is to answer questions about Qwik, a new javascript framework focused on instant interactivity and server-side rendering.\nRelevant Qwik documentation and the user question will be provided. Try to answer the question in a short and concise way.',
//         },
//         {
//           role: 'user',
//           content: docsStr,
//         },
//         {
//           role: 'user',
//           content: `User question, respond in markdown including links to the sources, if you are not sure about the answer, say that you do not know:\n\n${query}`,
//         },
//       ],
//     });

//     let output = '';
//     for await (const chunk of generator) {
//       output += chunk;
//       yield chunk as string;
//     }
//     await supabase.from('search_queries').update({ output }).eq('id', id);
//   } catch (e) {
//     console.error(e);
//   }
// });

// export const rateResponse = server$(async function (query_id: string, rate: number) {
//   const supabase = createClient(this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!);
//   await supabase.from('search_rate').insert({
//     query_id: query_id,
//     rate: rate,
//   });
// });

export function normalizeLine(line: string) {
  line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  line = line.toLowerCase();
  line = line.replaceAll('`', '');
  line = line.replaceAll('*', '');
  line = line.replaceAll('_', ' ');
  line = line.replaceAll('#', '');
  line = line.replaceAll('-', ' ');
  line = line.replaceAll('...', '.');
  line = line.replaceAll('>', '');
  line = line.replaceAll('<', '');
  line = line.replaceAll('..', '.');
  line = line.replaceAll('  ', ' ');
  line = line.trim();
  return line;
}

export async function getResultsHash(docsData: any[]) {
  const key = docsData.map((result) => `${result.commit_hash}:${result.file}`).join(',');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = new Uint32Array(digest);
  return `${hash[0]}'${hash[1]}`;
}

export async function resolveContext(docsData: any[]) {
  // Download docs
  const dataCloned = [];
  try {
    for (const result of docsData) {
      const commit_hash = result.commit_hash;
      const file_path = result.file;
      const url = `https://raw.githubusercontent.com/QwikDev/qwik/${commit_hash}/${file_path}`;
      if (!files.has(url)) {
        files.set(
          url,
          fetch(url).then((r) => r.text())
        );
      }
      const copied = {
        ...result,
        url: url,
        content: await files.get(url),
      };
      dataCloned.push(copied);
    }

    // Parse docs
    const docsRanges: Record<string, [number, number][]> = {};
    for (const result of dataCloned) {
      const file = result.content;
      let range = docsRanges[result.url];
      if (!range) {
        docsRanges[result.url] = range = [];
      }
      get_docs_ranges(range, file, result['line']);
    }

    const docsLines: string[] = [];

    for (const [url, ranges] of Object.entries(docsRanges)) {
      const file = await files.get(url)!;
      const lines = file.split('\n').filter((_, index) => {
        for (const [start, end] of ranges) {
          if (index >= start && index < end) {
            return true;
          }
        }
        return false;
      });
      if (lines.length > 0) {
        const parts = new URL(url).pathname
          .split('/')
          .slice(8, -1)
          .filter((a) => !a.startsWith('('))
          .join('/');
        const docsURL = `https://qwik.dev/${parts}/`;
        docsLines.push('FROM (' + docsURL + '):\n');
        docsLines.push(...lines);
        docsLines.push('');
      }
    }
    const docsStr = gpt + '\n\n' + docsLines.filter((a) => !a.includes('CodeSandbox')).join('\n');
    return docsStr;
  } catch (e) {
    console.error(e);
  }
  return '';
}

function get_docs_ranges(ranges: [number, number][], fileContent: string, line: number) {
  const lines = fileContent.split('\n');

  // find top header
  let current_level = 0;
  let top_header = 0;
  let bottom_header = lines.length - 1;
  line = line - 1;

  for (let i = line - 1; i >= 0; i--) {
    const match = lines[i].match(/^(#+)\s/);
    if (match) {
      top_header = i;
      current_level = match[1].length;
      break;
    }
  }
  // find bottom header
  for (let i = line + 1; i < lines.length; i++) {
    if (lines[i].startsWith('#')) {
      bottom_header = i;
      break;
    }
  }
  ranges.push([top_header, bottom_header]);
  if (current_level > 1) {
    const find_top_header = '#'.repeat(current_level - 1) + ' ';
    for (let i = top_header - 1; i >= 0; i--) {
      if (lines[i].startsWith(find_top_header)) {
        for (let j = i + 1; j < top_header; j++) {
          if (lines[j].startsWith('#')) {
            ranges.push([i, j]);
            return;
          }
        }
        return;
      }
    }
  }
}
