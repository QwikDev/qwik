import type { LocationsProps } from "./location";
import { type Signal } from "@builder.io/qwik";
export interface MapProps {
  // default options
  location: Signal<LocationsProps>;
  // add other options to customization map
}
