import { createWindow } from './document';
import { pathToFileURL } from 'url';

describe('window', () => {
  it('should create document', () => {
    const win = createWindow({
      url: pathToFileURL(__filename),
    });
    expect(win.document.baseURI).toContain('file://');
    expect(win.document.baseURI).toContain('document.unit.ts');
  });
});
