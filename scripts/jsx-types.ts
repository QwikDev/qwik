import type { BuildConfig } from './util';
import { createWriteStream, readFileSync, writeFileSync } from 'fs';
import { get } from 'https';
import { format, resolveConfig } from 'prettier';
import { join } from 'path';
import ts from 'typescript';
import { validateTypeScriptFile } from './validate-build';

/**
 * Generate non-global JSX types so it can be scoped to just @builder.io/qwik.
 * Download the latest `@types/react` `index.d.ts` types file and
 * generate JSX types that can be extended by Qwik types.
 * Source: https://unpkg.com/@types/react/index.d.ts
 */
export async function generateJsxTypes(config: BuildConfig) {
  const typesUrl = `https://unpkg.com/@types/react/index.d.ts`;
  const reactTypesPath = join(config.distDir, 'react.jsx.d.ts');

  const url = await download(typesUrl, reactTypesPath);

  const reactTypesContent = readFileSync(reactTypesPath, 'utf-8');
  const sourceFile = parse(reactTypesContent);

  // parse out all of the IntrinsicElements
  const elements = getIntrinsicElements(sourceFile);
  let content = generateContent(sourceFile, elements, url);

  const generatedTypesPath = join(
    config.srcDir,
    'core',
    'render',
    'jsx',
    'types',
    'jsx-generated.ts'
  );

  // run prettier on the generated file so we have a consistent format
  const prettierOpts = await resolveConfig(generatedTypesPath);
  content = format(content, { ...prettierOpts, parser: 'typescript' });

  writeFileSync(generatedTypesPath, content);
  console.log('🐝', 'generated:', generatedTypesPath);

  validateTypeScriptFile(config, generatedTypesPath);
  console.log('💪', 'validate generated typescript file');
}

/**
 * Find and pick out the `IntrinsicElements` interface, which will
 * be within React's `declare global { namespace JSX { ... } }` block.
 */
export function getIntrinsicElements(sourceFile: ts.SourceFile) {
  const elements: IntrinsicElement[] = [];
  const intrinsicElementsNode = getInterface(sourceFile, 'IntrinsicElements');

  intrinsicElementsNode?.members.forEach((member) => {
    if (ts.isPropertySignature(member)) {
      const propSignature = member;
      if (ts.isIdentifier(propSignature.name)) {
        const nameIdentifier = String(propSignature.name.text);
        elements.push(
          generateIntrinsicElement(nameIdentifier, propSignature.type as ts.TypeReferenceNode)
        );
      }
    }
  });

  return elements;
}

/**
 * Parse out the tag name, attribute and element interfaces from React's `IntrinsicElements`.
 * HTML and SVG elements have two different property signatures.
 *
 * ```
 * declare global {
 *   namespace JSX {
 *     interface IntrinsicElements {
 *        a: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
 *        svg: React.SVGProps<SVGSVGElement>;
 *     }
 *   }
 * }
 * ```
 */
function generateIntrinsicElement(tag: string, type: ts.TypeReferenceNode) {
  const typeArguments = type.typeArguments!;
  const typeReference = typeArguments[0] as ts.TypeReferenceNode;
  const typeName = typeReference.typeName as ts.QualifiedName;
  const right = typeName.right as ts.Identifier;

  if (typeReference.typeArguments) {
    const childTypeReference = typeReference.typeArguments[0] as ts.TypeReferenceNode;
    const childTypeName = childTypeReference.typeName as ts.Identifier;
    const element: IntrinsicElement = {
      tag,
      attributesInterface: right.escapedText!,
      elementInterface: childTypeName.escapedText!,
    };
    return element;
  } else {
    const typeName = type.typeName as ts.QualifiedName;
    const elementTypeName = typeReference.typeName as ts.Identifier;
    const element: IntrinsicElement = {
      tag,
      attributesInterface: typeName.right.escapedText!,
      elementInterface: elementTypeName.escapedText!,
    };

    return element;
  }
}

/**
 * Using the parsed out data, generate a new JSX types WITHOUT declaring a global JSX.
 */
function generateContent(sourceFile: ts.SourceFile, elements: IntrinsicElement[], url: string) {
  const c = [
    `/* eslint-disable */`,
    `/* DO NOT EDIT!! Auto Generated from @types/react */`,
    `/* Source: ${url} */`,
    `/* See DEVELOPER.md on how to update */`,
    ``,
  ];

  REASSIGN.forEach((r) => c.push(r));

  const added = new Set<string>();
  function addType(typeName: string) {
    const t = getInterfaceOrType(sourceFile, typeName);
    if (t && !added.has(t.name)) {
      t.usingTypes.forEach((usingTypeName) => {
        addType(usingTypeName);
      });
      added.add(t.name);
      c.push(t.text);
    }
  }
  elements.forEach((elm) => addType(elm.attributesInterface));

  c.push(`export interface IntrinsicElements {`);
  c.push(...elements.map((e) => `${e.tag}: ${e.attributesInterface}<${e.elementInterface}>;`));
  c.push(`}`);

  return cleanup(c.join('\n'));
}

