import {
  component$,
  noSerialize,
  useSignal,
  useStyles$,
  useVisibleTask$,
  type Signal,
} from '@builder.io/qwik';
import * as L from 'leaflet';
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

export default component$(() => {
  useStyles$(
    leafletStyles +
      `
    .marker-label {
      color: red;
      font-weight: 700;
    }
  `
  );

  const markers: Record<string, MarkersProps[]> = {
    FDA: [
      {
        name: "Terzo d'Aquileia",
        label: 'TRZ',
        lat: '45.770946',
        lon: '13.31338',
      },
      {
        name: 'Musi',
        label: 'MUS',
        lat: '46.312663',
        lon: '13.274682',
      },
    ],
    FVG: [
      {
        name: 'Borgo Grotta Gigante',
        label: 'BGG',
        lat: '45.709385',
        lon: '13.764681',
      },
      {
        name: 'Muggia',
        label: 'MGG',
        lat: '45.610495',
        lon: '13.752682',
      },
    ],
  };

  const groupSig = useSignal('FDA');
  const currentLocation = useSignal<LocationsProps>({
    name: 'Udine',
    point: [46.06600881056668, 13.237724558490601],
    zoom: 10,
    marker: true,
  });

  return (
    <>
      Change markers:{'  '}
      <select name="group" class="leaflet-ctrl" bind:value={groupSig}>
        <option value="FDA">FDA</option>
        <option value="FVG">FVG</option>
      </select>
      <LeafletMap
        location={currentLocation}
        markers={markers[groupSig.value]}
        group={groupSig}
      ></LeafletMap>
    </>
  );
});

// The properties (props) used in the `LeafletMap` component and other related components are defined as follows:

export interface MapProps {
  location: Signal<LocationsProps>;
  markers?: MarkersProps[];
  group?: Signal<string>;
}

export interface LocationsProps {
  name: string;
  point: [number, number];
  zoom: number;
  marker: boolean;
}

export interface MarkersProps {
  name: string;
  label: string;
  lat: string;
  lon: string;
}

/*
The `LeafletMap` component leverages the Leaflet library to render an interactive map. 
This component can be configured with various properties (props) to set the central location, add markers, and draw boundaries.
In the `LeafletMap` component, both the location and the group signal are tracked.
This ensures that when the signal changes, the server function is called, and the map is updated with the new data.
*/

export const LeafletMap = component$<MapProps>(
  ({ location, markers, group }) => {
    const mapContainerSig = useSignal<L.Map>();

    useVisibleTask$(async ({ track }) => {
      track(location);
      group && track(group);

      if (mapContainerSig.value) {
        mapContainerSig.value.remove();
      }

      // center location
      const { value: locationData } = location;
      const centerPosition = locationData.point;

      // layers
      const markersLayer = new L.LayerGroup();
      const bordersLayer = new L.LayerGroup();

      // map
      const map = L.map('map', {
        layers: [markersLayer, bordersLayer],
      }).setView(centerPosition, locationData.zoom || 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // center position marker

      const qwikMarker = L.divIcon({
        html: ` 
          <svg xmlns="http://www.w3.org/2000/svg" width="30.12" height="32" viewBox="0 0 256 272">
            <path fill="#18B6F6"
              d="m224.803 271.548l-48.76-48.483l-.744.107v-.532L71.606 120.252l25.55-24.667l-15.01-86.12l-71.222 88.247c-12.136 12.226-14.372 32.109-5.642 46.781l44.5 73.788c6.813 11.376 19.163 18.18 32.47 18.074l22.038-.213z" />
            <path fill="#AC7EF4"
              d="m251.414 96.01l-9.795-18.075l-5.11-9.25l-2.023-3.615l-.212.213l-26.829-46.463C200.738 7.125 188.176-.105 174.55 0l-23.527.639l-70.158.213c-13.307.106-25.444 7.123-32.151 18.5l-42.69 84.632L82.353 9.25l100.073 109.937l-17.779 17.968l10.646 86.015l.107-.213v.213h-.213l.213.212l8.304 8.081l40.348 39.445c1.704 1.595 4.472-.318 3.3-2.339l-24.911-49.014l43.436-80.273l1.383-1.595c.533-.638 1.065-1.276 1.491-1.914c8.517-11.589 9.688-27.112 2.662-39.764" />
            <path fill="#FFF" d="M182.746 118.763L82.353 9.358l14.266 85.695l-25.55 24.773L175.08 223.065l-9.368-85.696z" />
          </svg>
        `,
        className: '',
        iconSize: [24, 40],
      });

      locationData.marker &&
        L.marker(centerPosition, { icon: qwikMarker })
          .bindPopup(`Udine`)
          .addTo(map);

      // add markers to map
      const markersList = await markers;
      markersList &&
        markersList.map((m) => {
          const myIcon = L.divIcon({
            className: 'marker-point',
            html: `<div class="marker-label" title="${m.name}" >${m.label}</div>`,
          });
          L.marker([+m.lat, +m.lon], { icon: myIcon }).addTo(markersLayer);
        });

      mapContainerSig.value = noSerialize(map);
    });

    return <div id="map" style={{ height: '25rem' }}></div>;
  }
);
