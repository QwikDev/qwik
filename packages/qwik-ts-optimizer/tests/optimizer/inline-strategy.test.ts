import { describe, expect, it } from 'vitest';
import {
  buildNoopQrlDeclaration,
  buildNoopQrlDevDeclaration,
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  buildSCall,
  getSentinelCounter,
} from '../../src/optimizer/inline-strategy.js';

describe('inline-strategy', () => {
  // -------------------------------------------------------------------------
  // buildNoopQrlDeclaration
  // -------------------------------------------------------------------------
  describe('buildNoopQrlDeclaration', () => {
    it('produces _noopQrl const declaration', () => {
      const result = buildNoopQrlDeclaration('Child_component_9GyF01GDKqw');
      expect(result).toBe(
        'const q_Child_component_9GyF01GDKqw = /*#__PURE__*/ _noopQrl("Child_component_9GyF01GDKqw");',
      );
    });

    it('works with different symbol names', () => {
      const result = buildNoopQrlDeclaration('App_component_ckEPmXZlub0');
      expect(result).toBe(
        'const q_App_component_ckEPmXZlub0 = /*#__PURE__*/ _noopQrl("App_component_ckEPmXZlub0");',
      );
    });
  });

  // -------------------------------------------------------------------------
  // buildNoopQrlDevDeclaration
  // -------------------------------------------------------------------------
  describe('buildNoopQrlDevDeclaration', () => {
    it('produces _noopQrlDEV const declaration with dev metadata', () => {
      const result = buildNoopQrlDevDeclaration(
        'App_component_Cmp_p_q_e_click_Yl4ybrJWrt4',
        {
          file: '/user/qwik/src/test.tsx',
          lo: 144,
          hi: 169,
          displayName: 'test.tsx_App_component_Cmp_p_q_e_click',
        },
      );
      expect(result).toBe(
        'const q_App_component_Cmp_p_q_e_click_Yl4ybrJWrt4 = /*#__PURE__*/ _noopQrlDEV("App_component_Cmp_p_q_e_click_Yl4ybrJWrt4", {\n' +
          '    file: "/user/qwik/src/test.tsx",\n' +
          '    lo: 144,\n' +
          '    hi: 169,\n' +
          '    displayName: "test.tsx_App_component_Cmp_p_q_e_click"\n' +
          '});',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getSentinelCounter
  // -------------------------------------------------------------------------
  describe('getSentinelCounter', () => {
    it('returns 0xFFFF0000 for index 0', () => {
      expect(getSentinelCounter(0)).toBe(4294901760);
    });

    it('returns 0xFFFF0000 + 2 for index 1', () => {
      expect(getSentinelCounter(1)).toBe(4294901762);
    });

    it('returns 0xFFFF0000 + 4 for index 2', () => {
      expect(getSentinelCounter(2)).toBe(4294901764);
    });

    it('returns 0xFFFF0000 + 6 for index 3', () => {
      expect(getSentinelCounter(3)).toBe(4294901766);
    });
  });

  // -------------------------------------------------------------------------
  // buildStrippedNoopQrl
  // -------------------------------------------------------------------------
  describe('buildStrippedNoopQrl', () => {
    it('produces sentinel-named _noopQrl for index 0', () => {
      const result = buildStrippedNoopQrl('s_r1qAHX7Opp0', 0);
      expect(result).toBe(
        'const q_qrl_4294901760 = /*#__PURE__*/ _noopQrl("s_r1qAHX7Opp0");',
      );
    });

    it('produces sentinel-named _noopQrl for index 1', () => {
      const result = buildStrippedNoopQrl('s_ddV1irobfWI', 1);
      expect(result).toBe(
        'const q_qrl_4294901762 = /*#__PURE__*/ _noopQrl("s_ddV1irobfWI");',
      );
    });
  });

  // -------------------------------------------------------------------------
  // buildStrippedNoopQrlDev
  // -------------------------------------------------------------------------
  describe('buildStrippedNoopQrlDev', () => {
    it('produces sentinel-named _noopQrlDEV with dev metadata', () => {
      const result = buildStrippedNoopQrlDev('App_component_serverStuff_ebyHaP15ytQ', 0, {
        file: '/hello/from/dev/test.tsx',
        lo: 0,
        hi: 0,
        displayName: 'test.tsx_App_component_serverStuff',
      });
      expect(result).toBe(
        'const q_qrl_4294901760 = /*#__PURE__*/ _noopQrlDEV("App_component_serverStuff_ebyHaP15ytQ", {\n' +
          '    file: "/hello/from/dev/test.tsx",\n' +
          '    lo: 0,\n' +
          '    hi: 0,\n' +
          '    displayName: "test.tsx_App_component_serverStuff"\n' +
          '});',
      );
    });
  });

  // -------------------------------------------------------------------------
  // buildSCall
  // -------------------------------------------------------------------------
  describe('buildSCall', () => {
    it('produces .s() call with body text', () => {
      const result = buildSCall('q_Child_component_9GyF01GDKqw', '()=>{ return "hello"; }');
      expect(result).toBe('q_Child_component_9GyF01GDKqw.s(()=>{ return "hello"; });');
    });

    it('produces .s() call with string body', () => {
      const result = buildSCall('q_Child_component_useStyles_qBZTuFM0160', "'somestring'");
      expect(result).toBe("q_Child_component_useStyles_qBZTuFM0160.s('somestring');");
    });
  });
});
