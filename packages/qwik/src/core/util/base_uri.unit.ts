import { getBaseUri } from './base_uri';

describe('getBaseUri', () => {
  it('should get this file', () => {
    expect(getBaseUri()).toContain('base_uri.unit.js');
  });
  it('should getBaseUri equal import.meta.url', () => {
    const baseURI = getBaseUri();
    // For some reason the sourcemap have extra util in the path.
    // baseURI = baseURI.replace('/util/util/', '/util/');
    expect(baseURI.replace('.js', '')).toEqual(__filename.replace('.ts', ''));
  });
});
