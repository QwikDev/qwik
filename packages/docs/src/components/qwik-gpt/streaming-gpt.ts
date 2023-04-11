import type { CreateChatCompletionRequest } from 'openai';

export async function* chatCompletion(apiKey: string, request: CreateChatCompletionRequest) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...request,
      stream: true,
    }),
  });

  for await (const chunk of toIterable(response.body!)) {
    yield chunk as string;
  }
}

async function* toIterable(data: ReadableStream<Uint8Array>) {
  const reader = data.getReader();
  const encoder = new TextDecoder();
  let currentLine = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    const lines = encoder.decode(value).split('\n\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = currentLine + lines[i];
      if (line.length === 0) {
        return;
      } else {
        const message = parseEvent(line).trim();
        if (message === '[DONE]') {
          return;
        }
        const json = JSON.parse(message);
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          yield token;
        }
        currentLine = '';
      }
    }
    currentLine += lines[lines.length - 1];
  }
}

const parseEvent = (message: string): string => {
  const lines = message.split('\n');
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data += line.slice(6) + '\n';
    }
  }
  return data;
};
