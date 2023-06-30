import type { RouteLocation } from "@builder.io/qwik-city";

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
