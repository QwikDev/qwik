import { type Signal } from "@qwikdev/core";
import type { LocationsProps } from "./location";
export interface MapProps {
  // default options
  location: Signal<LocationsProps>;
  // add other options to customization map
}
