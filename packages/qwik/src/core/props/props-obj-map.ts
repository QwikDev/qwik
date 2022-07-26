import type { QObject } from '../object/q-object';

export interface QObjectMap {
  $add$(qObject: QObject<any>): number;
  $get$(index: number): QObject<any> | undefined;
  $indexOf$(object: QObject<any>): number | undefined;
  readonly $array$: QObject<any>[];
}

export const newQObjectMap = (): QObjectMap => {
  const array: QObject<any>[] = [];
  return {
    $array$: array,
    $get$(index: number): QObject<any> | undefined {
      return array[index];
    },
    $indexOf$(obj: string): number | undefined {
      const index = array.indexOf(obj);
      return index === -1 ? undefined : index;
    },
    $add$(object: QObject<any>) {
      const index = array.indexOf(object);
      if (index === -1) {
        array.push(object);
        return array.length - 1;
      }
      return index;
    },
  } as QObjectMap;
};
