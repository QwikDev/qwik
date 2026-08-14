import type { Program } from 'oxc-parser';
import {
  getIdentifierName,
  getRange,
  isFunctionLike,
  isNativeTag,
  unwrapExpression,
} from './ast-utils';
import { visit as visitAst } from './jsx-ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import type {
  BindingId,
  BindingInfo,
  ComponentCandidatePlan,
  DestructureTemp,
  DestructuredMemberOrigin,
  ExportBindingInfo,
  ImportBinding,
  ModuleAnalysis,
  ModuleItemPlan,
  ReferenceInfo,
} from './plan-types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

type BindingKind = BindingInfo['kind'];
type ReferenceRole = ReferenceInfo['role'];
type ScopeKind = 'module' | 'function' | 'block' | 'class' | 'static-block';

interface Scope {
  readonly id: number;
  readonly parentId: number | null;
  readonly ownerId: number;
  readonly kind: ScopeKind;
  readonly bindings: Map<string, BindingId>;
}

interface FunctionCandidate {
  readonly bindingId: BindingId | null;
  readonly fn: AstFunction;
  readonly replacementRange: SourceRange | null;
  readonly statementIndex: number;
  readonly wrapped: boolean;
  exported: boolean;
  exportName: string | 'default';
  readonly localName: string | null;
  readonly declarationKind: ComponentCandidatePlan['declarationKind'];
}

interface FunctionLookup {
  readonly fn: AstFunction;
  readonly wrapped: boolean;
  readonly replacementRange: SourceRange | null;
}

const ITERATION_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'flatMap',
  'some',
  'every',
  'find',
  'findIndex',
  'reduce',
  'reduceRight',
]);

export function analyzeModule(program: Program): ModuleAnalysis {
  return new ModuleAnalyzer(program).analyze();
}

export function findBindingByDeclaration(
  analysis: ModuleAnalysis,
  name: string,
  range: SourceRange | null
): BindingInfo | null {
  return (
    analysis.bindings.find(
      (binding) => binding.name === name && sameRange(binding.declarationRange, range)
    ) ?? null
  );
}

export function findReference(
  analysis: ModuleAnalysis,
  range: SourceRange | null
): ReferenceInfo | null {
  return analysis.references.find((reference) => sameRange(reference.range, range)) ?? null;
}

class ModuleAnalyzer {
  private readonly scopes: Scope[] = [];
  private readonly bindings: BindingInfo[] = [];
  private readonly references: ReferenceInfo[] = [];
  private readonly declarationBindings = new Map<string, BindingId>();
  private readonly referenceBindings = new Map<string, BindingId | null>();
  private readonly jsxTagBindings = new Set<BindingId>();
  private scopeId = -1;
  private ownerId = 0;
  private nextOwnerId = 1;

  constructor(private readonly program: Program) {}

  analyze(): ModuleAnalysis {
    this.scopeId = this.createScope(null, 0, 'module');
    this.predeclareStatements(this.program.body, this.scopeId);
    this.predeclareVars(this.program, this.scopeId);
    for (const statement of this.program.body) {
      this.visit(statement);
    }
    const jsxOwners = collectJsxOwners(this.program);
    const destructures = this.collectDestructuredMembers(jsxOwners.functionRanges);
    return {
      bindings: this.bindings,
      references: this.references,
      exports: this.collectExports(),
      items: this.classifyModuleItems(),
      moduleJsxRange: jsxOwners.moduleRange,
      moduleArgumentJsxRanges: jsxOwners.moduleArgumentJsxRanges,
      jsxFunctionRanges: jsxOwners.functionRanges,
      jsxTagBindingIds: [...this.jsxTagBindings],
      destructuredMembers: destructures.members,
      destructureTemps: destructures.temps,
    };
  }

  /**
   * Destructured members freeze their container's slot at setup time, which breaks reactivity in
   * lazy boundaries. Collect each eligible `const { prop } = base` member so boundaries can capture
   * the container and re-read `base.prop` live. A call-init destructure gets a compiler temp that
   * pins the container under a fresh name.
   */
  private collectDestructuredMembers(jsxFunctionRanges: readonly SourceRange[]): {
    members: Map<BindingId, DestructuredMemberOrigin>;
    temps: DestructureTemp[];
  } {
    const members = new Map<BindingId, DestructuredMemberOrigin>();
    const temps: DestructureTemp[] = [];
    const constBindings = new Set<BindingId>();
    const calleeBindings = new Set<BindingId>();
    for (const reference of this.references) {
      if (reference.role === 'call' && reference.bindingId !== null) {
        calleeBindings.add(reference.bindingId);
      }
    }
    const usedNames = new Set(this.bindings.map((binding) => binding.name));
    const declarations: {
      node: Extract<AstNode, { type: 'VariableDeclaration' }>;
      ownerFunctionRange: SourceRange | null;
    }[] = [];
    const walk = (node: unknown, ownerFunctionRange: SourceRange | null): void => {
      if (Array.isArray(node)) {
        node.forEach((child) => walk(child, ownerFunctionRange));
        return;
      }
      if (typeof node !== 'object' || node === null) {
        return;
      }
      const record = node as unknown as AstNode;
      if (
        record.type === 'FunctionDeclaration' ||
        record.type === 'FunctionExpression' ||
        record.type === 'ArrowFunctionExpression'
      ) {
        ownerFunctionRange = getRange(record);
      }
      if (record.type === 'VariableDeclaration' && record.kind === 'const') {
        declarations.push({ node: record, ownerFunctionRange });
        for (const declarator of record.declarations) {
          this.collectPatternBindings(declarator.id, constBindings);
        }
      }
      for (const [key, value] of Object.entries(record)) {
        if (!SKIPPED_KEYS.has(key)) {
          walk(value, ownerFunctionRange);
        }
      }
    };
    walk(this.program.body, null);
    for (const { node: declaration, ownerFunctionRange } of declarations) {
      for (const declarator of declaration.declarations) {
        const pattern = unwrapExpression(declarator.id);
        if (pattern?.type !== 'ObjectPattern') {
          continue;
        }
        const plainMembers = this.plainPatternMembers(pattern, calleeBindings);
        if (plainMembers.length === 0) {
          continue;
        }
        // module-scope members flow through module references, not captures — leave them
        if (plainMembers.some((member) => this.bindings[member.bindingId].kind !== 'local')) {
          continue;
        }
        const baseBindingId = this.resolveDestructureBase(
          declaration,
          declarator,
          plainMembers[0].bindingId,
          constBindings,
          usedNames,
          temps,
          ownerFunctionRange,
          jsxFunctionRanges
        );
        if (baseBindingId === null) {
          continue;
        }
        for (const member of plainMembers) {
          members.set(member.bindingId, { baseBindingId, prop: member.prop });
        }
      }
    }
    return { members, temps };
  }

