import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ locale, request }) => {
  const acceptLanguage = request.headers.get('accept-language');
  const [languages] = acceptLanguage?.split(';') || ['?', '?'];
  const [preferredLanguage] = languages.split(',');
  locale(preferredLanguage);
};

export const onGet: RequestHandler = async ({ locale, json }) => {
  json(200, { locale: locale() });
};
