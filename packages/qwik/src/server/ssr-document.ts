import { isDev } from '@qwik.dev/core/build';
import {
  createSsrSection,
  isSsrRecordChunk,
  isPromise,
  version,
  type SsrOutput,
  type SsrRecordChunk,
  type SsrSection,
  type SsrCatchChunk,
} from '@qwik.dev/core';
import {
  QContainerValue,
  QBaseAttr,
  QContainerAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QVersionAttr,
  escapeHTML,
} from './qwik-copy';
import type { RenderToStreamOptions, ResolvedManifest } from './types';

export function createContainerAttributes(
  opts: RenderToStreamOptions<any>,
  resolvedManifest: ResolvedManifest | undefined,
  buildBase: string,
  locale: string,
  instanceHash: string
): Record<string, string> {
  const containerAttributes = { ...(opts.containerAttributes ?? {}) };
  const qRender = containerAttributes[QRenderAttr];
  containerAttributes[QContainerAttr] = QContainerValue.PAUSED;
  containerAttributes[QRuntimeAttr] = '2';
  containerAttributes[QVersionAttr] = version ?? 'dev';
  containerAttributes[QRenderAttr] = (qRender ? qRender + '-' : '') + (isDev ? 'ssr-dev' : 'ssr');
  containerAttributes[QBaseAttr] = buildBase;
  containerAttributes[QLocaleAttr] = locale;
  containerAttributes[QManifestHashAttr] = resolvedManifest?.manifest.manifestHash ?? '';
  containerAttributes[QInstanceAttr] = instanceHash;
  opts.serverData ||= {};
  opts.serverData.containerAttributes = containerAttributes;
  return containerAttributes;
}

/** Resolve only the leading markup needed to distinguish a document from a body fragment. */
export async function resolveDocumentStart(
  output: SsrOutput,
  cursor = { inComment: false, found: false }
): Promise<SsrOutput> {
  const resolved = await output;
  if (
    typeof resolved === 'object' &&
    !Array.isArray(resolved) &&
    (resolved as SsrCatchChunk).type === 'catch'
  ) {
    const boundary = (resolved as SsrCatchChunk).boundary;
    boundary.output = await resolveDocumentStart(boundary.output, cursor);
    return resolved;
  }
  if (!Array.isArray(resolved) || isHeadlessCarrierOutput(resolved)) {
    if (!isHeadlessCarrierOutput(resolved)) {
      cursor.found = hasInitialMarkup(resolved, cursor);
    }
    return resolved;
  }
  let children: SsrOutput[] | null = null;
  for (let i = 0; i < resolved.length; i++) {
    const child = await resolveDocumentStart(resolved[i], cursor);
    if (child !== resolved[i]) {
      children ??= resolved.slice();
      children[i] = child;
    }
    if (cursor.found) {
      break;
    }
  }
  return children ?? resolved;
}

function hasInitialMarkup(output: SsrOutput, cursor: { inComment: boolean }): boolean {
  if (isHeadlessCarrierOutput(output)) {
    return false;
  }
  if (typeof output === 'string') {
    if (cursor.inComment) {
      const end = output.indexOf('>');
      if (end === -1) {
        return false;
      }
      cursor.inComment = false;
      output = output.slice(end + 1);
    }
    output = output.replace(/<![^>]*>/g, '');
    const comment = output.indexOf('<!');
    if (comment !== -1) {
      cursor.inComment = true;
      output = output.slice(0, comment);
    }
    return output.trim() !== '';
  }
  return (
    !cursor.inComment &&
    isSsrRecordChunk(output) &&
    (output.openTag ||
      output.parts.some((part) => typeof part === 'string' && /<[a-z]/i.test(part)))
  );
}

export function relocateHeadlessCarriers(output: SsrOutput): SsrOutput {
  const carriers: SsrOutput[] = [];
  const withoutCarriers = removeHeadlessCarriers(output, carriers);
  return carriers.length === 0
    ? output
    : insertAtSection(withoutCarriers, 'head', carriers, 'after');
}

function isHeadlessCarrierOutput(output: SsrOutput): boolean {
  return (
    Array.isArray(output) &&
    output.length === 2 &&
    isSsrRecordChunk(output[0]) &&
    output[0].headlessCarrier === true
  );
}

function removeHeadlessCarriers(output: SsrOutput, carriers: SsrOutput[]): SsrOutput {
  if (!Array.isArray(output)) {
    return output;
  }
  let children: SsrOutput[] | null = null;
  for (let i = 0; i < output.length; i++) {
    const child = output[i];
    if (isHeadlessCarrierOutput(child)) {
      children ??= output.slice(0, i);
      carriers.push(child);
    } else {
      const nested = removeHeadlessCarriers(child, carriers);
      if (nested !== child) {
        children ??= output.slice(0, i);
      }
      children?.push(nested);
    }
  }
  return children ?? output;
}

