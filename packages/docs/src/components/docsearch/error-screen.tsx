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
    <div className="DocSearch-ErrorScreen">
      <div className="DocSearch-Screen-Icon">
        <ErrorIcon />
      </div>
      <p className="DocSearch-Title">{titleText}</p>
      <p className="DocSearch-Help">{helpText}</p>
    </div>
  );
});
