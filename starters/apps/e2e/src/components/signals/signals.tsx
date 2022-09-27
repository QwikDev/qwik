import { component$, useWatch$, useSignal, wrapSignal, useStore, useResource$ } from '@builder.io/qwik';

export const Signals = component$(() => {
  const count = useSignal(0);

  const doubleCount = useResource$(() => {
    return count.value * 2; // no track needed
  });

  useComputed((v) => {
    return v * 2;
  }, [signal])


  return (
    <div data-active={active}>
      <button onClick$={() => count.value++}>Increment</button>
      <Child count={doubleCount} />
      <Foo number={store.number}/>
      <Foo number={wrapSignal(store, 'number')}/>

      {/* <Child count={wrapSignal(store, 'foo')} /> */}

    </div>
  );
});

interface ChildProps {
  count: number;
}
export const Child = component$((props: ChildProps) => {

  return (
    <>
      <div>{wrap(props, 'count')}</div>
      {Array.from({ length: 20000 }).map(() => {
        return <div aria-hidden="true">Expensive</div>;
      })}
    </>
  );
});

interface Props {
  number: number;
}

export const Foo = (props: Props) => {
  console.log(props.number)

}