import { createWindow } from './document';
import { pathToFileURL } from 'url';
import { test } from 'uvu';
import { match } from 'uvu/assert';

test('should create document', () => {
  const win = createWindow({
    url: pathToFileURL(__filename),
  });
  match(win.document.baseURI, 'file://');
  match(win.document.baseURI, 'document.unit.ts');
});
