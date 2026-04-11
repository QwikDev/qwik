/**
 * Snapshot parser for Qwik optimizer .snap files (Rust insta format).
 *
 * Parses YAML frontmatter, optional INPUT section, segment blocks with
 * metadata, parent module blocks, and diagnostics.
 */

import { createRegExp, exactly, oneOrMore, char, whitespace, linefeed, multiline as m, global as g } from 'magic-regexp';

export interface SegmentMetadata {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  path: string;
  extension: string;
  parent: string | null;
  ctxKind: string;
  ctxName: string;
  captures: boolean;
  loc: [number, number];
  paramNames?: string[];
  captureNames?: string[];
}

export interface Diagnostic {
  category: string;
  code: string;
  file: string;
  message: string;
  highlights: Array<{
    lo: number;
    hi: number;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }> | null;
  suggestions: null;
  scope: string;
}

export interface SegmentBlock {
  filename: string;
  isEntryPoint: boolean;
  code: string;
  sourceMap: string | null;
  metadata: SegmentMetadata | null;
}

export interface ParentModule {
  filename: string;
  code: string;
  sourceMap: string | null;
}

export interface ParsedSnapshot {
  frontmatter: { source: string; assertionLine: number; expression: string };
  input: string | null;
  segments: SegmentBlock[];
  parentModules: ParentModule[];
  diagnostics: Diagnostic[];
}

/**
 * Parse a .snap file content string into structured data.
 */
export function parseSnapshot(content: string): ParsedSnapshot {
  // 1. Extract YAML frontmatter
  const frontmatter = parseFrontmatter(content);

  // 2. Strip frontmatter from content
  const afterFrontmatter = stripFrontmatter(content);

  // 3. Extract diagnostics section (always last)
  const { body, diagnostics } = extractDiagnostics(afterFrontmatter);

  // 4. Extract optional INPUT section
  const { input, rest } = extractInput(body);

  // 5. Parse section blocks (segments and parent modules)
  const { segments, parentModules } = parseSections(rest);

  return {
    frontmatter,
    input,
    segments,
    parentModules,
    diagnostics,
  };
}

function parseFrontmatter(content: string): ParsedSnapshot['frontmatter'] {
  // Find the YAML frontmatter between --- delimiters
  const firstDash = content.indexOf('---');
  if (firstDash === -1) {
    throw new Error('No frontmatter found (missing opening ---)');
  }
  const secondDash = content.indexOf('---', firstDash + 3);
  if (secondDash === -1) {
    throw new Error('No frontmatter found (missing closing ---)');
  }

  const yaml = content.slice(firstDash + 3, secondDash).trim();
  const lines = yaml.split('\n');

  let source = '';
  let assertionLine = 0;
  let expression = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('source:')) {
      source = trimmed.slice('source:'.length).trim();
    } else if (trimmed.startsWith('assertion_line:')) {
      assertionLine = parseInt(trimmed.slice('assertion_line:'.length).trim(), 10);
    } else if (trimmed.startsWith('expression:')) {
      expression = trimmed.slice('expression:'.length).trim();
    }
  }

  return { source, assertionLine, expression };
}

function stripFrontmatter(content: string): string {
  const firstDash = content.indexOf('---');
  const secondDash = content.indexOf('---', firstDash + 3);
  return content.slice(secondDash + 3);
}

function extractDiagnostics(body: string): { body: string; diagnostics: Diagnostic[] } {
  const diagMarker = '== DIAGNOSTICS ==';
  const diagIdx = body.indexOf(diagMarker);

  if (diagIdx === -1) {
    return { body, diagnostics: [] };
  }

  const beforeDiag = body.slice(0, diagIdx);
  const diagContent = body.slice(diagIdx + diagMarker.length).trim();

  let diagnostics: Diagnostic[] = [];
  if (diagContent) {
    try {
      diagnostics = JSON.parse(diagContent);
    } catch {
      // If diagnostics JSON is malformed, return empty array
      diagnostics = [];
    }
  }

  return { body: beforeDiag, diagnostics };
}

function extractInput(body: string): { input: string | null; rest: string } {
  const inputMarker = '==INPUT==';
  const inputIdx = body.indexOf(inputMarker);

  if (inputIdx === -1) {
    return { input: null, rest: body };
  }

  let afterInput = body.slice(inputIdx + inputMarker.length);
  // Strip the newline immediately after ==INPUT== (part of the marker line)
  // but preserve all subsequent whitespace (affects byte offsets for qrlDEV lo/hi)
  if (afterInput.startsWith('\n')) afterInput = afterInput.slice(1);

  // Find the next section delimiter (===...===) after INPUT
  const delimMatch = afterInput.match(createRegExp(
    exactly('=').times.atLeast(3)
      .and(whitespace.times.any())
      .and(oneOrMore(char))
      .and(whitespace.times.any())
      .and(exactly('=='))
      .at.lineStart()
      .at.lineEnd(),
    [m],
  ));
  if (!delimMatch || delimMatch.index === undefined) {
    // No sections after input -- entire rest is input
    // Use trimEnd() to preserve leading newlines (they affect byte offsets
    // for qrlDEV lo/hi values which the Rust optimizer computes from the
    // original input including leading whitespace)
    return { input: afterInput.trimEnd(), rest: '' };
  }

  const input = afterInput.slice(0, delimMatch.index).trimEnd();
  const rest = afterInput.slice(delimMatch.index);

  return { input: input || null, rest };
}