  private collectPatternBindings(pattern: unknown, into: Set<BindingId>): void {
    const node = unwrapExpression(pattern);
    if (!node) {
      return;
    }
    if (node.type === 'Identifier') {
      const range = getRange(node);
      const id = range === null ? undefined : this.declarationBindings.get(rangeKey(range));
      if (id !== undefined) {
        into.add(id);
      }
    } else if (node.type === 'AssignmentPattern') {
      this.collectPatternBindings(node.left, into);
    } else if (node.type === 'RestElement') {
      this.collectPatternBindings(node.argument, into);
    } else if (node.type === 'ArrayPattern') {
      node.elements.forEach((element) => this.collectPatternBindings(element, into));
    } else if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        this.collectPatternBindings(
          property.type === 'RestElement' ? property.argument : property.value,
          into
        );
      }
    }
  }

  /** Members with defaults, computed keys, nested patterns, rest, or callee use keep snapshots. */
  private plainPatternMembers(
    pattern: Extract<AstNode, { type: 'ObjectPattern' }>,
    calleeBindings: ReadonlySet<BindingId>
  ): { bindingId: BindingId; prop: string }[] {
    const plain: { bindingId: BindingId; prop: string }[] = [];
    for (const property of pattern.properties) {
      if (property.type === 'RestElement' || property.computed) {
        continue;
      }
      const value = property.value;
      const prop = getIdentifierName(property.key);
      if (prop === null || value?.type !== 'Identifier') {
        continue;
      }
      const range = getRange(value);
      const bindingId = range === null ? undefined : this.declarationBindings.get(rangeKey(range));
      // a member ever called as a bare function keeps its snapshot: `base.fn()` rebinds `this`
      if (bindingId === undefined || calleeBindings.has(bindingId)) {
        continue;
      }
      plain.push({ bindingId, prop });
    }
    return plain;
  }

  private resolveDestructureBase(
    declaration: Extract<AstNode, { type: 'VariableDeclaration' }>,
    declarator: Extract<AstNode, { type: 'VariableDeclaration' }>['declarations'][number],
    memberBindingId: BindingId,
    constBindings: ReadonlySet<BindingId>,
    usedNames: Set<string>,
    temps: DestructureTemp[],
    ownerFunctionRange: SourceRange | null,
    jsxFunctionRanges: readonly SourceRange[]
  ): BindingId | null {
    const init = unwrapExpression(declarator.init);
    if (init?.type === 'Identifier') {
      const range = getRange(init);
      const bindingId = range === null ? undefined : this.referenceBindings.get(rangeKey(range));
      if (bindingId === undefined || bindingId === null || !constBindings.has(bindingId)) {
        return null;
      }
      const binding = this.bindings[bindingId];
      return binding.kind === 'local' ? bindingId : null;
    }
    if (init?.type !== 'CallExpression') {
      return null;
    }
    // temps materialize only in setup statements: require a JSX-owning enclosing function
    if (
      ownerFunctionRange === null ||
      !jsxFunctionRanges.some(
        (range) => range[0] === ownerFunctionRange[0] && range[1] === ownerFunctionRange[1]
      )
    ) {
      return null;
    }
    const initRange = getRange(init);
    const statementRange = getRange(declaration);
    if (initRange === null || statementRange === null) {
      return null;
    }
    const member = this.bindings[memberBindingId];
    const name = allocateTempName(getIdentifierName(init.callee), usedNames);
    const id = this.bindings.length;
    this.bindings.push({
      id,
      name,
      kind: 'local',
      // zero-width range at the statement keeps segment-locality checks correct
      declarationRange: [statementRange[0], statementRange[0]],
      scopeId: member.scopeId,
      ownerId: member.ownerId,
      import: null,
    });
    temps.push({ bindingId: id, name, statementStart: statementRange[0], initRange });
    return id;
  }

  private collectExports(): ExportBindingInfo[] {
    const exports: ExportBindingInfo[] = [];
    const add = (bindingId: BindingId | null, exportedName: string, range: SourceRange | null) => {
      if (
        bindingId !== null &&
        range !== null &&
        !exports.some((item) => item.bindingId === bindingId && item.exportedName === exportedName)
      ) {
        exports.push({ bindingId, exportedName, range });
      }
    };

    for (const statement of this.program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        const declaration = statement.declaration;
        if (
          declaration?.type === 'FunctionDeclaration' ||
          declaration?.type === 'ClassDeclaration'
        ) {
          const name = getIdentifierName(declaration.id);
          add(this.declarationBinding(declaration.id), name ?? 'default', getRange(statement));
        } else if (declaration?.type === 'VariableDeclaration') {
          for (const item of declaration.declarations) {
            for (const identifier of patternIdentifiers(item.id)) {
              add(this.declarationBinding(identifier), identifier.name, getRange(statement));
            }
          }
        }
        if (statement.source === null) {
          for (const specifier of statement.specifiers) {
            const local = getIdentifierName(specifier.local);
            const exported = moduleExportName(specifier.exported);
            add(
              local === null ? null : this.resolve(local, 0),
              exported ?? local ?? '',
              getRange(specifier)
            );
          }
        }
      } else if (statement.type === 'ExportDefaultDeclaration') {
        if (statement.declaration.type === 'Identifier') {
          add(this.resolve(statement.declaration.name, 0), 'default', getRange(statement));
        } else if (
          statement.declaration.type === 'FunctionDeclaration' ||
          statement.declaration.type === 'ClassDeclaration'
        ) {
          add(this.declarationBinding(statement.declaration.id), 'default', getRange(statement));
        }
      }
    }
    return exports;
  }

  private visit(node: unknown): void {
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
        return;
      case 'ExportNamedDeclaration':
        if (node.source === null) {
          for (const specifier of node.specifiers) {
            this.recordIdentifier(specifier.local, 'read');
          }
        }
        this.visit(node.declaration);
        return;
      case 'ExportDefaultDeclaration':
        if (node.declaration.type === 'Identifier') {
          this.recordIdentifier(node.declaration, 'read');
        } else {
          this.visit(node.declaration);
        }
        return;
      case 'VariableDeclaration':
        for (const declaration of node.declarations) {
          this.visitPatternExpressions(declaration.id);
          this.visit(declaration.init);
        }
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        this.visitFunction(node, 'param');
        return;
      case 'BlockStatement':
        this.withScope('block', () => {
          this.predeclareStatements(node.body, this.scopeId);
          for (const statement of node.body) {
            this.visit(statement);
          }
        });
        return;
      case 'StaticBlock':
        this.withScope('static-block', () => {
          this.predeclareStatements(node.body, this.scopeId);
          this.predeclareVars(node, this.scopeId);
          for (const statement of node.body) {
            this.visit(statement);
          }
        });
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        this.visitClass(node);
        return;
      case 'CallExpression':
        this.visitCall(node);
        return;
      case 'NewExpression':
        this.visitCallee(node.callee);
        for (const argument of node.arguments) {
          this.visit(argument);
        }
        return;
      case 'Identifier':
        this.recordIdentifier(node, 'read');
        return;
      case 'MemberExpression':
        this.visit(node.object);
        if (node.computed) {
          this.visit(node.property);
        }
        return;
      case 'Property':
        if (node.computed) {
          this.visit(node.key);
        }
        if (node.shorthand && node.value.type === 'Identifier') {
          this.recordIdentifier(node.value, 'shorthand');
        } else {
          this.visit(node.value);
        }
        return;
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty': {
        const member = node as AstNode & {
          computed?: boolean;
          key?: unknown;
          value?: unknown;
          decorators?: unknown[];
        };
        if (member.computed) {
          this.visit(member.key);
        }
        for (const decorator of member.decorators ?? []) {
          this.visit(decorator);
        }
        this.visit(member.value);
        return;
      }
      case 'ObjectExpression':
        for (const property of node.properties) {
          this.visit(property);
        }
        return;
      case 'ArrayExpression':
        for (const element of node.elements) {
          this.visit(element);
        }
        return;
      case 'SpreadElement':
      case 'AwaitExpression':
      case 'YieldExpression':
      case 'UnaryExpression':
        this.visit(node.argument);
        return;
      case 'UpdateExpression':
        this.visitAssignmentTarget(node.argument);
        return;
      case 'AssignmentExpression':
        this.visitAssignmentTarget(node.left);
        this.visit(node.right);
        return;
      case 'BinaryExpression':
      case 'LogicalExpression':
        this.visit(node.left);
        this.visit(node.right);
        return;
      case 'ConditionalExpression':
        this.visit(node.test);
        this.visit(node.consequent);
        this.visit(node.alternate);
        return;
      case 'TemplateLiteral':
        for (const expression of node.expressions) {
          this.visit(expression);
        }
        return;
      case 'TaggedTemplateExpression':
        this.visitCallee(node.tag);
        this.visit(node.quasi);
        return;
      case 'JSXElement':
        this.visitJsxName(node.openingElement.name, true);
        for (const attribute of node.openingElement.attributes) {
          this.visit(attribute);
        }
        for (const child of node.children) {
          this.visit(child);
        }
        return;
      case 'JSXFragment':
        for (const child of node.children) {
          this.visit(child);
        }
        return;
      case 'JSXAttribute':
        this.visit(node.value);
        return;
      case 'JSXSpreadAttribute':
        this.visit(node.argument);
        return;
      case 'JSXExpressionContainer':
        this.visit(node.expression);
        return;
      case 'JSXIdentifier':
      case 'JSXText':
      case 'JSXEmptyExpression':
        return;
      case 'IfStatement':
        this.visit(node.test);
        this.visit(node.consequent);
        this.visit(node.alternate);
        return;
      case 'ForStatement':
        this.visitForStatement(node);
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        this.visitForInStatement(node);
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
        this.visit(node.test);
        this.visit(node.body);
        return;
      case 'SwitchStatement':
        this.visitSwitch(node);
        return;
      case 'CatchClause':
        this.withScope('block', () => {
          this.definePattern(node.param, 'local', this.scopeId);
          this.visitPatternExpressions(node.param);
          this.visit(node.body);
        });
        return;
      case 'TryStatement':
        this.visit(node.block);
        this.visit(node.handler);
        this.visit(node.finalizer);
        return;
      case 'ReturnStatement':
      case 'ThrowStatement':
      case 'ExpressionStatement':
        this.visit(node.type === 'ExpressionStatement' ? node.expression : node.argument);
        return;
      case 'LabeledStatement':
        this.visit(node.body);
        return;
      case 'ChainExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        this.visit(node.expression);
        return;
      default:
        if (!node.type.startsWith('TS')) {
          this.visitUnknownChildren(node);
        }
    }
  }

  private visitFunction(fn: AstFunction, parameterKind: 'param' | 'loop'): void {
    const previousScope = this.scopeId;
    const previousOwner = this.ownerId;
    this.ownerId = this.nextOwnerId++;
    this.scopeId = this.createScope(previousScope, this.ownerId, 'function');
    if (fn.type === 'FunctionExpression') {
      this.defineIdentifier(fn.id, 'local', this.scopeId, null);
    }
    for (const parameter of fn.params) {
      this.definePattern(parameter, parameterKind, this.scopeId);
    }
    for (const parameter of fn.params) {
      this.visitPatternExpressions(parameter);
    }
    const body = unwrapExpression(fn.body);
    if (body?.type === 'BlockStatement') {
      this.predeclareStatements(body.body, this.scopeId);
      this.predeclareVars(body, this.scopeId);
      for (const statement of body.body) {
        this.visit(statement);
      }
    } else {
      this.visit(body);
    }
    this.scopeId = previousScope;
    this.ownerId = previousOwner;
  }

  private visitCall(node: Extract<AstNode, { type: 'CallExpression' }>): void {
    this.visitCallee(node.callee);
    const loop = isIterationCall(node);
    for (let index = 0; index < node.arguments.length; index++) {
      const argument = node.arguments[index];
      const expression = unwrapExpression(
        argument.type === 'SpreadElement' ? argument.argument : argument
      );
      if (index === 0 && loop && isFunctionLike(expression)) {
        this.visitFunction(expression, 'loop');
      } else {
        this.visit(argument);
      }
    }
  }

  private visitCallee(node: unknown): void {
    const expression = unwrapExpression(node);
    if (expression?.type === 'Identifier') {
      this.recordIdentifier(expression, 'call');
    } else {
      this.visit(expression);
    }
  }

  private visitClass(node: Extract<AstNode, { type: 'ClassDeclaration' | 'ClassExpression' }>) {
    this.visit(node.superClass);
    for (const decorator of node.decorators ?? []) {
      this.visit(decorator);
    }
    this.withScope('class', () => {
      if (node.type === 'ClassExpression') {
        this.defineIdentifier(node.id, 'local', this.scopeId, null);
      }
      for (const element of node.body.body) {
        this.visit(element);
      }
    });
  }

  private visitForStatement(node: Extract<AstNode, { type: 'ForStatement' }>): void {
    this.withScope('block', () => {
      if (node.init?.type === 'VariableDeclaration') {
        this.predeclareVariable(node.init, this.scopeId);
      }
      this.visit(node.init);
      this.visit(node.test);
      this.visit(node.update);
      this.visit(node.body);
    });
  }

  private visitForInStatement(
    node: Extract<AstNode, { type: 'ForInStatement' | 'ForOfStatement' }>
  ): void {
    this.withScope('block', () => {
      if (node.left.type === 'VariableDeclaration') {
        this.predeclareVariable(node.left, this.scopeId, 'loop');
        this.visit(node.left);
      } else {
        this.visitAssignmentTarget(node.left);
      }
      this.visit(node.right);
      this.visit(node.body);
    });
  }

  private visitSwitch(node: Extract<AstNode, { type: 'SwitchStatement' }>): void {
    this.visit(node.discriminant);
    this.withScope('block', () => {
      const statements = node.cases.flatMap((item) => item.consequent);
      this.predeclareStatements(statements, this.scopeId);
      for (const item of node.cases) {
        this.visit(item.test);
        for (const statement of item.consequent) {
          this.visit(statement);
        }
      }
    });
  }

  private visitJsxName(node: AstNode, direct: boolean): void {
    if (node.type === 'JSXIdentifier') {
      if (direct && !isNativeTag(node.name)) {
        const bindingId = this.recordName(node.name, getRange(node), 'read');
        if (bindingId !== null) {
          this.jsxTagBindings.add(bindingId);
        }
      }
      return;
    }
    if (node.type === 'JSXMemberExpression') {
      this.visitJsxName(node.object, false);
      if (node.object.type === 'JSXIdentifier') {
        this.recordName(node.object.name, getRange(node.object), 'read');
      }
    }
  }

  private visitAssignmentTarget(node: unknown): void {
    const expression = unwrapExpression(node);
    if (!expression) {
      return;
    }
    switch (expression.type) {
      case 'Identifier':
        this.recordIdentifier(expression, 'write');
        return;
      case 'AssignmentPattern':
        this.visitAssignmentTarget(expression.left);
        this.visit(expression.right);
        return;
      case 'RestElement':
        this.visitAssignmentTarget(expression.argument);
        return;
      case 'ArrayPattern':
        for (const element of expression.elements) {
          this.visitAssignmentTarget(element);
        }
        return;
      case 'ObjectPattern':
        for (const property of expression.properties) {
          if (property.type === 'RestElement') {
            this.visitAssignmentTarget(property.argument);
          } else {
            if (property.computed) {
              this.visit(property.key);
            }
            this.visitAssignmentTarget(property.value);
          }
        }
        return;
      case 'MemberExpression':
        this.visit(expression.object);
        if (expression.computed) {
          this.visit(expression.property);
        }
        return;
      default:
        this.visit(expression);
    }
  }

  private visitPatternExpressions(pattern: unknown): void {
    const node = unwrapExpression(pattern);
    if (!node) {
      return;
    }
    if (node.type === 'AssignmentPattern') {
      this.visitPatternExpressions(node.left);
      this.visit(node.right);
    } else if (node.type === 'RestElement') {
      this.visitPatternExpressions(node.argument);
    } else if (node.type === 'ArrayPattern') {
      for (const element of node.elements) {
        this.visitPatternExpressions(element);
      }
    } else if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type === 'RestElement') {
          this.visitPatternExpressions(property.argument);
        } else {
          if (property.computed) {
            this.visit(property.key);
          }
          this.visitPatternExpressions(property.value);
        }
      }
    }
  }

  private predeclareStatements(statements: readonly AstNode[], scopeId: number): void {
    for (const statement of statements) {
      const declaration = unwrapModuleDeclaration(statement);
      if (statement.type === 'ImportDeclaration') {
        const typeOnly = statement.importKind === 'type';
        for (const specifier of statement.specifiers) {
          const importedName = getImportSpecifierName(specifier);
          this.defineIdentifier(specifier.local, 'import', scopeId, {
            source: statement.source.value,
            importedName,
            typeOnly:
              typeOnly || (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'),
            attributes: statement.attributes.flatMap((attribute) => {
              const key =
                getIdentifierName(attribute.key) ??
                (attribute.key.type === 'Literal' && typeof attribute.key.value === 'string'
                  ? attribute.key.value
                  : null);
              const value = attribute.value.value;
              return key === null || typeof value !== 'string' ? [] : [{ key, value }];
            }),
            specifierRange: getRange(specifier) ?? undefined,
            importedRange:
              specifier.type === 'ImportSpecifier'
                ? (getRange(specifier.imported) ?? undefined)
                : undefined,
          });
        }
      } else if (declaration?.type === 'VariableDeclaration') {
        this.predeclareVariable(declaration, scopeId);
      } else if (
        declaration?.type === 'FunctionDeclaration' ||
        declaration?.type === 'ClassDeclaration'
      ) {
        this.defineIdentifier(
          declaration.id,
          this.scopes[scopeId].kind === 'module' ? 'module' : 'local',
          scopeId,
          null
        );
      }
      if (statement.type === 'ExportDefaultDeclaration') {
        const direct = getPossibleDefaultFunction(statement.declaration);
        if (
          direct !== null &&
          (statement.declaration.type !== 'FunctionDeclaration' ||
            getFunctionName(direct.fn) === null)
        ) {
          this.defineSyntheticDefault(getRange(direct.fn), scopeId);
        }
      }
    }
  }

  private predeclareVariable(
    declaration: Extract<AstNode, { type: 'VariableDeclaration' }>,
    scopeId: number,
    forcedKind?: 'loop'
  ): void {
    const targetScope = declaration.kind === 'var' ? this.nearestFunctionScope(scopeId) : scopeId;
    const kind =
      forcedKind ?? (this.scopes[targetScope].kind === 'module' ? 'module' : ('local' as const));
    for (const item of declaration.declarations) {
      this.definePattern(item.id, kind, targetScope);
    }
  }

  private predeclareVars(node: unknown, targetScope: number): void {
    if (!isNode(node)) {
      return;
    }
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'ClassDeclaration' ||
      node.type === 'ClassExpression'
    ) {
      return;
    }
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      for (const declaration of node.declarations) {
        this.definePattern(
          declaration.id,
          this.scopes[targetScope].kind === 'module' ? 'module' : 'local',
          targetScope
        );
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          this.predeclareVars(child, targetScope);
        }
      } else {
        this.predeclareVars(value, targetScope);
      }
    }
  }

  private definePattern(pattern: unknown, kind: BindingKind, scopeId: number): void {
    const node = unwrapExpression(pattern);
    if (!node) {
      return;
    }
    switch (node.type) {
      case 'Identifier':
        this.defineIdentifier(node, kind, scopeId, null);
        return;
      case 'AssignmentPattern':
        this.definePattern(node.left, kind, scopeId);
        return;
      case 'RestElement':
        this.definePattern(node.argument, kind, scopeId);
        return;
      case 'ArrayPattern':
        for (const element of node.elements) {
          this.definePattern(element, kind, scopeId);
        }
        return;
      case 'ObjectPattern':
        for (const property of node.properties) {
          this.definePattern(
            property.type === 'RestElement' ? property.argument : property.value,
            kind,
            scopeId
          );
        }
    }
  }

  private defineIdentifier(
    node: unknown,
    kind: BindingKind,
    scopeId: number,
    importBinding: ImportBinding | null
  ): BindingId | null {
    const name = getIdentifierName(node);
    if (name === null) {
      return null;
    }
    const range = getRange(node);
    const existing = this.scopes[scopeId].bindings.get(name);
    if (existing !== undefined) {
      if (range !== null) {
        this.declarationBindings.set(rangeKey(range), existing);
      }
      return existing;
    }
    const id = this.bindings.length;
    this.bindings.push({
      id,
      name,
      kind,
      declarationRange: range,
      scopeId,
      ownerId: this.scopes[scopeId].ownerId,
      import: importBinding,
    });
    this.scopes[scopeId].bindings.set(name, id);
    if (range !== null) {
      this.declarationBindings.set(rangeKey(range), id);
    }
    return id;
  }

  private defineSyntheticDefault(range: SourceRange | null, scopeId: number): BindingId {
    const existing = this.scopes[scopeId].bindings.get('default');
    if (existing !== undefined) {
      return existing;
    }
    const id = this.bindings.length;
    this.bindings.push({
      id,
      name: 'default',
      kind: 'module',
      declarationRange: range,
      scopeId,
      ownerId: this.scopes[scopeId].ownerId,
      import: null,
    });
    this.scopes[scopeId].bindings.set('default', id);
    if (range !== null) {
      this.declarationBindings.set(rangeKey(range), id);
    }
    return id;
  }

  private recordIdentifier(node: unknown, role: ReferenceRole): BindingId | null {
    const name = getIdentifierName(node);
    return name === null ? null : this.recordName(name, getRange(node), role);
  }

  private recordName(
    name: string,
    range: SourceRange | null,
    role: ReferenceRole
  ): BindingId | null {
    if (range === null) {
      return null;
    }
    const bindingId = this.resolve(name);
    this.references.push({ range, bindingId, role });
    this.referenceBindings.set(rangeKey(range), bindingId);
    return bindingId;
  }

  private resolve(name: string, startScope: number = this.scopeId): BindingId | null {
    let scopeId: number | null = startScope;
    while (scopeId !== null) {
      const binding = this.scopes[scopeId].bindings.get(name);
      if (binding !== undefined) {
        return binding;
      }
      scopeId = this.scopes[scopeId].parentId;
    }
    return null;
  }

  private withScope(kind: ScopeKind, visit: () => void): void {
    const previous = this.scopeId;
    this.scopeId = this.createScope(previous, this.ownerId, kind);
    visit();
    this.scopeId = previous;
  }

  private createScope(parentId: number | null, ownerId: number, kind: ScopeKind): number {
    const id = this.scopes.length;
    this.scopes.push({ id, parentId, ownerId, kind, bindings: new Map() });
    return id;
  }

  private nearestFunctionScope(startScope: number): number {
    let scopeId: number | null = startScope;
    while (scopeId !== null) {
      const scope: Scope = this.scopes[scopeId];
      if (scope.kind === 'module' || scope.kind === 'function' || scope.kind === 'static-block') {
        return scopeId;
      }
      scopeId = scope.parentId;
    }
    return startScope;
  }

  private classifyModuleItems(): ModuleItemPlan[] {
    const candidates = this.collectFunctionCandidates();
    const plans = new Map<string, ComponentCandidatePlan>();
    for (const candidate of candidates) {
      const functionRange = getRange(candidate.fn);
      const replacementRange = candidate.replacementRange;
      if (functionRange === null || replacementRange === null) {
        continue;
      }
      const qualification = candidate.wrapped
        ? 'component$'
        : candidate.bindingId !== null && this.jsxTagBindings.has(candidate.bindingId)
          ? 'jsx-tag'
          : candidate.exported && returnPositionContainsJsx(candidate.fn)
            ? 'exported-jsx'
            : null;
      if (qualification === null) {
        continue;
      }
      plans.set(rangeKey(functionRange), {
        bindingId: candidate.bindingId,
        functionRange,
        replacementRange,
        qualification,
        exported: candidate.exported,
        exportName: candidate.exportName,
        localName: candidate.localName,
        declarationKind: candidate.declarationKind,
      });
    }

    return this.program.body.map((statement, statementIndex) => {
      const range = getRange(statement) ?? ([0, 0] as SourceRange);
      const statementCandidates = candidates
        .filter((candidate) => candidate.statementIndex === statementIndex)
        .flatMap((candidate) => {
          const functionRange = getRange(candidate.fn);
          const plan = functionRange === null ? undefined : plans.get(rangeKey(functionRange));
          return plan === undefined ? [] : [plan];
        });
      if (statementCandidates.length > 0) {
        return { kind: 'component-candidate', range, candidates: statementCandidates };
      }
      if (statement.type === 'ImportDeclaration' && isQwikImport(statement.source.value)) {
        return {
          kind: 'import',
          range,
          bindingIds: statement.specifiers.flatMap((specifier) => {
            const bindingId = this.declarationBinding(specifier.local);
            return bindingId === null ? [] : [bindingId];
          }),
        };
      }
      return { kind: 'preserve', range };
    });
  }

  private collectFunctionCandidates(): FunctionCandidate[] {
    const candidates = new Map<BindingId, FunctionCandidate>();
    const exports = new Map<BindingId, string | 'default'>();

    for (let statementIndex = 0; statementIndex < this.program.body.length; statementIndex++) {
      const statement = this.program.body[statementIndex];
      const declaration = unwrapModuleDeclaration(statement);
      const directlyExported =
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration';
      if (declaration?.type === 'FunctionDeclaration') {
        const name = getIdentifierName(declaration.id);
        const bindingId =
          name === null
            ? this.syntheticDefaultBinding(getRange(declaration))
            : this.declarationBinding(declaration.id);
        if (bindingId !== null) {
          const isDefault = statement.type === 'ExportDefaultDeclaration';
          candidates.set(bindingId, {
            bindingId,
            fn: declaration,
            replacementRange: getRange(declaration),
            statementIndex,
            wrapped: false,
            exported: directlyExported,
            exportName: isDefault ? 'default' : (name ?? 'default'),
            localName: name,
            declarationKind: isDefault ? 'defaultFunction' : 'function',
          });
          if (directlyExported) {
            exports.set(bindingId, isDefault ? 'default' : name!);
          }
        }
      } else if (declaration?.type === 'VariableDeclaration') {
        for (const declarator of declaration.declarations) {
          const name = getIdentifierName(declarator.id);
          const bindingId = this.declarationBinding(declarator.id);
          const lookup = this.getTopLevelFunction(declarator.init);
          if (name === null || bindingId === null || lookup === null) {
            continue;
          }
          candidates.set(bindingId, {
            bindingId,
            fn: lookup.fn,
            replacementRange: lookup.replacementRange,
            statementIndex,
            wrapped: lookup.wrapped,
            exported: statement.type === 'ExportNamedDeclaration',
            exportName: name,
            localName: name,
            declarationKind: 'const',
          });
          if (statement.type === 'ExportNamedDeclaration') {
            exports.set(bindingId, name);
          }
        }
      } else if (statement.type === 'ExportDefaultDeclaration') {
        const lookup = this.getTopLevelFunction(statement.declaration);
        if (lookup !== null) {
          const bindingId = this.syntheticDefaultBinding(getRange(lookup.fn));
          if (bindingId !== null) {
            const localName =
              lookup.fn.type === 'ArrowFunctionExpression' ? null : getIdentifierName(lookup.fn.id);
            candidates.set(bindingId, {
              bindingId,
              fn: lookup.fn,
              replacementRange: lookup.replacementRange,
              statementIndex,
              wrapped: lookup.wrapped,
              exported: true,
              exportName: 'default',
              localName,
              declarationKind:
                lookup.fn.type === 'ArrowFunctionExpression' ? 'defaultArrow' : 'defaultFunction',
            });
            exports.set(bindingId, 'default');
          }
        }
      }

      if (statement.type === 'ExportNamedDeclaration' && statement.source === null) {
        for (const specifier of statement.specifiers) {
          const local = getIdentifierName(specifier.local);
          const exported = getIdentifierName(specifier.exported);
          const bindingId = local === null ? null : this.resolve(local, 0);
          if (bindingId !== null && exported !== null) {
            exports.set(bindingId, exported);
          }
        }
      } else if (
        statement.type === 'ExportDefaultDeclaration' &&
        statement.declaration.type === 'Identifier'
      ) {
        const bindingId = this.resolve(statement.declaration.name, 0);
        if (bindingId !== null) {
          exports.set(bindingId, 'default');
        }
      }
    }

    for (const [bindingId, exportName] of exports) {
      const candidate = candidates.get(bindingId);
      if (candidate !== undefined) {
        candidate.exported = true;
        candidate.exportName = exportName;
      }
    }
    return [...candidates.values(), ...this.collectInlineComponentCandidates(candidates)];
  }

  private collectInlineComponentCandidates(
    candidates: Map<BindingId, FunctionCandidate>
  ): FunctionCandidate[] {
    const inline: FunctionCandidate[] = [];
    const moduleHelpers = [...candidates.values()].filter(
      (candidate) =>
        !candidate.wrapped &&
        (candidate.bindingId === null || !this.jsxTagBindings.has(candidate.bindingId)) &&
        !(candidate.exported && returnPositionContainsJsx(candidate.fn))
    );

    for (const helper of moduleHelpers) {
      visitAst(helper.fn, (value) => {
        if (value.type === 'CallExpression' && this.isImportedComponentCallee(value.callee)) {
          const argument = value.arguments[0];
          const fn = unwrapExpression(
            argument?.type === 'SpreadElement' ? argument.argument : argument
          );
          const replacementRange = getRange(value);
          const functionRange = getRange(fn);
          if (isFunctionLike(fn) && replacementRange !== null && functionRange !== null) {
            inline.push({
              bindingId: null,
              fn,
              replacementRange,
              statementIndex: helper.statementIndex,
              wrapped: true,
              exported: false,
              exportName: `inline_component_${functionRange[0]}`,
              localName: null,
              declarationKind: 'const',
            });
            return false;
          }
        }
      });
    }
    return inline;
  }

  private getTopLevelFunction(node: unknown): FunctionLookup | null {
    return getDirectComponentFunction(node, (callee) => this.isImportedComponentCallee(callee));
  }

  private isImportedComponentCallee(node: unknown): boolean {
    const expression = unwrapExpression(node);
    if (expression?.type === 'Identifier') {
      const bindingId = this.referenceBinding(expression);
      return bindingId !== null && this.isImportedComponentBinding(bindingId);
    }
    if (expression?.type !== 'MemberExpression' || expression.computed) {
      return false;
    }
    if (getIdentifierName(expression.property) !== QwikHooks.ComponentDollar) {
      return false;
    }
    const object = unwrapExpression(expression.object);
    if (object?.type !== 'Identifier') {
      return false;
    }
    const bindingId = this.referenceBinding(object);
    const binding = bindingId === null ? undefined : this.bindings[bindingId];
    return (
      binding?.import?.importedName === '*' &&
      !binding.import.typeOnly &&
      isQwikImport(binding.import.source)
    );
  }

  private isImportedComponentBinding(bindingId: BindingId): boolean {
    const binding = this.bindings[bindingId];
    return (
      binding?.kind === 'import' &&
      binding.import?.importedName === QwikHooks.ComponentDollar &&
      !binding.import.typeOnly &&
      isQwikImport(binding.import.source)
    );
  }

  private declarationBinding(node: unknown): BindingId | null {
    const range = getRange(node);
    return range === null ? null : (this.declarationBindings.get(rangeKey(range)) ?? null);
  }

  private referenceBinding(node: unknown): BindingId | null {
    const range = getRange(node);
    return range === null ? null : (this.referenceBindings.get(rangeKey(range)) ?? null);
  }

  private syntheticDefaultBinding(range: SourceRange | null): BindingId | null {
    if (range !== null) {
      const bindingId = this.declarationBindings.get(rangeKey(range));
      if (bindingId !== undefined) {
        return bindingId;
      }
    }
    return this.scopes[0].bindings.get('default') ?? null;
  }

  private visitUnknownChildren(node: AstNode): void {
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          this.visit(child);
        }
      } else {
        this.visit(value);
      }
    }
  }
}

