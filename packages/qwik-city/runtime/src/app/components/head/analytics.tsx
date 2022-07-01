import type { RouteLocation } from '~qwik-city-runtime';

interface AnalyticsProps {
  loc: RouteLocation;
}

export const Analytics = ({ loc }: AnalyticsProps) => {
  return (
    <>
      <script dangerouslySetInnerHTML={`console.log("🧨 Analytics! ${loc.pathname}");`} />
    </>
  );
};
