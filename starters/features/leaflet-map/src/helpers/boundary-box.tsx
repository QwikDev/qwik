import type { Map } from "leaflet";
export const getBoundaryBox = (map: Map) => {
  const northEast = map.getBounds().getNorthEast();
  const southWest = map.getBounds().getSouthWest();
  return `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;
};
