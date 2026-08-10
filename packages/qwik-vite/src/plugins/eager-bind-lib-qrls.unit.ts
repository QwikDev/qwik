import { describe, expect, it } from 'vitest';
import { eagerBindLibraryQrls } from './eager-bind-lib-qrls';

describe('eagerBindLibraryQrls', () => {
  it('statically imports the chunk and rebinds the declaration', () => {
    const code = [
      `import { _qrlWithChunk } from '@qwik.dev/core';`,
      `const q_link_component_$_segment_0_qpo5ztvwo1w7 = /* @__PURE__ */ _qrlWithChunk("./link-component.tsx_link_component_$_segment_0_qpo5ztvwo1w7.js", () => import('./link-component.tsx_link_component___segment_0_qpo5ztvwo1w7.qwik.mjs'), "link_component_$_segment_0_qpo5ztvwo1w7");`,
      `export { q_link_component_$_segment_0_qpo5ztvwo1w7 };`,
    ].join('\n');

    const output = eagerBindLibraryQrls(code)!;

    expect(output).toContain(
      `import { link_component_$_segment_0_qpo5ztvwo1w7 as ` +
        `link_component_$_segment_0_qpo5ztvwo1w7_eager0 } from ` +
        `"./link-component.tsx_link_component___segment_0_qpo5ztvwo1w7.qwik.mjs";`
    );
    // the lazy declaration is renamed and the original name rebinds through `.s()`
    expect(output).toContain(
      `const q_link_component_$_segment_0_qpo5ztvwo1w7_lazy0 = /* @__PURE__ */ _qrlWithChunk(`
    );
    expect(output).toContain(
      `const q_link_component_$_segment_0_qpo5ztvwo1w7 = ` +
        `(q_link_component_$_segment_0_qpo5ztvwo1w7_lazy0.s(` +
        `link_component_$_segment_0_qpo5ztvwo1w7_eager0), ` +
        `q_link_component_$_segment_0_qpo5ztvwo1w7_lazy0);`
    );
    // the chunk name argument for serialization is untouched
    expect(output).toContain(`_qrlWithChunk("./link-component.tsx_link_component_$_segment_0_`);
  });

  it('handles the DEV variant, hash-style pure annotations, and multiple declarations', () => {
    const code = [
      `const q_a = /*#__PURE__*/ _qrlWithChunkDEV("./a.js", () => import("./a.qwik.mjs"), "seg_a", { file: "a.tsx", lo: 1, hi: 2 });`,
      `const q_b = _qrlWithChunk("./b.js", () => import("./b.qwik.mjs"), "seg_b", ["x"]);`,
    ].join('\n');

    const output = eagerBindLibraryQrls(code)!;

    expect(output).toContain(`import { seg_a as seg_a_eager0 } from "./a.qwik.mjs";`);
    expect(output).toContain(`import { seg_b as seg_b_eager1 } from "./b.qwik.mjs";`);
    expect(output).toContain(`const q_a = (q_a_lazy0.s(seg_a_eager0), q_a_lazy0);`);
    expect(output).toContain(`const q_b = (q_b_lazy1.s(seg_b_eager1), q_b_lazy1);`);
  });

  it('indexes the plucked namespace re-export of a merged chunk with the symbol', () => {
    const code = `const q_c = /*#__PURE__*/ _qrlWithChunk("./c.js", () => import('./merged.qwik.mjs').then(n => n.d), "seg_c");`;

    const output = eagerBindLibraryQrls(code)!;

    expect(output).toContain(`import { d as seg_c_eager0 } from "./merged.qwik.mjs";`);
    expect(output).toContain(`const q_c = (q_c_lazy0.s(seg_c_eager0["seg_c"]), q_c_lazy0);`);
  });

  it('returns null for modules without lazy chunk QRLs', () => {
    expect(eagerBindLibraryQrls(`export const a = 1;`)).toBeNull();
  });
});