function collectJsxOwners(program: Program): {
  readonly moduleRange: SourceRange | null;
  readonly moduleArgumentJsxRanges: readonly SourceRange[];
  readonly functionRanges: readonly SourceRange[];
} {
  let moduleRange: SourceRange | null = null;
  const moduleArgumentJsxRanges: SourceRange[] = [];
  const functionRanges = new Map<string, SourceRange>();
  visit(program, null, false);
  return { moduleRange, moduleArgumentJsxRanges, functionRanges: [...functionRanges.values()] };

  function visit(value: unknown, ownerRange: SourceRange | null, inCallArgument: boolean): void {
    if (!isNode(value)) {
      return;
    }
    const range = isFunctionLike(value) ? getRange(value) : ownerRange;
    if (value.type === 'JSXElement' || value.type === 'JSXFragment') {
      const jsxRange = getRange(value);
      if (range === null) {
        // a root value handed to a callee (render(document, <Root />)) lowers deferred;
        // any other module-level JSX has no owner to render it and stays refused
        if (inCallArgument && jsxRange !== null) {
          moduleArgumentJsxRanges.push(jsxRange);
        } else {
          moduleRange ??= jsxRange;
        }
      } else {
        functionRanges.set(rangeKey(range), range);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      const childInArgument =
        inCallArgument || (value.type === 'CallExpression' && key === 'arguments');
      if (Array.isArray(child)) {
        child.forEach((item) => visit(item, range, childInArgument));
      } else {
        visit(child, range, childInArgument);
      }
    }
  }
}

function unwrapModuleDeclaration(node: AstNode): AstNode | null {
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    return isNode(node.declaration) ? node.declaration : null;
  }
  return node;
}

