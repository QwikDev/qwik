import type { RouteLocation } from '@builder.io/qwik-city';

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
