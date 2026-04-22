export const BASELINE_UNITS = 80;

type Row = {
  id: number;
  label: string;
  tags: string[];
  nested: { score: number; kind: string };
};

/**
 * Shared workload used to normalize benchmark results across machines. Mirrors the operation mix of
 * the real scenarios (object allocation, string concatenation, Map-based bookkeeping, and tree-walk
 * serialization) so the baseline scales proportionally on different architectures instead of
 * becoming a pure-integer hot loop that Intel handles disproportionately well.
 */
export const sharedBaselineWorkload = (units = BASELINE_UNITS): number => {
  let checksum = 0;

  for (let u = 0; u < units; u++) {
    // Allocate row objects with nested shape transitions (mimics JSX/VNode churn).
    const rows: Row[] = new Array(128);
    for (let i = 0; i < 128; i++) {
      rows[i] = {
        id: i,
        label: 'row-' + u + '-' + i,
        tags: ['tag-' + (i % 7), 'tag-' + (i % 11), 'tag-' + (i % 13)],
        nested: { score: (i * 17) ^ u, kind: 'k-' + (i & 3) },
      };
    }

    // Build an HTML-like string (mimics SSR output assembly).
    let html = '<table class="bench-baseline"><tbody>';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      html +=
        '<tr><td>' +
        r.id +
        '</td><td>' +
        r.label +
        '</td><td>' +
        r.tags[0] +
        ',' +
        r.tags[1] +
        ',' +
        r.tags[2] +
        '</td></tr>';
    }
    html += '</tbody></table>';
    checksum = (checksum + html.length) | 0;

    // Hash-map round trip (mimics VNode / serdes state bookkeeping).
    const lookup = new Map<string, Row>();
    for (let i = 0; i < rows.length; i++) {
      lookup.set(rows[i].label, rows[i]);
    }
    for (let i = 0; i < rows.length; i++) {
      const r = lookup.get(rows[i].label);
      if (r) {
        checksum = (checksum + r.id + r.nested.score) | 0;
      }
    }

    // Walk the graph and produce a serialized string (mimics serialize-state-1k).
    let serialized = '[';
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) {
        serialized += ',';
      }
      const r = rows[i];
      serialized +=
        '{"id":' +
        r.id +
        ',"label":"' +
        r.label +
        '","tags":["' +
        r.tags[0] +
        '","' +
        r.tags[1] +
        '","' +
        r.tags[2] +
        '"],"score":' +
        r.nested.score +
        ',"kind":"' +
        r.nested.kind +
        '"}';
    }
    serialized += ']';
    checksum = (checksum + serialized.length) | 0;
  }

  return checksum;
};

export const formatRatio = (value: number): string => {
  const step = value < 10 ? 5 : value < 100 ? 25 : value < 1000 ? 250 : 2000;
  const lower = Math.floor(value / step) * step;
  const upper = lower + step;
  return `${lower}-${upper}x`;
};

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};
