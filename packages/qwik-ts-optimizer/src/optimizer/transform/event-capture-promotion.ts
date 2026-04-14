/**
 * Event handler capture-to-param promotion for the Qwik optimizer.
 *
 * Handles the q:p delivery mechanism where event handler captures are
 * promoted to function parameters. Includes loop context detection,
 * scope analysis, and slot unification for multiple handlers on the
 * same element.
 */

import { walk, getUndeclaredIdentifiersInFunction } from "oxc-walker";
import type { AstNode, AstFunction, AstProgram } from "../../ast-types.js";
import type { ExtractionResult } from "../extract.js";
import type { ImportInfo } from "../marker-detection.js";
import {
  detectLoopContext,
  generateParamPadding,
  type LoopContext,
} from "../loop-hoisting.js";
import { addBindingNamesFromPatternToSet } from '../utils/binding-pattern.js';
import {
  getWholeWordPattern,
  numberedPaddingParam,
  paddingParam,
} from './post-process.js';

/**
 * Build a map from extraction symbolName to its loop context stack.
 * Walks the AST once to detect which extractions are inside loops.
 */
export function buildExtractionLoopMap(
  program: AstProgram,
  extractions: ExtractionResult[],
  repairedCode: string,
): Map<string, LoopContext[]> {
  const extractionLoopMap = new Map<string, LoopContext[]>();
  const loopStack: LoopContext[] = [];

  walk(program, {
    enter(node: AstNode) {
      const loopCtx = detectLoopContext(node, repairedCode);
      if (loopCtx) {
        loopStack.push(loopCtx);
      }
      // Check if this node's range matches any extraction's call range
      if (
        node.start !== undefined &&
        node.end !== undefined &&
        loopStack.length > 0
      ) {
        for (const ext of extractions) {
          if (node.start <= ext.callStart && node.end >= ext.callEnd) {
            // This node contains the extraction -- record current loop stack
            // We only need the innermost, but store all for nested loop analysis
            if (
              !extractionLoopMap.has(ext.symbolName) ||
              extractionLoopMap.get(ext.symbolName)!.length <
                loopStack.length
            ) {
              extractionLoopMap.set(ext.symbolName, [...loopStack]);
            }
          }
        }
      }
    },
    leave(node: AstNode) {
      const loopCtx = detectLoopContext(node, repairedCode);
      if (loopCtx) {
        loopStack.pop();
      }
    },
  });

  return extractionLoopMap;
}

interface ScopeEntry {
  type: "function" | "for-loop";
  start: number;
  end: number;
  bindings: Array<{ name: string; pos: number }>;
}

/**
 * Pre-collect all function scope entries and for-loop scope entries from a SINGLE AST walk.
 * Each entry records the node's range and its param/body-decl bindings with positions.
 * Per-extraction filtering then uses these cached entries instead of re-walking the AST.
 */
export function collectAllScopeEntries(program: AstProgram): ScopeEntry[] {
  const allScopeEntries: ScopeEntry[] = [];

  walk(program, {
    enter(node: AstNode) {
      if (
        (node.type === "ArrowFunctionExpression" ||
          node.type === "FunctionExpression" ||
          node.type === "FunctionDeclaration") &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        const bindings: Array<{ name: string; pos: number }> = [];
        for (const param of node.params ?? []) {
          const names = new Set<string>();
          addBindingNamesFromPatternToSet(param, names);
          for (const n of names) {
            bindings.push({ name: n, pos: param.start ?? 0 });
          }
        }
        if (node.body?.type === "BlockStatement") {
          for (const stmt of node.body.body ?? []) {
            if (stmt.type === "VariableDeclaration") {
              for (const decl of stmt.declarations ?? []) {
                if (decl.id) {
                  const names = new Set<string>();
                  addBindingNamesFromPatternToSet(decl.id, names);
                  for (const n of names) {
                    bindings.push({
                      name: n,
                      pos: decl.start ?? stmt.start ?? 0,
                    });
                  }
                }
              }
            }
          }
        }
        allScopeEntries.push({
          type: "function",
          start: node.start,
          end: node.end,
          bindings,
        });
      }
      if (
        (node.type === "ForOfStatement" ||
          node.type === "ForInStatement" ||
          node.type === "ForStatement") &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        const left = node.type === "ForStatement" ? node.init : node.left;
        if (left?.type === "VariableDeclaration") {
          const bindings: Array<{ name: string; pos: number }> = [];
          for (const decl of left.declarations ?? []) {
            if (decl.id) {
              const names = new Set<string>();
              addBindingNamesFromPatternToSet(decl.id, names);
              for (const n of names) {
                bindings.push({
                  name: n,
                  pos: decl.start ?? left.start ?? 0,
                });
              }
            }
          }
          if (bindings.length > 0) {
            allScopeEntries.push({
              type: "for-loop",
              start: node.start,
              end: node.end,
              bindings,
            });
          }
        }
      }
    },
    leave() {},
  });

  return allScopeEntries;
}

