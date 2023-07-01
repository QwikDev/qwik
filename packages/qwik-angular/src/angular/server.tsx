import { type QRL, type Signal, SSRRaw, Slot } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import {
  reflectComponentType,
  ApplicationRef,
  type ComponentMirror,
  InjectionToken,
  type Provider,
  ɵRender3ComponentFactory,
  type Injector,
  type Type,
  NgZone,
  ɵNoopNgZone,
} from '@angular/core';
import {
  BEFORE_APP_SERIALIZED,
  renderApplication,
  provideServerRendering,
} from '@angular/platform-server';
import { bootstrapApplication } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { getHostProps } from './slot';
import { BehaviorSubject } from 'rxjs';

const SLOT_MARK = 'SLOT';
const SLOT_COMMENT = `<!--${SLOT_MARK}-->`;

const projectableNodesMap = new Set<Type<unknown>>();
const create = ɵRender3ComponentFactory.prototype.create;
ɵRender3ComponentFactory.prototype.create = function (
  injector: Injector,
  projectableNodes?: any[][],
  rootSelectorOrNode?: any,
  environmentInjector?: any
) {
  if (projectableNodesMap.has(this.componentType)) {
    const document_local: typeof document = this['ngModule'].injector.get(DOCUMENT);
    const slotComment = document_local.createComment(SLOT_MARK);
    projectableNodes = [[slotComment]]; // TODO: support multiple ng-content
  }
  return create.call(this, injector, projectableNodes, rootSelectorOrNode, environmentInjector);
};

const QWIK_ANGULAR_STATIC_PROPS = new InjectionToken<{
  props: Record<string, unknown>;
  mirror: ComponentMirror<unknown>;
}>('@builder.io/qwik-angular: Static Props w/ Mirror Provider', {
  factory() {
    return { props: {}, mirror: {} as ComponentMirror<unknown> };
  },
});

// Run beforeAppInitialized hook to set Input on the ComponentRef
// before the platform renders to string
const STATIC_PROPS_HOOK_PROVIDER: Provider = {
  provide: BEFORE_APP_SERIALIZED,
  useFactory: (
    appRef: ApplicationRef,
    {
      props,
      mirror,
    }: {
      props: Record<string, unknown>;
      mirror: ComponentMirror<unknown>;
    }
  ) => {
    return () => {
      const compRef = appRef.components[0];
      if (compRef && props && mirror) {
        for (const [key, value] of Object.entries(props)) {
          if (
            // we double-check inputs on ComponentMirror
            // because there might be additional props
            // that aren't actually Input defined on the Component
            mirror.inputs.some(
              ({ templateName, propName }) => templateName === key || propName === key
            )
          ) {
            compRef.setInput(key, value);
          }
        }
        compRef.changeDetectorRef.detectChanges();
      }
    };
  },
  deps: [ApplicationRef, QWIK_ANGULAR_STATIC_PROPS],
  multi: true,
};

class MockApplicationRef extends ApplicationRef {
  isStable = new BehaviorSubject(true);
}

export async function renderFromServer(
  Host: any,
  angularCmp$: QRL<Type<unknown>>,
  hostRef: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  props: Record<string, unknown>
) {
  if (isServer) {
    const component = await angularCmp$.resolve();
    const mirror = reflectComponentType(component);

    if (mirror?.ngContentSelectors.length) {
      projectableNodesMap.add(component);
    }

    const appId = mirror?.selector || component.name.toString().toLowerCase();
    const document = `<${appId}></${appId}>`;

    // There're certain issues with setting up zone.js in the qwik's node runtime
    // thus dropping it entirely for now
    // It might affect SSR in some sense, but should not be critical in most of the cases
    const mockZoneProviders = [
      {
        provide: ApplicationRef,
        useFactory: () => new MockApplicationRef(),
      },
      { provide: NgZone, useClass: ɵNoopNgZone },
    ];

    const bootstrap = () =>
      bootstrapApplication(component, {
        providers: [
          ...mockZoneProviders,
          {
            provide: QWIK_ANGULAR_STATIC_PROPS,
            useValue: { props, mirror },
          },
          STATIC_PROPS_HOOK_PROVIDER,
          provideServerRendering(),
        ],
      });
    const html = await renderApplication(bootstrap, {
      document,
    });
    const index = html.indexOf(SLOT_COMMENT);

    if (index > 0) {
      const part1 = html.slice(0, index);
      const part2 = html.slice(index + SLOT_COMMENT.length);
      return (
        <Host ref={hostRef} {...getHostProps(props)}>
          <SSRRaw data={part1}></SSRRaw>
          <q-slot projected ref={slotRef}>
            <Slot />
          </q-slot>
          <SSRRaw data={part2}></SSRRaw>
        </Host>
      );
    }
    return (
      <>
        <Host ref={hostRef} {...getHostProps(props)}>
          <SSRRaw data={html}></SSRRaw>
        </Host>
        <q-slot ref={slotRef}>
          <Slot />
        </q-slot>
      </>
    );
  }
  return null;
}
