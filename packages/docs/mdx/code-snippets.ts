import type { BlockContent, Parent, Root } from 'mdast';
import type { Plugin, Transformer } from 'unified';
import { visit } from 'unist-util-visit';
import type { BuildVisitor } from 'unist-util-visit/complex-types';
import { VFile } from 'vfile';

declare module 'mdast' {
  interface BlockContentMap {
    codeSnippetWrapper: CodeSnippetWrapper;
  }
}

export function isMDXFile(file: VFile) {
  return file.history[0].endsWith('.mdx');
}
const CodeSnippetTagname = 'AutoImportedCodeSnippet';

const LanguageGroups = {
  code: ['astro', 'cjs', 'htm', 'html', 'js', 'jsx', 'mjs', 'svelte', 'ts', 'tsx', 'vue'],
  data: ['env', 'json', 'yaml', 'yml'],
  styles: ['css', 'less', 'sass', 'scss', 'styl', 'stylus'],
  textContent: ['markdown', 'md', 'mdx'],
};
const FileNameCommentRegExp = new RegExp(
  [
    // Start of line
    `^`,
    // Optional whitespace
    `\\s*`,
    // Mandatory comment start (`//`, `#` or `<!--`)
    `(?://|#|<!--)`,
    // Optional whitespace
    `\\s*`,
    // Optional sequence of characters, followed by a Japanese colon or a regular colon (`:`),
    // but not by `://`. Matches strings like `File name:`, but not `https://example.com/test.md`.
    `(?:(.*?)(?:\\uff1a|:(?!//)))?`,
    // Optional whitespace
    `\\s*`,
    // Optional sequence of characters allowed in file paths
    `([\\w./[\\]\\\\-]*`,
    // Mandatory dot and supported file extension
    `\\.(?:${Object.values(LanguageGroups).flat().sort().join('|')}))`,
    // Optional whitespace
    `\\s*`,
    // Optional HTML comment end (`-->`)
    `(?:-->)?`,
    // Optional whitespace
    `\\s*`,
    // End of line
    `$`,
  ].join('')
);

export interface CodeSnippetWrapper extends Parent {
  type: 'codeSnippetWrapper';
  children: BlockContent[];
}

export function remarkCodeSnippets(): Plugin<[], Root> {
  const makeVisitor =
    (format: 'md' | 'mdx'): BuildVisitor<Root, 'code'> =>
    (code, index, parent) => {
      if (index === null || parent === null) return;
      const isMDX = format === 'mdx';

      // Parse optional meta information after the opening code fence,
      // trying to get a meta title and an array of highlighted lines
      const { title: metaTitle, lineMarkings, inlineMarkings } = parseMeta(code.meta || '');
      let title = metaTitle;

      // Preprocess the code
      const { preprocessedCode, extractedFileName, removedLineIndex, removedLineCount } =
        preprocessCode(
          code.value,
          code.lang || '',
          // Only try to extract a file name from the code if no meta title was found above
          title === undefined
        );
      code.value = preprocessedCode;
      if (extractedFileName) {
        title = extractedFileName;
      }

      // If there was no title in the meta information or in the code, check if the previous
      // Markdown paragraph contains a file name that we can use as a title
      if (title === undefined && index > 0) {
        // Check the previous node to see if it matches our requirements
        const prev = parent.children[index - 1];
        const strongContent =
          // The previous node must be a paragraph...
          prev.type === 'paragraph' &&
          // ...it must contain exactly one child with strong formatting...
          prev.children.length === 1 &&
          prev.children[0].type === 'strong' &&
          // ...this child must also contain exactly one child
          prev.children[0].children.length === 1 &&
          // ...which is the result of this expression
          prev.children[0].children[0];

        // Require the strong content to be either raw text or inline code and retrieve its value
        const prevParaStrongTextValue =
          strongContent && strongContent.type === 'text' && strongContent.value;
        const prevParaStrongCodeValue =
          strongContent && strongContent.type === 'inlineCode' && strongContent.value;
        const potentialFileName = prevParaStrongTextValue || prevParaStrongCodeValue;

        // Check if it's a file name
        const matches = potentialFileName && FileNameCommentRegExp.exec(`// ${potentialFileName}`);
        if (matches) {
          // Yes, store the file name and replace the paragraph with an empty node
          title = matches[2];
          parent.children[index - 1] = {
            type: 'html',
            value: '',
          };
        }
      }

      const attributes = {
        lang: code.lang,
        title: encodeMarkdownStringProp(title),
        removedLineIndex,
        removedLineCount,
        lineMarkings: encodeMarkdownStringArrayProp(lineMarkings),
        inlineMarkings: encodeMarkdownStringArrayProp(inlineMarkings),
      };

      const codeSnippetWrapper = makeComponentNode(
        CodeSnippetTagname,
        { mdx: isMDX, attributes },
        code
      );

      parent.children.splice(index, 1, codeSnippetWrapper);
    };

  const mdVisitor = makeVisitor('md');
  const mdxVisitor = makeVisitor('mdx');

  const transformer: Transformer<Root> = (tree, file) => {
    visit(tree, 'code', isMDXFile(file) ? mdxVisitor : mdVisitor);
  };

  return function attacher() {
    return transformer;
  };
}

