import { component$ } from '@builder.io/qwik';
import { ErrorIcon } from './icons/ErrorIcon';

export type ErrorScreenTranslations = Partial<{
  titleText: string;
  helpText: string;
}>;

type ErrorScreenProps = {
  translations?: ErrorScreenTranslations;
};

export const ErrorScreen = component$(({ translations = {} }: ErrorScreenProps) => {
  const {
    titleText = 'Unable to fetch results',
    helpText = 'You might want to check your network connection.',
  } = translations;
  return (
    <div class="DocSearch-ErrorScreen">
      <div class="DocSearch-Screen-Icon">
        <ErrorIcon />
      </div>
      <p class="DocSearch-Title">{titleText}</p>
      <p class="DocSearch-Help">{helpText}</p>
    </div>
  );
});
