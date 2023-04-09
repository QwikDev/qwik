import { server$ } from '@builder.io/qwik-city';
import { Configuration, OpenAIApi } from 'openai';
import { createClient } from '@supabase/supabase-js';
import gpt from './gpt.md?raw';

const files = new Map<string, Promise<string>>();

export const qwikGPT = server$(async function* (query: string) {
  const supabase = createClient(this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!);
  const configuration = new Configuration({
    organization: this.env.get('OPENAI_ORG'),
    apiKey: this.env.get('OPENAI_KEY'),
  });
  const openai = new OpenAIApi(configuration);
  const res = await openai.createEmbedding({
    input: normalizeLine(query),
    model: 'text-embedding-ada-002',
  });

  const embeddings = res.data.data[0].embedding;
  const docs = await supabase.rpc('match_docs_3', {
    query_embedding: embeddings,
    match_count: 5,
    similarity_threshold: 0.75,
  });

  // Download docs
  const dataCloned = structuredClone(docs.data);
  try {
    for (const result of docs.data) {
      const commit_hash = result.commit_hash;
      const file_path = result.file;
      const url = `https://raw.githubusercontent.com/BuilderIO/qwik/${commit_hash}/${file_path}`;
      if (!files.has(url)) {
        files.set(
          url,
          fetch(url).then((r) => r.text())
        );
      }
      result.url = url;
      result.content = await files.get(url);
    }

    // Parse docs
    const docsRanges: Record<string, [number, number][]> = {};
    for (const result of docs.data) {
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
        const docsURL = `https://qwik.builder.io/${parts}/`;
        docsLines.push('FROM (' + docsURL + '):\n');
        docsLines.push(...lines);
        docsLines.push('');
      }
    }
    const docsStr = gpt + '\n\n' + docsLines.filter((a) => !a.includes('CodeSandbox')).join('\n');
    let model = 'gpt-4';
    if (docsStr.length < 3500 * 3.5) {
      model = 'gpt-3.5-turbo';
    }
    const insert = supabase
      .from('search_queries')
      .insert({
        query: query,
        embedding: embeddings,
        results: dataCloned,
        model,
      })
      .select('id');
    const response = await openai.createChatCompletion(
      {
        model: model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are QwikGPT, your job is to answer questions about Qwik, a new javascript framework focused on instant interactivity and server-side rendering.\nRelevant Qwik documentation and the user question will be provided. Try to answer the question in a short and concise way.',
          },
          {
            role: 'user',
            content: docsStr,
          },
          {
            role: 'user',
            content: `User question, respond in markdown including links to the sources, if you are not sure about the answer, say that you don not know:\n\n${query}`,
          },
        ],
        stream: true,
      },
      { responseType: 'stream' }
    );

    const id = (await insert).data?.[0].id as string;
    yield {
      type: 'id',
      content: id,
    };
    let output = '';
    for await (const chunk of toIterable(response.data)) {
      output += chunk;
      yield chunk as string;
    }
    await supabase.from('search_output').insert({
      query_id: id,
      embedding: embeddings,
      output,
    });
  } catch (e) {
    console.error(e);
    throw e;
  }
});

export const rateResponse = server$(async function (
  query_id: string,
  message: string,
  rate: number
) {
  const supabase = createClient(this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!);
  await supabase.from('search_rate').insert({
    query_id: query_id,
    message: message,
    rate: rate,
  });
});

function normalizeLine(line: string) {
  line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  line = line.toLowerCase();
  line = line.replaceAll('`', '');
  line = line.replaceAll('*', '');
  line = line.replaceAll('_', ' ');
  line = line.replaceAll('#', '');
  line = line.replaceAll('-', ' ');
  line = line.replaceAll('...', '.');
  line = line.replaceAll('>', '');
  line = line.replaceAll('..', '.');
  line = line.replaceAll('  ', ' ');
  line = line.trim();
  return line;
}

function get_docs_ranges(ranges: [number, number][], fileContent: string, line: number) {
  const lines = fileContent.split('\n');

  // find top header
  let current_level = 0;
  let top_header = 0;
  let bottom_header = lines.length - 1;
  for (let i = line - 1; i >= 0; i--) {
    const match = lines[i].match(/^(#+)\s/);
    if (match) {
      top_header = i;
      current_level = match[1].length;
      break;
    }
  }
  // find bottom header
  for (let i = line; i < lines.length; i++) {
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
            break;
          }
        }
      }
    }
  }
}

async function* toIterable(data: any) {
  for await (const chunk of data as any) {
    const lines = chunk
      .toString('utf8')
      .split('\n')
      .filter((line: string) => line.trim().startsWith('data: '));

    for (const line of lines) {
      const message = line.replace(/^data: /, '');
      if (message === '[DONE]') {
        return;
      }

      const json = JSON.parse(message);
      const token = json.choices[0].delta.content;
      if (token) {
        yield token;
      }
    }
  }
}
