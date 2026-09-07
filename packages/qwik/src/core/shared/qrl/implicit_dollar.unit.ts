import { expect, test } from 'vitest';
import { implicit$FirstArg } from './implicit_dollar';
import { inlinedQrl } from './qrl';
import { isQrl } from './qrl-utils';
import { parseQRL } from '../serdes';

test('implicit boundaries preserve compiled QRL identity, captures and remaining arguments', () => {
  const captures = [{ value: 1 }];
  const callback = inlinedQrl(() => 42, 'callback', captures);
  const options = { enabled: true };
  const useCustom$ = implicit$FirstArg((qrl, argument) => ({ qrl, argument }));
  const result = useCustom$(callback, options);
  expect(result.qrl).toBe(callback);
  expect(callback.getCaptured()).toBe(captures);
  expect(result.argument).toBe(options);
});

test('implicit boundaries still wrap authored callbacks', () => {
  const callback = () => 42;
  const useCustom$ = implicit$FirstArg((qrl) => qrl);
  const result = useCustom$(callback);
  expect(isQrl(result)).toBe(true);
  expect(result.resolved).toBe(callback);
});

test('implicit boundaries do not resolve lazy QRLs', () => {
  const callback = parseQRL('./hook#callback');
  const useCustom$ = implicit$FirstArg((qrl) => qrl);
  expect(useCustom$(callback)).toBe(callback);
  expect(callback.resolved).toBeUndefined();
  expect(callback.getSymbol()).toBe('callback');
});
