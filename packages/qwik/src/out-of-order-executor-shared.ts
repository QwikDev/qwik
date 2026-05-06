/** Shared out-of-order Suspense executor logic for the inline script and source tests. */

const Q_RESOLVED_SELECTOR = 'template[q\\:r="';
const Q_FALLBACK_SELECTOR = '[q\\:f="';
const Q_GROUP_ATTR = 'q:g';
const Q_INDEX_ATTR = 'q:i';
const Q_ORDER_ATTR = 'q:o';
const Q_COLLAPSED_ATTR = 'q:c';
const Q_CONTAINER_SELECTOR = '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])';

type OutOfOrderTemplate = HTMLTemplateElement | null;
type OutOfOrderFallback = Element | null;
type OutOfOrderEntry = [OutOfOrderTemplate | 0, OutOfOrderFallback];
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
  p(): void;
};

type OutOfOrderDocument = Document & {
  qProcessOOOS?: (doc: Document) => void;
  qProcessVNodeData?: (doc: Document) => void;
};

type OutOfOrderGlobal = typeof globalThis & {
  qO?: OutOfOrderExecutor;
};

export const installOutOfOrderExecutor = (doc: Document) => {
  const groups = new WeakMap<OutOfOrderScope, Record<string, OutOfOrderGroup>>();

  const process = () => {
    const executorDoc = doc as OutOfOrderDocument;
    const processOOOS = executorDoc.qProcessOOOS || executorDoc.qProcessVNodeData;
    if (processOOOS) {
      processOOOS(executorDoc);
    }
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

  const swap = (resolved: OutOfOrderTemplate, fallback: OutOfOrderFallback) => {
    let content: Element | null;
    let parent: Node | null;

    if (!resolved || !fallback) {
      return 0;
    }
    parent = fallback.parentNode;
    if (!parent) {
      return 0;
    }
    content = fallback.nextElementSibling;
    if (!content) {
      return 0;
    }
    content.appendChild(resolved.content);
    if ((fallback as HTMLElement).style) {
      (fallback as HTMLElement).style.display = 'none';
    }
    if ((content as HTMLElement).style) {
      (content as HTMLElement).style.display = 'contents';
    }
    fallback.removeAttribute(Q_GROUP_ATTR);
    fallback.removeAttribute(Q_INDEX_ATTR);
    fallback.removeAttribute(Q_ORDER_ATTR);
    fallback.removeAttribute(Q_COLLAPSED_ATTR);
    resolved.remove();
    return 1;
  };

  const flush = (group: OutOfOrderGroup) => {
    const order = group.o;
    let entry: OutOfOrderEntry | undefined;
    let index: number;
    let swapped = 0;

    if (order === 'p') {
      for (const key in group.r) {
        entry = group.r[key];
        if (entry[0] && swap(entry[0], entry[1])) {
          entry[0] = 0;
          swapped++;
        }
      }
    } else if (order === 's') {
      for (index = group.n; (entry = group.r[index]) && entry[0]; index++) {
        if (!swap(entry[0], entry[1])) {
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
        if (!swap(entry[0], entry[1])) {
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
        if (entry[0] && swap(entry[0], entry[1])) {
          entry[0] = 0;
          swapped++;
        }
      }
    }
    return swapped;
  };

  const qO = ((boundaryId: number) => {
    const scope = getScope();
    const resolved = scope.querySelector(
      Q_RESOLVED_SELECTOR + boundaryId + '"]'
    ) as OutOfOrderTemplate;
    let fallback: OutOfOrderFallback;
    let groupId: string | null;
    let currentGroup: OutOfOrderGroup;
    let index: number;

    if (!resolved) {
      return;
    }
    fallback = scope.querySelector(Q_FALLBACK_SELECTOR + boundaryId + '"]') as OutOfOrderFallback;
    groupId = resolved.getAttribute(Q_GROUP_ATTR);
    if (groupId) {
      index = +(resolved.getAttribute('q:i') || 0);
      currentGroup = group(scope, groupId, -1, resolved.getAttribute('q:o') || 'p');
      currentGroup.r[index] = [resolved, fallback];
      if (flush(currentGroup)) {
        process();
      }
      return;
    }
    if (swap(resolved, fallback)) {
      process();
    }
  }) as OutOfOrderExecutor;

  qO.g = (groupId: number, total: number, order: string) => {
    const currentGroup = group(getScope(), groupId, total, order);
    currentGroup.t = total;
    currentGroup.o = order;
    if (currentGroup.o === 'r' && currentGroup.n === 0) {
      currentGroup.n = total - 1;
    }
    if (flush(currentGroup)) {
      process();
    }
  };
  qO.p = process;
  qO.d = doc;

  (globalThis as OutOfOrderGlobal).qO = qO;
};
