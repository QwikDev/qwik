const Cmp = ({ Cmp, ev, ...props }: any) => {
  return (
      <Cmp {...props} />
  );
};

export const Main = (cmp: any, props: any, event?: any) => {
  return <Cmp Cmp={cmp} event={event} {...props} />;
};

export { createElement } from 'react';
export { createRoot, hydrateRoot } from 'react-dom/client';
