import { native$, nativeFrom, useSignal } from '@qwik.dev/core';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"]; // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"]; // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"]; // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

type Signal<T> = { value: T };

export type Row = {
  id: number;
  label: Signal<string>;
  selected: Signal<boolean>;
};

export const buildData = native$(
  (count: number): Row[] => {
    const data = new Array(count);
    for (let i = 0; i < count; i++) {
      const label = useSignal(
        `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`
      );
      data[i] = {
        id: nextId++,
        label,
        selected: useSignal(false),
      };
    }
    return data;
  },
  { rust: nativeFrom('./native') }
);
