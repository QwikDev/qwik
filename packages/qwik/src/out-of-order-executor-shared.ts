/** Shared out-of-order Suspense executor logic for the inline script and source tests. */

const Q_RESOLVED_SELECTOR = 'template[q\\:r="';
const Q_RESOLVED_ATTR = 'q:r';
const Q_RESULT_PARENT_SELECTOR = '[q\\:rp="';
const Q_GROUP_ATTR = 'q:g';
const Q_INDEX_ATTR = 'q:i';
const Q_ORDER_ATTR = 'q:o';
const Q_CONTAINER_SELECTOR = '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])';

type OutOfOrderTemplate = HTMLTemplateElement | null;
type OutOfOrderHost = Element | null;
type OutOfOrderEntry = [OutOfOrderHost | 0, OutOfOrderHost];
type OutOfOrderScope = Document | Element;

type OutOfOrderGroup = {
  r: Record<number, OutOfOrderEntry>;
  n: number;
  t: number;
  o: string;
};

type OutOfOrderExecutor = {
  (boundaryId: number): void;
  d: Document;
  g(groupId: number, total: number, order: string): void;
};

type OutOfOrderDocument = Document & {
  qProcessOOOS?: (doc: Document) => void;
};

type OutOfOrderGlobal = typeof globalThis & {
  qO?: OutOfOrderExecutor;
};

export const installOutOfOrderExecutor = (doc: Document) => {
  const groups = new WeakMap<OutOfOrderScope, Record<string, OutOfOrderGroup>>();

  const process = () => {
    const executorDoc = doc as OutOfOrderDocument;
    executorDoc.qProcessOOOS?.(executorDoc);
  };

  const getScope = (): OutOfOrderScope => {
    const script = doc.currentScript;
    return script ? script.closest(Q_CONTAINER_SELECTOR) || doc : doc;
  };

  const group = (
    scope: OutOfOrderScope,
    groupId: number | string,
    total: number,
    order: string
  ): OutOfOrderGroup => {
    let scopedGroups = groups.get(scope);
    if (!scopedGroups) {
      groups.set(scope, (scopedGroups = {}));
    }
    return (
      scopedGroups[groupId] ||
      (scopedGroups[groupId] = {
        r: {},
        n: 0,
        t: total,
        o: order,
      })
    );
  };

  const getResolvedTemplate = (scope: OutOfOrderScope, boundaryId: number): OutOfOrderTemplate => {
    const currentScript = doc.currentScript;
    const previousElement = currentScript ? currentScript.previousElementSibling : null;
    if (
      previousElement &&
      previousElement.localName === 'template' &&
      previousElement.getAttribute(Q_RESOLVED_ATTR) === String(boundaryId)
    ) {
      return previousElement as HTMLTemplateElement;
    }
    const templates = scope.querySelectorAll(Q_RESOLVED_SELECTOR + boundaryId + '"]');
    return templates.length ? (templates[templates.length - 1] as HTMLTemplateElement) : null;
  };

  const getPlaceholderTemplate = (content: Element, boundaryId: number): OutOfOrderTemplate => {
    return content.querySelector(Q_RESOLVED_SELECTOR + boundaryId + '"]') as OutOfOrderTemplate;
  };

  const getResultParent = (scope: OutOfOrderScope, boundaryId: number): Element | null => {
    return scope.querySelector(Q_RESULT_PARENT_SELECTOR + boundaryId + '"]');
  };

  const reveal = (content: OutOfOrderHost, fallback: OutOfOrderHost) => {
    if (!content) {
      return 0;
    }
    if (fallback && (fallback as HTMLElement).style) {
      (fallback as HTMLElement).style.display = 'none';
    }
    if ((content as HTMLElement).style) {
      (content as HTMLElement).style.display = 'contents';
    }
    return 1;
  };

  const move = (scope: OutOfOrderScope, boundaryId: number, resolved: OutOfOrderTemplate) => {
    if (!resolved) {
      return null;
    }
    const content = getResultParent(scope, boundaryId);
    const placeholder = content ? getPlaceholderTemplate(content, boundaryId) : null;
    const parent = placeholder ? placeholder.parentNode : null;
    if (!placeholder || !content || !parent) {
      return null;
    }
    parent.insertBefore(resolved.content, placeholder);
    placeholder.remove();
    resolved.remove();
    return [content, content.previousElementSibling] as OutOfOrderEntry;
  };

  const flush = (group: OutOfOrderGroup) => {
    const order = group.o;
    let entry: OutOfOrderEntry | undefined;
    let index: number;
    let swapped = 0;

    if (order === 'p') {
      for (const key in group.r) {
        entry = group.r[key];
        if (entry[0] && reveal(entry[0], entry[1])) {
          entry[0] = 0;
          swapped++;
        }
      }
    } else if (order === 's') {
      for (index = group.n; (entry = group.r[index]) && entry[0]; index++) {
        if (!reveal(entry[0], entry[1])) {
          break;
        }
        entry[0] = 0;
        swapped++;
        group.n = index + 1;
      }
    } else if (order === 'r') {
      if (group.t < 0) {
        return 0;
      }
      if (group.n < 0) {
        group.n = group.t - 1;
      }
      for (index = group.n; (entry = group.r[index]) && entry[0]; index--) {
        if (!reveal(entry[0], entry[1])) {
          break;
        }
        entry[0] = 0;
        swapped++;
        group.n = index - 1;
      }
    } else {
      if (group.t < 0) {
        return 0;
      }
      for (index = 0; index < group.t; index++) {
        entry = group.r[index];
        if (!entry) {
          return 0;
        }
      }
      for (index = 0; index < group.t; index++) {
        entry = group.r[index];
        if (entry[0] && reveal(entry[0], entry[1])) {
          entry[0] = 0;
          swapped++;
        }
      }
    }
    return swapped;
  };

  const qO = ((boundaryId: number) => {
    const scope = getScope();
    const resolved = getResolvedTemplate(scope, boundaryId);

    if (!resolved) {
      return;
    }
    const entry = move(scope, boundaryId, resolved);
    if (!entry) {
      return;
    }
    process();
    const groupId = resolved.getAttribute(Q_GROUP_ATTR);
    if (groupId) {
      const index = +(resolved.getAttribute(Q_INDEX_ATTR) || 0);
      const currentGroup = group(scope, groupId, -1, resolved.getAttribute(Q_ORDER_ATTR) || 'p');
      currentGroup.r[index] = entry;
      flush(currentGroup);
      return;
    }
    reveal(entry[0] || null, entry[1]);
  }) as OutOfOrderExecutor;

  qO.g = (groupId: number, total: number, order: string) => {
    const currentGroup = group(getScope(), groupId, total, order);
    currentGroup.t = total;
    currentGroup.o = order;
    if (currentGroup.o === 'r' && currentGroup.n === 0) {
      currentGroup.n = total - 1;
    }
    flush(currentGroup);
  };
  qO.d = doc;

  (globalThis as OutOfOrderGlobal).qO = qO;
};
