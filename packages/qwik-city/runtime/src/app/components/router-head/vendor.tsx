import type { RouteLocation } from '~qwik-city-runtime';

export const Vendor = ({ loc }: VendorProps) => {
  return (
    <>
      <script dangerouslySetInnerHTML={`console.log("🧨 Analytics! ${loc.pathname}");`} />
    </>
  );
};

interface VendorProps {
  loc: RouteLocation;
}
