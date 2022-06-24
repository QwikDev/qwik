import type { Route } from '@builder.io/qwik-city';

export const Analytics = ({ route }: { route: Route }) => {
  return (
    <>
      <script dangerouslySetInnerHTML={`console.log("🧨 Analytics! ${route.pathname}");`} />
    </>
  );
};
