import type { RouteLocation } from "@qwik.dev/router";

export const Vendor = ({ loc }: VendorProps) => {
  return (
    <>
      <script
        dangerouslySetInnerHTML={`console.log("🧨 Analytics! ${loc.url.pathname}");`}
      />
    </>
  );
};

interface VendorProps {
  loc: RouteLocation;
}
