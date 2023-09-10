import {
    component$,
    noSerialize,
    useSignal,
    useStyles$,
    useVisibleTask$,
  } from '@builder.io/qwik';
  import { Map} from 'leaflet';
  
  export const LeafletMap = component$(({ location }: any) => {
    useStyles$(`
      #map {
          width: 100%;
          height: 350px;
        }
      `);
  
    const mapContainer$ = useSignal<Map>();
  
    useVisibleTask$(async ({ track }) => {
      track(location);

      const { tileLayer, marker } = await import ('leaflet');

  
      const { getBoundaryBox } = await import('../../helpers/boundary-box');
  
      if (location && window) {
        if (mapContainer$.value) {
          mapContainer$.value.remove();
        }
  
        const { value: locationData } = location;
  
        const centerPosition: [number, number] = locationData.point as [
          number,
          number
        ];
  
        const map: any = new Map('map').setView(
          centerPosition,
          locationData.zoom || 14
        );
  
        tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
  
        // Assign select boundary box to use in OSM API if you want
        location.boundaryBox = getBoundaryBox(map);
  
        locationData.marker && marker(centerPosition).addTo(map);
  
        mapContainer$.value = noSerialize(map);
      }
    });
    return <div id='map'></div>;
  });