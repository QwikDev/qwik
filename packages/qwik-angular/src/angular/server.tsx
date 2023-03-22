import 'zone.js/bundles/zone-node.umd.js';
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
} from '@angular/core';
import { BEFORE_APP_SERIALIZED, renderApplication } from '@angular/platform-server';
import { DOCUMENT } from '@angular/common';

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
            // because Astro might add additional props
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

    const html = await renderApplication(component, {
      appId,
      document,
      providers: [
        {
          provide: QWIK_ANGULAR_STATIC_PROPS,
          useValue: { props, mirror },
        },
        STATIC_PROPS_HOOK_PROVIDER,
      ],
    });
    const index = html.indexOf(SLOT_COMMENT);

    if (index > 0) {
      const part1 = html.slice(0, index);
      const part2 = html.slice(index + SLOT_COMMENT.length);
      return (
        <Host ref={hostRef}>
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
        <Host ref={hostRef}>
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
