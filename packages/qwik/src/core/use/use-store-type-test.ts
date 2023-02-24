import { useRef } from './use-ref';
import { useStore } from './use-store.public';

const data = () => ({ value: 'blah', nested: { a: 1 }, array: [true, false] });

export const myTest = () => {
  const storeA = useStore(data, { deep: false, recursive: true }); // deep takes precedence
  const storeB = useStore(data(), { deep: false });
  const storeC = useStore(data, { recursive: false });
  const storeD = useStore(data(), {});
  const storeE = useStore(data());

  // @ts-expect-error
  storeA.nested.a++;
  // @ts-expect-error
  storeB.nested.a++;
  // @ts-expect-error
  storeC.nested.a++;
  // @ts-expect-error
  storeD.nested.a++;
  // @ts-expect-error
  storeE.nested.a++;

  const storeF = useStore(data(), { recursive: true });
  const storeG = useStore(data, { deep: true });
  const storeH = useStore(data(), { deep: true, recursive: true });

  storeF.nested.a++;
  storeG.nested.a++;
  storeH.nested.a++;

  const elementStore = useStore({ elements: [] as Element[] });
  // @ts-expect-error
  elementStore.elements.push(document.createElement('p'));

  const deepElementStore = useStore({ elements: [] as Element[] }, { deep: true });
  deepElementStore.elements.push(document.createElement('p'));

  const refStore = useStore({
    current: document.createElement('p'),
  });

  // @ts-expect-error // className can't be reassigned if the store is not "deep"
  refStore.current.className = 'blah';

  //But we can still use classList to change it
  refStore.current?.classList.add('hello');

  // Text content can't be reassigned if the store is not "deep"
  // @ts-expect-error
  refStore.current.textContent = 'blah';

  const setStore = useStore({
    mySet: new Set(),
  });

  // The set can't be modified if the store is not "deep"
  // @ts-expect-error
  setStore.mySet.add('something');

  // Even though useRef uses a shallow store internally, the typing allows mutations.
  const myRef = useRef<HTMLParagraphElement>();
  const currentRef = myRef.current;
  if (currentRef) {
    currentRef.textContent = 'blah';
  }
};
