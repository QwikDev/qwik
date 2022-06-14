import { component$, implicit$FirstArg, QRL, useHostElement } from '@builder.io/qwik';

export function factoryQrl<P>(componentQRL: QRL<(props: P) => any>) {
  return component$((props: P) => {
    const hostElement = useHostElement();
    const component = componentQRL.resolve(hostElement);
    return (
      <div>
        {component.then((Cmp) => (
          <Cmp {...props} />
        ))}
      </div>
    );
  });
}
export const factory$ = implicit$FirstArg(factoryQrl);
