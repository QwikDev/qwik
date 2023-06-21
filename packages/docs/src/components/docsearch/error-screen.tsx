import { component$ } from '@builder.io/qwik';
import { ErrorIcon } from './icons/ErrorIcon';

export type ErrorScreenTranslations = Partial<{
  titleText: string;
  helpText: string;
}>;

export const ErrorScreen = component$(() => {
  return (
    <div class="DocSearch-ErrorScreen">
      <div class="DocSearch-Screen-Icon">
        <ErrorIcon />
      </div>
      <p class="DocSearch-Title">Unable to fetch results</p>
      <p class="DocSearch-Help">You might want to check your network connection.</p>
    </div>
  );
});
