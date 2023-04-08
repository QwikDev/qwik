import { server$ } from "@builder.io/qwik-city";
import { Configuration, OpenAIApi } from "openai";
import { createClient } from '@supabase/supabase-js'

const files = new Map<string, Promise<string>>();

export const qwikGPT = server$(async function* (query: string) {
  const supabase = createClient(
    this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!
  );
  const configuration = new Configuration({
    organization: this.env.get('OPENAI_ORGANIZATION'),
    apiKey: this.env.get('OPENAI_API_KEY'),
  });
  const openai = new OpenAIApi(configuration);
  const res = await openai.createEmbedding({
    input: normalizeLine(query),
    model: 'text-embedding-ada-002'
  });
  const embeddings = res.data.data[0].embedding;
  const docs = await supabase.rpc('match_docs_2', {
    "query_embedding": embeddings,
    "match_count": 5,
    "similarity_threshold": 0.75,
  });

  const insert = supabase.from('search_queries').insert({
    query: query,
    embedding: embeddings,
    results: docs.data,
  }).select("id");


  // Download docs
  try {
    for (const result of docs.data) {
      const commit_hash = result.commit_hash;
      const file_path = result.file;
      const url = `https://raw.githubusercontent.com/BuilderIO/qwik/${commit_hash}/${file_path}`;
      if (!files.has(url)) {
        files.set(url, fetch(url).then(r => r.text()));
      }
      result.url = url;
      result.content = files.get(url);
    }

    // Parse docs
    const docsRanges: Record<string, [number, number][]> = {};
    for (const result of docs.data) {
      const file = await result.content;
      let range = docsRanges[result.url];
      if (!range) {
        docsRanges[result.url] = range = [];
      }
      get_docs_ranges(range, file, result['line']);
    }

    const docsLines = [];
    for (const [url, ranges] of Object.entries(docsRanges)) {
      const file = await files.get(url)!;
      const lines = file
        .split('\n')
        .filter((_, index) => {
          for (const [start, end] of ranges) {
            if (index >= start && index < end) {
              return true;
            }
          }
          return false;
        })
      docsLines.push(...lines);
      docsLines.push('')
    }
    const docsStr = docsLines.join('\n');
    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You are QwikGPT, your job is to answer questions about a Javascript framework called Qwik. It is a new framework focused on instant interactivity and server-side rendering, completely unrelated with React or any other framework.\nRelevant qwik documentation and the user question will be provided. Try to answer the question in a short and concise way.\nIf you are not sure about the answer, it is ok to say you do not know, do not make up answers.',
        },
        {
          role: 'user',
          content: `Context:\n${docsStr}`,
        },
        {
          role: 'user',
          content: `User question:\n${query}`,
        }
      ],
      stream: true,
    },  { responseType: 'stream' });

    const id = (await insert).data?.[0].id;
    yield {
      type: 'id',
      content: id
    };
    for await (const chunk of toIterable(response.data)) {
      yield chunk as string;
    }

  }catch (e) {
    console.error(e);
    throw e;
  }
});

export const rateResponse = server$(async function(query_id: string, message: string, rate: number) {
  const supabase = createClient(
    this.env.get('SUPABASE_URL')!, this.env.get('SUPABASE_KEY')!
  );
  await supabase.from('search_rate').insert({
    query_id: query_id,
    message: message,
    rate: rate,
  })
});

function normalizeLine(line: string) {
  line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  line = line.toLowerCase()
  line = line.replaceAll('`', '')
  line = line.replaceAll('*', '')
  line = line.replaceAll('_', ' ')
  line = line.replaceAll('#', '')
  line = line.replaceAll('-', ' ')
  line = line.replaceAll('...', '.')
  line = line.replaceAll('>', '')
  line = line.replaceAll('..', '.')
  line = line.replaceAll('  ', ' ')
  line = line.trim()
  return line;
}

function get_docs_ranges(ranges: [number, number][], fileContent: string, line: number) {
  const lines = fileContent.split('\n');

  // find top header
  let current_level = 0;
  let top_header = 0;
  let bottom_header = lines.length - 1;
  for (let i = line - 1; i >= 0; i--) {
    const match = lines[i].match(/^(#+)\s/)
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
        .filter((line: string) => line.trim().startsWith('data: '))

    for (const line of lines) {
        const message = line.replace(/^data: /, '')
        if (message === '[DONE]') {
            return
        }

        const json = JSON.parse(message)
        const token = json.choices[0].delta.content
        if (token) {
            yield token
        }
    }
  }
}


