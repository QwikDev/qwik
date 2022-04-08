import { component$, implicit$FirstArg, QRL, useHostElement } from '@builder.io/qwik';

export function factoryQrl<P>(componentQRL: QRL<(props: P) => any>) {
  return component$(async (props: P) => {
    const hostElement = useHostElement();
    const Component = await componentQRL.resolve(hostElement);
    return (
      <div>
        <Component {...props} />
      </div>
    );
  });
}
export const factory$ = implicit$FirstArg(factoryQrl);
