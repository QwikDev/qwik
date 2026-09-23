import { component$ } from '@qwik.dev/core';
import { EbThrowOnClick } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <EbThrowOnClick idPrefix="eb-no-boundary" message="no-boundary boom" />
));
