import { useDocument } from '@builder.io/qwik';

export const useLocation = () => {
  const doc = useDocument();
  return doc.location;
};
