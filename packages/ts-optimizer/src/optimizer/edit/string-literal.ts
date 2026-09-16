export function quoteAsStringLiteral(body: string): string {
  const quote = body.includes('"') ? "'" : '"';
  const escaped = body
    .replace(/\\/g, '\\\\')
    .replaceAll(quote, '\\' + quote)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return quote + escaped + quote;
}
