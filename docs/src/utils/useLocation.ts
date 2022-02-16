import { useHostElement } from '@builder.io/qwik';

export const useLocation = () => {
  const doc = useHostElement().ownerDocument;
  return doc.location;
};