/**
 * Parses the given meta information string and returns contained supported properties.
 *
 * Meta information is the string after the opening code fence and language name.
 */
function parseMeta(meta: string) {
  // Try to find the meta property `title="..."` or `title='...'`,
  // store its value and remove it from meta
  let title: string | undefined;
  meta = meta.replace(/(?:\s|^)title\s*=\s*(["'])(.*?)(?<!\\)\1/, (_, __, content) => {
    title = content;
    return '';
  });

  // Find line marking definitions inside curly braces, with an optional marker type prefix.
  //
  // Examples:
  // - `{4-5,10}` (if no marker type prefix is given, it defaults to `mark`)
  // - `mark={4-5,10}`
  // - `del={4-5,10}`
  // - `ins={4-5,10}`
  const lineMarkings: string[] = [];
  meta = meta.replace(/(?:\s|^)(?:([a-zA-Z]+)\s*=\s*)?({[0-9,\s-]*})/g, (_, prefix, range) => {
    lineMarkings.push(`${prefix || 'mark'}=${range}`);
    return '';
  });

  // Find inline marking definitions inside single or double quotes (to match plaintext strings)
  // or forward slashes (to match regular expressions), with an optional marker type prefix.
  //
  // Examples for plaintext strings:
  // - `"Astro.props"`               (if no marker type prefix is given, it defaults to `mark`)
  // - `ins="<Button />"`            (matches will be marked with "inserted" style)
  // - `del="<p class=\"hi\">"`      (special chars in the search string can be escaped by `\`)
  // - `del='<p class="hi">'`        (use single quotes to make it easier to match double quotes)
  //
  // Examples for regular expressions:
  // - `/sidebar/`                   (if no marker type prefix is given, it defaults to `mark`)
  // - `mark=/astro-[a-z]+/`         (all common regular expression features are supported)
  // - `mark=/slot="(.*?)"/`         (if capture groups are contained, these will be marked)
  // - `del=/src\/pages\/.*\.astro/` (escaping special chars with a backslash works, too)
  // - `ins=/this|that/`
  const inlineMarkings: string[] = [];
  meta = meta.replace(
    /(?:\s|^)(?:([a-zA-Z]+)\s*=\s*)?([/"'])(.*?)(?<!\\)\2(?=\s|$)/g,
    (_, prefix, delimiter, expression) => {
      inlineMarkings.push(`${prefix || 'mark'}=${delimiter}${expression}${delimiter}`);
      return '';
    }
  );

  return {
    title,
    lineMarkings,
    inlineMarkings,
    meta,
  };
}

/**
 * Preprocesses the given raw code snippet before being handed to the syntax highlighter.
 *
 * Does the following things:
 * - Trims empty lines at the beginning or end of the code block
 * - If `extractFileName` is true, checks the first lines for a comment line with a file name.
 *   - If a matching line is found, removes it from the code
 *     and returns the extracted file name in the result object.
 * - Normalizes whitespace and line endings
 */
function preprocessCode(code: string, lang: string, extractFileName: boolean) {
  let extractedFileName: string | undefined;
  let removedLineIndex: number | undefined;
  let removedLineCount: number | undefined;

  // Split the code into lines and remove any empty lines at the beginning & end
  const lines = code.split(/\r?\n/);
  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }

  // If requested, try to find a file name comment in the first 5 lines of the given code
  if (extractFileName) {
    const lineIdx = lines.slice(0, 4).findIndex((line) => {
      const matches = FileNameCommentRegExp.exec(line);
      if (matches) {
        extractedFileName = matches[2];
        return true;
      }
      return false;
    });

    // If the syntax highlighting language is contained in our known language groups,
    // ensure that the extracted file name has an extension that matches the group
    if (extractedFileName) {
      const languageGroup = Object.values(LanguageGroups).find((group) => group.includes(lang));
      const fileExt = extractedFileName.match(/\.([^.]+)$/)?.[1];
      if (languageGroup && fileExt && !languageGroup.includes(fileExt)) {
        // The file extension does not match the syntax highlighting language,
        // so it's not a valid file name for this code snippet
        extractedFileName = undefined;
      }
    }

    // Was a valid file name comment line found?
    if (extractedFileName) {
      // Yes, remove it from the code
      lines.splice(lineIdx, 1);
      removedLineIndex = lineIdx;
      removedLineCount = 1;
      // If the following line is empty, remove it as well
      if (!lines[lineIdx]?.trim().length) {
        lines.splice(lineIdx, 1);
        removedLineCount++;
      }
    }
  }

  // If only one line is left, trim any leading indentation
  if (lines.length === 1) lines[0] = lines[0].trimStart();

  // Rebuild code with normalized line endings
  let preprocessedCode = lines.join('\n');

  // Convert tabs to 2 spaces
  preprocessedCode = preprocessedCode.replace(/\t/g, '  ');

  return {
    preprocessedCode,
    extractedFileName,
    removedLineIndex,
    removedLineCount,
  };
}

/** Encodes an optional string to allow passing it through Markdown/MDX component props */
export function encodeMarkdownStringProp(input: string | undefined) {
  return (input !== undefined && encodeURIComponent(input)) || undefined;
}

/** Encodes an optional string array to allow passing it through Markdown/MDX component props */
export function encodeMarkdownStringArrayProp(arrInput: string[] | undefined) {
  if (arrInput === undefined) return undefined;
  return arrInput.map((input) => encodeURIComponent(input)).join(',') || undefined;
}

interface NodeProps {
  attributes?: Record<string, string | boolean | number | undefined | null>;
}

function makeAFMDComponentNode(
  hName: string,
  { attributes }: NodeProps,
  ...children: BlockContent[]
) {
  return {
    type: 'afmdJsxFlowElement',
    data: { hName, hProperties: attributes },
    children,
  };
}

export function makeMDXComponentNode(
  name: string,
  { attributes = {} }: NodeProps = {},
  ...children: BlockContent[]
) {
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: Object.entries(attributes)
      // Filter out non-truthy attributes to avoid empty attrs being parsed as `true`.
      .filter(([_k, v]) => v !== false && Boolean(v))
      .map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value })),
    children,
  };
}

interface ComponentNodeProps extends NodeProps {
  mdx: boolean;
}

/**
 * Create AST node for a custom component injection. The data type differs
 * depending on if you need to inject into a MDX or Astro-flavored Markdown
 * context.
 *
 * @example
 * makeComponentNode('MyComponent', { mdx: true }, h('p', 'Paragraph inside component'))
 *
 */
export function makeComponentNode(
  tagName: string,
  { mdx, ...opts }: ComponentNodeProps,
  ...children: BlockContent[]
) {
  const factory = mdx ? makeMDXComponentNode : makeAFMDComponentNode;
  return factory(tagName, opts, ...children);
}
