import { component$ } from '@qwik.dev/core';
import { CatchThrowOnClick } from '../../components/catch/catch';

export default component$(() => (
  <CatchThrowOnClick idPrefix="catch-no-boundary" message="no-boundary boom" />
));
