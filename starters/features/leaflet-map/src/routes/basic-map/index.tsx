import { component$, useStyles$, useSignal } from "@builder.io/qwik";

// Leaflet map styles
import leafletStyles from "../../../node_modules/leaflet/dist/leaflet.css?inline";

import { LeafletMap } from "~/components/leaflet-map";
import type { LocationsProps } from "~/models/location";

export default component$(() => {
  useStyles$(leafletStyles);
  const currentLocation = useSignal<LocationsProps>({
    name: "Soraluze",
    point: [43.17478, -2.41172],
    /**
     * Define rectangle with: Southwest lat, South West Lng, North East lat,  North East lng points.
     * Very interesting when use to filter in OpenStreetMap API to take POIs
     * Example: https://qwik-osm-poc.netlify.app/
     */
    boundaryBox:
      "43.14658914559456,-2.4765586853027344,43.202923523094725,-2.3467826843261723",
    zoom: 9,
    marker: true,
  });
  return <LeafletMap location={currentLocation} />;
});
