export const mergeMaps = <K, V>(map1: Map<K, V>, map2: Map<K, V>): Map<K, V> => {
  for (const [k, v] of map2) {
    map1.set(k, v);
  }
  return map1;
};
