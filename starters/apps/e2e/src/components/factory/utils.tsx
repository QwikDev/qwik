import { component$, implicit$FirstArg, type QRL } from "@builder.io/qwik";

export function factoryQrl<P extends Record<string, any>>(
  componentQRL: QRL<(props: P) => any>,
) {
  return component$((props: P) => {
    const component = componentQRL.resolve();
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