/**
 * Section delimiter pattern: lines like
 *   ============================= filename.tsx (ENTRY POINT)==
 *   ============================= filename.tsx ==
 */
const SECTION_DELIM_RE = createRegExp(
  exactly('=').times.atLeast(3).groupedAs('eq')
    .and(whitespace.times.any())
    .and(oneOrMore(char).groupedAs('name'))
    .and(whitespace.times.any())
    .and(exactly('==').groupedAs('end'))
    .at.lineStart()
    .at.lineEnd(),
);

function parseSections(body: string): {
  segments: SegmentBlock[];
  parentModules: ParentModule[];
} {
  const segments: SegmentBlock[] = [];
  const parentModules: ParentModule[] = [];

  const lines = body.split('\n');

  // Find all delimiter line indices
  const delimiters: Array<{ index: number; filename: string; isEntryPoint: boolean }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_DELIM_RE);
    if (match) {
      const rawFilename = (match.groups?.name ?? match[2])!.trim();
      const isEntryPoint = rawFilename.includes('(ENTRY POINT)');
      const filename = rawFilename.replace('(ENTRY POINT)', '').trim();
      delimiters.push({ index: i, filename, isEntryPoint });
    }
  }

  // Process each section
  for (let d = 0; d < delimiters.length; d++) {
    const delim = delimiters[d];
    const startLine = delim.index + 1;
    const endLine = d + 1 < delimiters.length ? delimiters[d + 1].index : lines.length;

    const sectionLines = lines.slice(startLine, endLine);
    const sectionBody = sectionLines.join('\n');

    // Try to extract metadata JSON (inside /* ... */ comment)
    const metadata = extractMetadata(sectionBody);

    if (metadata !== null) {
      // This is a segment block (has metadata)
      const { code, sourceMap } = extractCodeAndSourceMap(sectionBody);
      segments.push({
        filename: delim.filename,
        isEntryPoint: delim.isEntryPoint,
        code,
        sourceMap,
        metadata,
      });
    } else {
      // This is a parent module block (no metadata)
      const { code, sourceMap } = extractCodeAndSourceMap(sectionBody);
      parentModules.push({
        filename: delim.filename,
        code,
        sourceMap,
      });
    }
  }

  return { segments, parentModules };
}

function extractMetadata(sectionBody: string): SegmentMetadata | null {
  // Metadata is inside /* ... */ block
  const metaStart = sectionBody.lastIndexOf('/*\n');
  if (metaStart === -1) return null;

  const metaEnd = sectionBody.indexOf('*/', metaStart);
  if (metaEnd === -1) return null;

  const jsonStr = sectionBody.slice(metaStart + 2, metaEnd).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed as SegmentMetadata;
  } catch {
    return null;
  }
}

function extractCodeAndSourceMap(sectionBody: string): {
  code: string;
  sourceMap: string | null;
} {
  // Find the Some("...") source map line
  const someMatch = sectionBody.match(createRegExp(
    exactly('Some("')
      .and(char.times.any().groupedAs('val'))
      .and(exactly('")'))
      .at.lineStart()
      .at.lineEnd(),
    [m],
  ));

  let sourceMap: string | null = null;
  let code: string;

  if (someMatch && someMatch.index !== undefined) {
    sourceMap = (someMatch.groups?.val ?? someMatch[1])!
      // Unescape the JSON-like escaped string
      .replace(createRegExp(exactly('\\"'), [g]), '"')
      .replace(createRegExp(exactly('\\\\'), [g]), '\\');

    // Code is everything before the Some(...) line
    code = sectionBody.slice(0, someMatch.index).trimEnd();
  } else {
    code = sectionBody;
  }

  // Strip trailing metadata block from code if present
  const metaStart = code.lastIndexOf('/*\n');
  if (metaStart !== -1) {
    const metaEnd = code.indexOf('*/', metaStart);
    if (metaEnd !== -1) {
      code = code.slice(0, metaStart).trimEnd();
    }
  }

  // Trim leading/trailing whitespace but preserve internal formatting
  code = code
    .replace(createRegExp(oneOrMore(linefeed).at.lineStart()), '')
    .replace(createRegExp(oneOrMore(linefeed).at.lineEnd()), '');

  return { code, sourceMap };
}
