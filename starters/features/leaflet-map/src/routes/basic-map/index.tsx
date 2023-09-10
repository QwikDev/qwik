import { component$, useStyles$ } from "@builder.io/qwik";

// Need import from node_modules to add correct styles by default to show map
// change path depending our level component respect node_modules
import leafletStyles from "./../node_modules/leaflet/dist/leaflet.css?inline";
import { LeafletMap } from "../../components/leaflet-map";

export default component$(() => {
    useStyles$(leafletStyles);
    const currentLocation = {
        name: "Soraluze",
        point: [43.17478, -2.41172],
        // Southwest lat, South West Lng, North East lat,  North East lng
        boundaryBox:
            "43.14658914559456,-2.4765586853027344,43.202923523094725,-2.3467826843261723",
        zoom: 13,
        marker: true,
    };

    return (
        currentLocation ? <LeafletMap location={currentLocation} /> : <div>Loading map...</div>
        
    );
})