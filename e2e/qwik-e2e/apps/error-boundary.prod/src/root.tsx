import { component$ } from '@qwik.dev/core';
import { ErrorBoundaryStreamingRoot } from '../../e2e/src/components/error-boundary/error-boundary';

// Every pathname renders the SHARED dev-app fixture, so prod covers the same scenarios.
export const Root = component$(() => <ErrorBoundaryStreamingRoot />);
