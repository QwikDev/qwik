export function quoteAsStringLiteral(body: string): string {
  return body.includes('"') ? `'${body}'` : `"${body}"`;
}
