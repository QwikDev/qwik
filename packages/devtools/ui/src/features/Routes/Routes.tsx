import { component$ } from '@qwik.dev/core';
import { State } from '../../types/state';

interface RoutesProps {
  state: State;
}

export const Routes = component$(({ state }: RoutesProps) => {
  return (
    <div class="border-border flex-1 overflow-hidden rounded-xl border">
      <div class="bg-card-item-bg grid grid-cols-4 gap-4 p-4 text-sm font-medium">
        <div>Route Path</div>
        <div>Name</div>
        <div>Middleware</div>
        <div>Layout</div>
      </div>
      {state.routes?.map((route, i) => {
        const children = route.children || [];
        const layout =
          route.relativePath !== '' &&
          route.type === 'directory' &&
          children.find((child) => child.name.startsWith('layout'));

        return (
          <div
            key={route.relativePath}
            class="border-border hover:bg-card-item-hover-bg grid grid-cols-4 gap-4 border-t p-4 text-sm"
          >
            <div>
              <span
                class={{
                  'text-accent':
                    (location.pathname === '/' && route.relativePath === '') ||
                    location.pathname === `/${route.relativePath}/`,
                }}
              >
                {route.relativePath === '' ? '/' : `/${route.relativePath}/`}
              </span>
            </div>
            <div class="text-muted-foreground">{route.name}</div>
            <div class="text-muted-foreground">-</div>
            <div>
              <span
                class={{
                  'text-accent': layout && i > 0,
                  'text-muted-foreground': !layout || i === 0,
                }}
              >
                {layout && i > 0 ? `${route.relativePath}/layout` : 'default'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
