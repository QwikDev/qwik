import { defineClickTests } from '../utils/click-tests';
import { CLICKABLE_ON_ALL_AT_ONCE } from '../utils/fixtures';

for (const fixture of CLICKABLE_ON_ALL_AT_ONCE) {
  defineClickTests(fixture, 'all-at-once:');
}
