import { ResolvedConfig } from 'vite';

function updateConf(conf: ResolvedConfig) {
  const pkg = '@qwik.dev/devtools';

  // Ensure ssr exists
  // Some environments may have optional ssr in typed config
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  conf.ssr = conf.ssr ?? ({} as typeof conf.ssr);

  const current = conf.ssr?.noExternal as unknown;

  // If noExternal is not set (undefined/false), initialize as array
  if (!current) {
    conf.ssr.noExternal = [pkg];
    return conf;
  }

  // If already true (do not externalize anything), nothing to do
  if (current === true) {
    return conf;
  }

  // If it's an array of entries, append if missing
  if (Array.isArray(current)) {
    if (!current.includes(pkg)) {
      current.push(pkg);
    }
    return conf;
  }

  // If it's a string, convert to array and append
  if (typeof current === 'string') {
    conf.ssr.noExternal = current === pkg ? [pkg] : [current, pkg];
    return conf;
  }

  // For other shapes (e.g., RegExp), preserve and extend via array wrapper
  // This keeps existing behavior while ensuring our package is included
  conf.ssr.noExternal = [current as never, pkg] as unknown as typeof conf.ssr.noExternal;
  return conf;
}

export default updateConf;
