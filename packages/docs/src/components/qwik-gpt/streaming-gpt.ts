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
  const { writable, readable } = getSSETransformer();
  data.pipeTo(writable);

  const a = readable.getReader();
  while (true) {
    const { done, value } = await a.read();
    if (done) {
      return;
    }
    console.log('LINE', value);
    const message = value.trim();
    if (message === '[DONE]') {
      return;
    }
    const json = JSON.parse(message);
    const token = json.choices?.[0]?.delta?.content;
    if (token) {
      yield token;
    }
  }
}

interface SSEvent {
  data: string;
  [key: string]: string;
}

const parseEvent = (message: string): SSEvent => {
  const lines = message.split('\n');
  const event: SSEvent = {
    data: '',
  };
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data += line.slice(6) + '\n';
    } else {
      const [key, value] = line.split(':');
      if (typeof key === 'string' && typeof value === 'string') {
        event[key] = value.trim();
      }
    }
  }
  event.data = data;
  return event;
};


const getSSETransformer = () => {
  // Convert the stream into a stream of lines
  let currentLine = '';
  const encoder = new TextDecoder();
  const transformer = new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      const lines = encoder.decode(chunk).split('\n\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = currentLine + lines[i];
        if (line.length === 0) {
          controller.terminate();
          break;
        } else {
          controller.enqueue(parseEvent(line).data);
          currentLine = '';
        }
      }
      currentLine += lines[lines.length - 1];
    },
  });
  return transformer;
};