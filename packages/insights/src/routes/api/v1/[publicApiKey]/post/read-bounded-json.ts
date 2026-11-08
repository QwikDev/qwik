/** Parses the JSON body, or returns `undefined` once it exceeds `maxBytes`. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<any> {
  const decoder = new TextDecoder();
  let text = '';
  let byteLength = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      byteLength += chunk.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  }
  return JSON.parse(text + decoder.decode());
}
