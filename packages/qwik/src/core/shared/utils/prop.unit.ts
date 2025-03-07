import { beforeEach, describe, expect, it } from 'vitest';
import * as propFile from './prop';

describe('prop', () => {
  beforeEach(() => {
    propFile.__testing__.propNameToId.clear();
    propFile.__testing__.idToPropName.length = 0;
  });

  describe('getPropId', () => {
    it('adding props to map', async () => {
      expect(propFile.getPropName(propFile.getPropId('firstProp'))).toBe('firstProp');
      expect(propFile.getPropName(propFile.getPropId('secondProp'))).toBe('secondProp');
    });

    it('adding event', async () => {
      expect(propFile.getPropName(propFile.getPropId('onClick$'))).toBe('onClick$');
      expect(propFile.getPropName(propFile.getPropId('window:onClick$'))).toBe('window:onClick$');
      expect(propFile.getPropName(propFile.getPropId('document:onClick$'))).toBe(
        'document:onClick$'
      );
      expect(propFile.getPropName(propFile.getPropId('onDblClick$'))).toBe('onDblclick$');
      expect(propFile.getPropName(propFile.getPropId('window:onDblClick$'))).toBe(
        'window:onDblclick$'
      );
      expect(propFile.getPropName(propFile.getPropId('document:onDblClick$'))).toBe(
        'document:onDblclick$'
      );
      expect(propFile.getPropName(propFile.getPropId('document:onDOMContentLoaded$'))).toBe(
        'document:onDOMContentLoaded$'
      );
    });
  });
});