function getDirectComponentFunction(
  node: unknown,
  isComponentCallee: (callee: unknown) => boolean
): FunctionLookup | null {
  const expression = unwrapExpression(node);
  if (isFunctionLike(expression)) {
    return { fn: expression, wrapped: false, replacementRange: getRange(expression) };
  }
  if (expression?.type !== 'CallExpression' || !isComponentCallee(expression.callee)) {
    return null;
  }
  const argument = expression.arguments[0];
  const fn = unwrapExpression(argument?.type === 'SpreadElement' ? argument.argument : argument);
  return isFunctionLike(fn) ? { fn, wrapped: true, replacementRange: getRange(expression) } : null;
}

function getPossibleDefaultFunction(node: unknown): FunctionLookup | null {
  const expression = unwrapExpression(node);
  if (isFunctionLike(expression)) {
    return { fn: expression, wrapped: false, replacementRange: getRange(expression) };
  }
  if (expression?.type !== 'CallExpression') {
    return null;
  }
  const argument = expression.arguments[0];
  const fn = unwrapExpression(argument?.type === 'SpreadElement' ? argument.argument : argument);
  return isFunctionLike(fn) ? { fn, wrapped: true, replacementRange: getRange(expression) } : null;
}

function getFunctionName(fn: AstFunction): string | null {
  return fn.type === 'ArrowFunctionExpression' ? null : getIdentifierName(fn.id);
}

