import type { EcmaScriptModule, ParseResult, ParserOptions } from 'oxc-parser';

export type {
  ArrayPattern,
  ArrowFunctionExpression,
  AssignmentPattern,
  BindingIdentifier,
  BindingPattern,
  BindingProperty,
  BindingRestElement,
  BlockStatement,
  CallExpression,
  ChainExpression,
  Class,
  Declaration,
  DoWhileStatement,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Function,
  FunctionBody,
  IdentifierName,
  IdentifierReference,
  ImportAttribute,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  JSXAttribute,
  JSXAttributeItem,
  JSXAttributeName,
  JSXChild,
  JSXElement,
  JSXElementName,
  JSXExpression,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXNamespacedName,
  JSXOpeningElement,
  JSXSpreadAttribute,
  JSXText,
  MemberExpression,
  ModuleDeclaration,
  ModuleExportName,
  Node,
  ObjectPattern,
  ParamPattern,
  Program,
  PropertyKey,
  Statement,
  StringLiteral,
  TSEnumDeclaration,
  VariableDeclaration,
  VariableDeclarator,
  WhileStatement,
} from '@oxc-project/types';

export type AstNode = import('@oxc-project/types').Node;
export type AstProgram = import('@oxc-project/types').Program;
export type AstStatement = import('@oxc-project/types').Statement;
export type AstExpression = import('@oxc-project/types').Expression;
export type AstBindingPattern = import('@oxc-project/types').BindingPattern;
export type AstParamPattern = import('@oxc-project/types').ParamPattern;
export type AstFunction =
  | import('@oxc-project/types').Function
  | import('@oxc-project/types').ArrowFunctionExpression;
export type AstMaybeNode = AstNode | null | undefined;
export type AstParentNode = AstNode | null;
export type AstCompatNode = {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};
export type AstCompatMaybeNode = AstCompatNode | null | undefined;
export type AstPropertyWithValue =
  | import('@oxc-project/types').BindingProperty
  | import('@oxc-project/types').ObjectProperty;
export type AstRawTransferParserOptions = ParserOptions & {
  experimentalRawTransfer?: boolean;
};
export type AstParseComments = ParseResult['comments'];
export type AstParseErrors = ParseResult['errors'];
export type AstParseResult = ParseResult;
export type AstEcmaScriptModule = EcmaScriptModule;

export const RAW_TRANSFER_PARSER_OPTIONS: AstRawTransferParserOptions = {
  experimentalRawTransfer: true,
};