/**
 * Promote event handler captures to function parameters.
 *
 * This implements the q:p delivery mechanism where captured variables
 * become positional function parameters instead of runtime captures.
 */
export function promoteEventHandlerCaptures(
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  bodyScopeIds: Map<string, Set<string>>,
  moduleScopeIds: Set<string>,
  importedNames: Set<string>,
  enclosingExtMap: Map<string, ExtractionResult>,
  extractionLoopMap: Map<string, LoopContext[]>,
  allScopeEntries: ScopeEntry[],
  program: AstProgram,
  repairedCode: string,
  globalDeclPositions: Map<string, number>,
): void {
  for (const extraction of extractions) {
    // Only process event handlers
    if (extraction.ctxKind !== "eventHandler") continue;
    if (extraction.isInlinedQrl) continue;

    // Re-detect captures for event handlers by checking undeclared identifiers
    // against ALL enclosing scopes (including loop callback scopes that
    // capture analysis misses because they're intermediate nested functions).
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;

    let undeclaredIds: string[];
    try {
      undeclaredIds = getUndeclaredIdentifiersInFunction(closureNode);
    } catch {
      continue;
    }

    // Workaround: oxc-walker's getUndeclaredIdentifiersInFunction does not report
    // for-statement init variables (e.g., `i` in `for(let i=0;...)`) or for-in
    // left variables (e.g., `key` in `for(const key in obj)`) as undeclared,
    // even though they're not declared within the handler function itself.
    // For-of variables ARE reported. To handle the missing cases, check if any
    // enclosing loop's iterVars are referenced in the handler body text and add
    // them to undeclaredIds if missing.
    //
    // For while/do-while loops (which have empty iterVars), also scan for
    // variables declared in intermediate function scopes that contain both
    // the loop and the extraction. These variables (e.g., `let i = 0` before
    // `while(i < n)`) need to be treated as loop-local for q:p delivery.
    {
      const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
      if (enclosingLoops && enclosingLoops.length > 0) {
        const bodyText = extraction.bodyText;
        const undeclaredSet = new Set(undeclaredIds);
        for (const loop of enclosingLoops) {
          // Add explicit iterVars that oxc-walker missed
          for (const iterVar of loop.iterVars) {
            if (!undeclaredSet.has(iterVar)) {
              if (getWholeWordPattern(iterVar).test(bodyText)) {
                undeclaredIds.push(iterVar);
                undeclaredSet.add(iterVar);
              }
            }
          }
          // For while/do-while with empty iterVars: scan intermediate function
          // scopes for let/var declarations that are referenced in the handler body.
          // These are potential loop counter variables that oxc-walker considers
          // "declared" (in the parent function scope) but need q:p delivery.
          if (
            (loop.type === "while" || loop.type === "do-while") &&
            loop.iterVars.length === 0
          ) {
            // Walk AST to find function declarations/expressions containing the loop
            // and collect their body-level let/var declarations
            walk(program, {
              enter(node: AstNode) {
                if (
                  (node.type === "ArrowFunctionExpression" ||
                    node.type === "FunctionExpression" ||
                    node.type === "FunctionDeclaration") &&
                  node.start !== undefined &&
                  node.end !== undefined &&
                  node.start < loop.loopNode.start &&
                  node.end > loop.loopNode.end &&
                  node.start < extraction.callStart &&
                  node.end > extraction.callEnd
                ) {
                  // This function contains both the loop and the handler
                  if (node.body?.type === "BlockStatement") {
                    for (const stmt of node.body.body ?? []) {
                      if (
                        stmt.type === "VariableDeclaration" &&
                        (stmt.kind === "let" || stmt.kind === "var")
                      ) {
                        for (const decl of stmt.declarations ?? []) {
                          if (
                            decl.id?.type === "Identifier" &&
                            !undeclaredSet.has(decl.id.name)
                          ) {
                            const varName = decl.id.name;
                            if (getWholeWordPattern(varName).test(bodyText)) {
                              undeclaredIds.push(varName);
                              undeclaredSet.add(varName);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              leave() {},
            });
          }
        }
      }
    }

    // Even with no captures, event handlers in a loop context need (_, _1) padding
    // for the q:p delivery mechanism. Check loop context before skipping.
    // Exception: component event handlers (onClick$ on <MyComponent/>) are just props,
    // not Qwik event handlers, so they don't need (_, _1) padding.
    if (undeclaredIds.length === 0) {
      if (!extraction.isComponentEvent) {
        const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
        if (enclosingLoops && enclosingLoops.length > 0) {
          // In a loop: add minimal (_, _1) padding even with no captures
          extraction.paramNames = ["_", "_1"];
          extraction.captureNames = [];
          extraction.captures = false;
        }
      }
      continue;
    }

    // Collect ALL scope-visible identifiers from enclosing scopes.
    // This includes the enclosing extraction's body scope PLUS any
    // intermediate function scopes (like .map() callbacks).
    const allScopeIds = new Set<string>();

    // Add enclosing extraction's body scope (using pre-computed map)
    const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;

    if (enclosingExt) {
      const parentIds = bodyScopeIds.get(enclosingExt.symbolName);
      if (parentIds) {
        for (const id of parentIds) allScopeIds.add(id);
      }
    } else {
      for (const id of moduleScopeIds) allScopeIds.add(id);
    }

    // Collect identifiers from intermediate scopes using pre-collected scope entries.
    // Filter entries that are within the enclosing range and contain the extraction.
    const declPositions = new Map<string, number>();
    const enclosingStart = enclosingExt ? enclosingExt.argStart : 0;
    const enclosingEnd = enclosingExt
      ? enclosingExt.argEnd
      : repairedCode.length;
    for (const entry of allScopeEntries) {
      if (
        entry.start >= enclosingStart &&
        entry.end <= enclosingEnd &&
        entry.start < extraction.callStart &&
        entry.end > extraction.callEnd
      ) {
        for (const b of entry.bindings) {
          allScopeIds.add(b.name);
          if (!declPositions.has(b.name)) declPositions.set(b.name, b.pos);
        }
      }
    }

    // Copy declaration positions to global map for shared slot allocation
    for (const [name, pos] of declPositions) {
      if (!globalDeclPositions.has(name))
        globalDeclPositions.set(name, pos);
    }

    // Filter undeclared identifiers against all scope identifiers
    // Sort by declaration position (source order) to match Rust optimizer behavior
    const allCaptures = undeclaredIds.filter(
      (name) => allScopeIds.has(name) && !importedNames.has(name),
    );
    const uniqueCaptures = [...new Set(allCaptures)].sort(
      (a, b) => (declPositions.get(a) ?? 0) - (declPositions.get(b) ?? 0),
    );

    if (uniqueCaptures.length === 0) {
      // Even with no scope captures, event handlers in a loop context need (_, _1)
      // padding for the q:p delivery mechanism.
      // Exception: component event handlers are just props, no padding needed.
      if (!extraction.isComponentEvent) {
        const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
        if (enclosingLoops && enclosingLoops.length > 0) {
          extraction.paramNames = ["_", "_1"];
          extraction.captureNames = [];
          extraction.captures = false;
        }
      }
      continue;
    }

    const enclosingLoops = extractionLoopMap.get(extraction.symbolName);

    if (!enclosingLoops || enclosingLoops.length === 0) {
      // NOT in a loop: ALL captured vars become paramNames, sorted ALPHABETICALLY per SWC Rule 7
      const sortedCaptures = [...uniqueCaptures].sort();
      extraction.paramNames = generateParamPadding(sortedCaptures);
      extraction.captureNames = [];
      extraction.captures = false;
    } else {
      // IN a loop: partition captures into loop-local vs cross-scope.
      // Only the IMMEDIATE (innermost) loop's variables are loop-local.
      // Variables from outer loops are cross-scope captures (delivered via .w() hoisting).
      const immediateLoop = enclosingLoops[enclosingLoops.length - 1];

      // Collect loop-local variable names:
      // 1. Immediate loop's iterVars
      const loopLocalSet = new Set<string>(immediateLoop.iterVars);

      // 2. Block-scoped declarations inside the immediate loop body
      walk(program, {
        enter(node: AstNode) {
          if (
            node.type === "VariableDeclaration" &&
            node.start !== undefined &&
            node.end !== undefined &&
            node.start >= immediateLoop.loopBodyStart &&
            node.end <= immediateLoop.loopBodyEnd
          ) {
            for (const decl of node.declarations ?? []) {
              if (decl.id?.type === "Identifier") {
                loopLocalSet.add(decl.id.name);
              }
            }
          }
        },
        leave() {},
      });

      // 3. For while/do-while loops: also include let/var declarations from
      //    the containing function body that precede the loop. These are
      //    potential loop counter variables (e.g., `let i = 0` before `while(i < n)`).
      //    Only include variables that are referenced in the handler body text.
      if (
        (immediateLoop.type === "while" ||
          immediateLoop.type === "do-while") &&
        immediateLoop.iterVars.length === 0
      ) {
        const handlerBody = extraction.bodyText;
        walk(program, {
          enter(node: AstNode) {
            if (
              (node.type === "FunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression") &&
              node.start !== undefined &&
              node.end !== undefined &&
              node.start < immediateLoop.loopNode.start &&
              node.end > immediateLoop.loopNode.end &&
              node.start < extraction.callStart &&
              node.end > extraction.callEnd &&
              node.body?.type === "BlockStatement"
            ) {
              for (const stmt of node.body.body ?? []) {
                if (
                  stmt.type === "VariableDeclaration" &&
                  (stmt.kind === "let" || stmt.kind === "var") &&
                  stmt.start !== undefined &&
                  stmt.start < immediateLoop.loopNode.start
                ) {
                  for (const decl of stmt.declarations ?? []) {
                    if (decl.id?.type === "Identifier") {
                      const varName = decl.id.name;
                      if (getWholeWordPattern(varName).test(handlerBody)) {
                        loopLocalSet.add(varName);
                      }
                    }
                  }
                }
              }
            }
          },
          leave() {},
        });
      }

      // Partition captures
      const loopLocalVars: string[] = [];
      const crossScopeCaptures: string[] = [];
      for (const name of uniqueCaptures) {
        if (loopLocalSet.has(name)) {
          loopLocalVars.push(name);
        } else {
          crossScopeCaptures.push(name);
        }
      }

      if (loopLocalVars.length > 0) {
        extraction.paramNames = generateParamPadding(loopLocalVars);
      }
      extraction.captureNames = crossScopeCaptures.sort();
      extraction.captures = crossScopeCaptures.length > 0;
    }
  }
}

/**
 * Unify parameter slots for multiple event handlers on the same element.
 * Ensures consistent positional parameter ordering across handlers.
 */
export function unifyParameterSlots(
  extractions: ExtractionResult[],
  enclosingExtMap: Map<string, ExtractionResult>,
  extractionLoopMap: Map<string, LoopContext[]>,
  globalDeclPositions: Map<string, number>,
  repairedCode: string,
): void {
  // Group event handlers by parent extraction and element position
  const handlersByParent = new Map<string, typeof extractions>();
  for (const ext of extractions) {
    if (ext.ctxKind !== "eventHandler") continue;
    if (
      ext.paramNames.length < 2 ||
      ext.paramNames[0] !== "_" ||
      ext.paramNames[1] !== "_1"
    )
      continue;
    // Find the parent extraction using pre-computed map
    const parentExt = enclosingExtMap.get(ext.symbolName);
    if (!parentExt) continue;
    const parentName = parentExt.symbolName;
    if (!handlersByParent.has(parentName))
      handlersByParent.set(parentName, []);
    handlersByParent.get(parentName)!.push(ext);
  }

  // For each parent, group handlers by their containing JSX element
  for (const [, handlers] of handlersByParent) {
    if (handlers.length < 2) continue;

    // Group by containing element: scan backwards in source from callStart to find '<'
    const elementGroups = new Map<number, typeof extractions>();
    for (const h of handlers) {
      let pos = h.callStart - 1;
      while (pos > 0 && repairedCode[pos] !== "<") pos--;
      const existing = elementGroups.get(pos);
      if (existing) {
        existing.push(h);
      } else {
        elementGroups.set(pos, [h]);
      }
    }

    // For each element group with 2+ handlers, unify their loop-local params
    for (const [, group] of elementGroups) {
      if (group.length < 2) continue;

      // Collect all unique loop-local params across all handlers, sorted by declaration position
      const allLoopLocals: string[] = [];
      const seen = new Set<string>();
      for (const h of group) {
        for (let i = 2; i < h.paramNames.length; i++) {
          const p = h.paramNames[i];
          if (!seen.has(p)) {
            seen.add(p);
            allLoopLocals.push(p);
          }
        }
      }
      // Determine sort order: non-loop handlers use alphabetical sort (SWC Rule 7),
      // loop handlers use declaration-position sort.
      const anyInLoop = group.some((h) => {
        const loops = extractionLoopMap.get(h.symbolName);
        return loops && loops.length > 0;
      });
      if (anyInLoop) {
        allLoopLocals.sort(
          (a, b) =>
            (globalDeclPositions.get(a) ?? 0) -
            (globalDeclPositions.get(b) ?? 0),
        );
      } else {
        allLoopLocals.sort((a, b) => a.localeCompare(b));
      }

      if (allLoopLocals.length === 0) continue;

      // Now reassign paramNames for each handler using unified slots.
      // Handlers with no loop-local captures keep just (_, _1) -- they don't
      // participate in slot allocation.
      for (const h of group) {
        const handlerCaptures = new Set<string>();
        for (let i = 2; i < h.paramNames.length; i++) {
          handlerCaptures.add(h.paramNames[i]);
        }
        if (handlerCaptures.size === 0) continue; // no captures, keep (_, _1) only
        // Build new paramNames with unified slots.
        // Trailing unused positions are omitted (not padded).
        const newParams = ["_", "_1"];
        let paddingCounter = 2; // Start at _2 for first gap
        let lastCaptureIdx = -1;
        // Find the last position in the unified list that this handler uses
        for (let idx = 0; idx < allLoopLocals.length; idx++) {
          if (handlerCaptures.has(allLoopLocals[idx])) lastCaptureIdx = idx;
        }
        // Only fill slots up to the last used position
        for (let idx = 0; idx <= lastCaptureIdx; idx++) {
          const p = allLoopLocals[idx];
          if (handlerCaptures.has(p)) {
            newParams.push(p);
          } else {
            newParams.push(`_${paddingCounter}`);
          }
          paddingCounter++;
        }
        h.paramNames = newParams;
      }
    }
  }
}

/**
 * Build the element capture map: for each event handler, store the unified q:ps params
 * for its containing element.
 */
export function buildElementCaptureMap(
  extractions: ExtractionResult[],
  enclosingExtMap: Map<string, ExtractionResult>,
  extractionLoopMap: Map<string, LoopContext[]>,
  globalDeclPositions: Map<string, number>,
  repairedCode: string,
): Map<string, string[]> {
  const elementQpParamsMap = new Map<string, string[]>();

  // Group event handlers by parent and element (same logic as slot unification)
  const handlersByParent2 = new Map<string, typeof extractions>();
  for (const ext of extractions) {
    if (ext.ctxKind !== "eventHandler") continue;
    if (
      ext.paramNames.length < 2 ||
      ext.paramNames[0] !== "_" ||
      ext.paramNames[1] !== "_1"
    )
      continue;
    // Find the parent extraction using pre-computed map
    const parentExt2 = enclosingExtMap.get(ext.symbolName);
    if (!parentExt2) continue;
    const parentName = parentExt2.symbolName;
    if (!handlersByParent2.has(parentName))
      handlersByParent2.set(parentName, []);
    handlersByParent2.get(parentName)!.push(ext);
  }

  for (const [, handlers] of handlersByParent2) {
    // Group by element
    const elementGroups2 = new Map<number, typeof extractions>();
    for (const h of handlers) {
      let pos = h.callStart - 1;
      while (pos > 0 && repairedCode[pos] !== "<") pos--;
      const existing = elementGroups2.get(pos);
      if (existing) existing.push(h);
      else elementGroups2.set(pos, [h]);
    }

    for (const [, group] of elementGroups2) {
      // Collect actual (non-padding) loop-local vars in declaration order
      const allVars: string[] = [];
      const seen = new Set<string>();
      for (const h of group) {
        for (let i = 2; i < h.paramNames.length; i++) {
          const p = h.paramNames[i];
          if (numberedPaddingParam.test(p) || p === "_") continue;
          if (!seen.has(p)) {
            seen.add(p);
            allVars.push(p);
          }
        }
      }
      // Non-loop handlers use alphabetical sort; loop handlers use declaration order
      const anyInLoop2 = group.some((h) => {
        const loops = extractionLoopMap.get(h.symbolName);
        return loops && loops.length > 0;
      });
      if (anyInLoop2) {
        allVars.sort(
          (a, b) =>
            (globalDeclPositions.get(a) ?? 0) -
            (globalDeclPositions.get(b) ?? 0),
        );
      } else {
        allVars.sort((a, b) => a.localeCompare(b));
      }
      for (const h of group) {
        elementQpParamsMap.set(h.symbolName, allVars);
      }
    }
  }

  return elementQpParamsMap;
}