function getImportSpecifierName(
  specifier: Extract<
    AstNode,
    { type: 'ImportSpecifier' | 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier' }
  >
): string | 'default' | '*' {
  if (specifier.type === 'ImportDefaultSpecifier') {
    return 'default';
  }
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return '*';
  }
  const name = getIdentifierName(specifier.imported);
  if (name !== null) {
    return name;
  }
  return getIdentifierName(specifier.local) ?? '';
}

function returnPositionContainsJsx(fn: AstFunction): boolean {
  const body = unwrapExpression(fn.body);
  if (body?.type !== 'BlockStatement') {
    return returnsJsxValue(body);
  }
  let found = false;
  visitReturns(body, (argument) => {
    found ||= returnsJsxValue(unwrapExpression(argument));
  });
  return found;
}

/**
 * JSX in value position of the returned expression — the value the function itself produces. JSX
 * inside a call's arguments belongs to that call: the function returns the call's result, and
 * rewriting its signature would break callers the compiler cannot see (issue: SSR entries doing
 * `return renderToStream(<Root />, opts)` gained a ctx parameter the server never passes).
 */
function returnsJsxValue(node: unknown): boolean {
  const value = unwrapExpression(node);
  if (!isNode(value)) {
    return false;
  }
  switch (value.type) {
    case 'JSXElement':
    case 'JSXFragment':
      return true;
    case 'ConditionalExpression':
      return returnsJsxValue(value.consequent) || returnsJsxValue(value.alternate);
    case 'LogicalExpression':
      return returnsJsxValue(value.left) || returnsJsxValue(value.right);
    case 'SequenceExpression': {
      const expressions = (value as { expressions: unknown[] }).expressions;
      return returnsJsxValue(expressions[expressions.length - 1]);
    }
    case 'ArrayExpression':
      return (value as { elements: unknown[] }).elements.some((element) =>
        returnsJsxValue(element)
      );
    default:
      return false;
  }
}

