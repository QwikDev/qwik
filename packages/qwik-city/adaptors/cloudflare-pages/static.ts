export function generateStaticEntryModule() {
  const o: string[] = [];

  o.push(`// auto-generated from @builder.io/qwik-city/adaptors/cloudflare-pages`);
  o.push(`console.log('SSG');`);

  return o.join('\n') + '\n';
}

export async function runStaticSiteGenerations() {}