export function injectStyles(
  output: SsrOutput,
  styles: Map<string, string>,
  isDocument: boolean
): SsrOutput {
  if (styles.size === 0) {
    return output;
  }
  const styleHtml = Array.from(styles, ([styleId, content]) => {
    return `<style q:style="${escapeHTML(styleId)}">${content}</style>`;
  }).join('');
  return isDocument ? insertAtSection(output, '/head', [styleHtml], 'before') : [styleHtml, output];
}

export function createContainerOpenTag(tagName: string, attrs: Record<string, string>): string {
  let html = tagName === 'html' ? '<!DOCTYPE html>' : '';
  html += `<${tagName}`;
  for (const name in attrs) {
    const value = attrs[name];
    if (value === undefined) {
      continue;
    }
    html += ` ${name}="${escapeHTML(value)}"`;
  }
  return html + '>';
}

export function hasDocumentSections(output: SsrOutput): boolean {
  return findSection(output, 'head') !== undefined || findSection(output, 'body') !== undefined;
}

function findSection(
  output: SsrOutput,
  section: SsrSection
): SsrRecordChunk | SsrCatchChunk | undefined {
  if (isSsrRecordChunk(output)) {
    return output.section === section ? output : undefined;
  }
  if (Array.isArray(output)) {
    for (let i = 0; i < output.length; i++) {
      const found = findSection(output[i], section);
      if (found !== undefined) {
        return found;
      }
    }
  } else if (
    typeof output === 'object' &&
    !isPromise(output) &&
    (output as SsrCatchChunk).type === 'catch'
  ) {
    const chunk = output as SsrCatchChunk;
    return findSection(chunk.boundary.output, section) === undefined ? undefined : chunk;
  }
  return undefined;
}

const createDocumentSection = (section: SsrSection) =>
  section[0] === '/'
    ? createSsrSection(section, `<${section}>`)
    : createSsrSection(section, `<${section}`, '>');

/** Gives every html container the head and body the runtime inserts its scripts around. */
export function ensureDocument(output: SsrOutput): SsrOutput {
  if (findSection(output, 'head') !== undefined) {
    return output;
  }
  const bodySection = findSection(output, 'body');
  if (bodySection?.type === 'catch') {
    bodySection.boundary.output = ensureDocument(bodySection.boundary.output);
    return output;
  }
  const head = [createDocumentSection('head'), createDocumentSection('/head')];
  const body = splitAtSection(output, 'body');
  if (body !== null) {
    return [body[0], ...head, body[1], body[2]];
  }
  return [...head, createDocumentSection('body'), output, createDocumentSection('/body')];
}

export function takeDocumentEnd(output: SsrOutput): [SsrOutput, SsrOutput] | null {
  const split = splitAtSection(output, '/body');
  if (split !== null) {
    return [split[0], [split[1], split[2]]];
  }
  const bodyEnd = findSection(output, '/body');
  if (bodyEnd?.type !== 'catch') {
    return null;
  }
  const boundary = bodyEnd.boundary;
  boundary.isDocument = true;
  const end = takeDocumentEnd(boundary.output)!;
  boundary.output = end[0];
  return [output, end[1]];
}

export function wrapDocumentRange(start: SsrOutput, content: SsrOutput): SsrOutput {
  const body = splitAtSection(content, 'body');
  const closing = body === null ? null : splitAtSection(body[2], '/body');
  return body === null || closing === null
    ? [start, content, '<!/d>']
    : [body[0], body[1], start, closing[0], '<!/d>', closing[1], closing[2]];
}

/** Finds a compiler-marked document anchor structurally; pending output is not searched. */
export function splitAtSection(
  output: SsrOutput,
  section: SsrSection
): [SsrOutput, SsrRecordChunk, SsrOutput] | null {
  if (isSsrRecordChunk(output)) {
    return output.section === section ? ['', output, ''] : null;
  }
  if (!Array.isArray(output)) {
    return null;
  }
  for (let i = 0; i < output.length; i++) {
    const split = splitAtSection(output[i], section);
    if (split !== null) {
      return [[...output.slice(0, i), split[0]], split[1], [split[2], ...output.slice(i + 1)]];
    }
  }
  return null;
}

export function insertAtSection(
  output: SsrOutput,
  section: SsrSection,
  inserted: readonly SsrOutput[],
  placement: 'before' | 'after'
): SsrOutput {
  const split = splitAtSection(output, section);
  if (split === null) {
    const found = findSection(output, section);
    if (found?.type === 'catch') {
      const boundary = found.boundary;
      boundary.output = insertAtSection(boundary.output, section, inserted, placement);
      return output;
    }
    return [...inserted, output];
  }
  const [before, anchor, after] = split;
  return placement === 'after'
    ? [before, anchor, ...inserted, after]
    : [before, ...inserted, anchor, after];
}