function visitReturns(node: unknown, visitor: (argument: unknown) => void, root = true): void {
  if (!isNode(node)) {
    return;
  }
  if (!root && isFunctionLike(node)) {
    return;
  }
  if (node.type === 'ReturnStatement') {
    visitor(node.argument);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        visitReturns(child, visitor, false);
      }
    } else {
      visitReturns(value, visitor, false);
    }
  }
}

export function containsJsx(node: unknown, root = true): boolean {
  if (!isNode(node)) {
    return false;
  }
  if (!root && isFunctionLike(node)) {
    return false;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return true;
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some((child) => containsJsx(child, false))) {
        return true;
      }
    } else if (containsJsx(value, false)) {
      return true;
    }
  }
  return false;
}

function isIterationCall(node: Extract<AstNode, { type: 'CallExpression' }>): boolean {
  const callee = unwrapExpression(node.callee);
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    ITERATION_METHODS.has(getIdentifierName(callee.property) ?? '')
  );
}

function isQwikImport(source: string): boolean {
  return source === QWIK_CORE_IMPORT || source === QWIK_IMPORT;
}

function sameRange(left: SourceRange | null, right: SourceRange | null): boolean {
  return left !== null && right !== null && left[0] === right[0] && left[1] === right[1];
}

function rangeKey(range: SourceRange): string {
  return `${range[0]}:${range[1]}`;
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

function patternIdentifiers(
  pattern: unknown,
  output: Array<Extract<AstNode, { type: 'Identifier' }>> = []
): Array<Extract<AstNode, { type: 'Identifier' }>> {
  const node = unwrapExpression(pattern);
  if (!node) {
    return output;
  }
  if (node.type === 'Identifier') {
    output.push(node);
  } else if (node.type === 'AssignmentPattern') {
    patternIdentifiers(node.left, output);
  } else if (node.type === 'RestElement') {
    patternIdentifiers(node.argument, output);
  } else if (node.type === 'ArrayPattern') {
    node.elements.forEach((item) => patternIdentifiers(item, output));
  } else if (node.type === 'ObjectPattern') {
    node.properties.forEach((item) =>
      patternIdentifiers(item.type === 'RestElement' ? item.argument : item.value, output)
    );
  }
  return output;
}

function moduleExportName(node: unknown): string | null {
  const name = getIdentifierName(node);
  if (name !== null) {
    return name;
  }
  const expression = unwrapExpression(node);
  return expression?.type === 'Literal' && typeof expression.value === 'string'
    ? expression.value
    : null;
}

const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
]);

/** `useLocation()` pins as `_location`; unknown callees fall back to `_destructured`. */
function allocateTempName(calleeName: string | null, usedNames: Set<string>): string {
  const base =
    calleeName !== null && /^use[A-Z]/.test(calleeName)
      ? `_${calleeName[3].toLowerCase()}${calleeName.slice(4)}`
      : `_${calleeName ?? 'destructured'}`;
  let name = base;
  for (let suffix = 2; usedNames.has(name); suffix++) {
    name = `${base}${suffix}`;
  }
  usedNames.add(name);
  return name;
}