function cleanup(content: string) {
  // api-extractor requires that @deprecated has a message, so lets fake it
  content = content.replace(/\/\*\* @deprecated \*\//g, `/** @deprecated Deprecated */`);

  // manually comment out some lines we know shouldn't be included
  COMMENT_OUT.forEach((commentOut) => {
    const rg = new RegExp(commentOut, 'g');
    content = content.replace(rg, '// ' + commentOut);
  });

  return removeLineComments(content);
}

/**
 * Completely remove single-line comments from the text
 */
function removeLineComments(t: string) {
  return t
    .split('\n')
    .map((l) => {
      if (l.trim().startsWith('//')) {
        return '';
      }
      return l;
    })
    .join('\n');
}

export function getInterfaceOrType(sourceFile: ts.SourceFile, typeName: string) {
  if (!REASSIGN.has(typeName)) {
    const n = getInterface(sourceFile, typeName) || getType(sourceFile, typeName);
    if (n) {
      const t: TypeNode = {
        name: typeName,
        text: ts.createPrinter().printNode(ts.EmitHint.Unspecified, n, sourceFile),
        usingTypes: ts.isInterfaceDeclaration(n) ? getUsedTypes(n) : [],
      };
      t.text = removeLineComments(t.text);
      t.text = t.text.replace('export ', '');
      t.text = 'export ' + t.text;
      return t;
    }
  }
  return null;
}

/**
 * Pick out interfaces/types that are also used by an interface.
 */
function getUsedTypes(node: ts.InterfaceDeclaration) {
  const usedTypes = new Set<string>();

  function collectType(type: ts.Node) {
    if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      if (type.typeName.escapedText) {
        const typeName = String(type.typeName.escapedText);
        usedTypes.add(typeName);
      }
    }
  }

  if (node.heritageClauses) {
    node.heritageClauses.forEach((heritageClause) => {
      if (heritageClause.types) {
        heritageClause.types.forEach((hType) => {
          if (ts.isExpressionWithTypeArguments(hType)) {
            const exp = hType.expression;
            if (exp && ts.isIdentifier(exp)) {
              const typeName = String(exp.escapedText);
              usedTypes.add(typeName);
            }
          }
        });
      }
    });
  }

  if (node.members) {
    node.members.forEach((member) => {
      if (ts.isPropertySignature(member)) {
        const propSignature = member;
        if (propSignature.type) {
          collectType(propSignature.type);
          if (ts.isUnionTypeNode(propSignature.type)) {
            const types = propSignature.type.types;
            types.forEach(collectType);
          }
        }
      }
    });
  }

  return Array.from(usedTypes);
}

function getInterface(
  sourceFile: ts.SourceFile,
  interfaceName: string
): ts.InterfaceDeclaration | undefined {
  let interfaceNode: ts.InterfaceDeclaration | undefined = undefined;
  function visitor(node: ts.Node) {
    if (!interfaceNode) {
      if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
        interfaceNode = node;
      } else {
        node.forEachChild(visitor);
      }
    }
  }
  sourceFile.forEachChild(visitor);
  return interfaceNode;
}

function getType(sourceFile: ts.SourceFile, typeName: string): ts.TypeAliasDeclaration | undefined {
  let typeAliasNode: ts.TypeAliasDeclaration | undefined = undefined;
  function visitor(node: ts.Node) {
    if (!typeAliasNode) {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
        typeAliasNode = node;
      } else {
        node.forEachChild(visitor);
      }
    }
  }
  sourceFile.forEachChild(visitor);
  return typeAliasNode;
}

/**
 * Request and write the download to disk.
 * Also follow any location redirects.
 */
function download(url: string, dest: string) {
  return new Promise<string>((resolve, reject) => {
    console.log(`request: ${url}`);
    get(url, (rsp) => {
      if (rsp.headers.location) {
        const redirectedUrl = new URL(rsp.headers.location, url).href;
        download(redirectedUrl, dest).then(resolve, reject);
      } else {
        const file = createWriteStream(dest);
        rsp.pipe(file);
        file.on('finish', function () {
          (file.close as any)(() => resolve(url));
        });
      }
    }).on('error', reject);
  });
}

export function parse(contents: string) {
  return ts.createSourceFile('index.d.ts', contents, ts.ScriptTarget.Latest);
}

/**
 * Interfaces to reassign a new value.
 */
const REASSIGN = new Map([
  ['DOMAttributes', 'import type { DOMAttributes } from "./jsx-qwik-attributes";'],
  ['CSSProperties', 'interface CSSProperties { [key: string]: string | number };'],
  ['HTMLWebViewElement', 'interface HTMLWebViewElement extends HTMLElement {};'],
  ['ClassAttributes', 'interface ClassAttributes<T> {};'],
]);

/**
 * Lines to manually comment out with single-line comments
 */
const COMMENT_OUT = [
  'onChange',
  'onToggle',
  'export type ChangeEventHandler',
  'export type ReactEventHandler',
  'defaultChecked',
  'defaultValue',
  'suppressContentEditableWarning',
  'suppressHydrationWarning',
];

interface TypeNode {
  name: string;
  text: string;
  usingTypes: string[];
}

interface IntrinsicElement {
  tag: string;
  attributesInterface: string;
  elementInterface: string;
}
