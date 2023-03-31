import {
  createComponent,
  type EventEmitter,
  NgZone,
  reflectComponentType,
  type ApplicationRef,
  type ComponentRef,
  type ComponentMirror,
  type Type,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { merge, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { extractProjectableNodes } from './extract-projectable-nodes';
import zoneJs from 'zone.js/dist/zone.min.js?url';
import { getAngularProps } from './slot';
import { provideAnimations } from '@angular/platform-browser/animations';

declare const Zone: unknown;

export class ClientRenderer {
  appRef: ApplicationRef | undefined;

  private componentRef!: ComponentRef<unknown>;

  private mirror: ComponentMirror<unknown> | null = null;
  private readonly knownInputs = new Set();
  private readonly knownOutputs = new Set();

  private readonly outputHandlers = new Map<string, Function>();

  private readonly onDestroy$ = new Subject<void>();

  private initialized = false;

  constructor(private component: Type<unknown>, private initialProps: Record<string, unknown>) {}

  async render(hostElement: Element, slot: Element | undefined, props = this.initialProps) {
    await this.loadZoneJs();
    try {
      this.appRef = await createApplication({
        providers: [provideAnimations()]
      });
    } catch (error) {
      console.error('Failed to qwikify Angular component', error);
      return;
    }
    const zone = this.appRef.injector.get(NgZone);

    zone.run(() => {
      this.mirror = reflectComponentType(this.component);

      const projectableNodes =
        slot && extractProjectableNodes(slot, [...(this.mirror?.ngContentSelectors ?? [])]);

      this.componentRef = createComponent(this.component, {
        environmentInjector: this.appRef!.injector,
        hostElement: hostElement,
        projectableNodes,
      });

      this.componentRef.onDestroy(() => this.onDestroy$.next());

      this.mirror?.inputs.forEach((i) => {
        this.knownInputs.add(i.propName);
        this.knownInputs.add(i.templateName);
      });
      this.mirror?.outputs.forEach((i) => {
        this.knownOutputs.add(i.templateName);
      });

      this.setInputProps(props, true);

      this._subscribeToEvents();

      this.appRef!.attachView(this.componentRef.hostView);
      this.initialized = true;
    });
  }

  setInputProps(props: Record<string, unknown>, skipInitCheck = false) {
    if (!this.initialized && !skipInitCheck) {
      return;
    }

    // propsEntries will include output props w\o "$" suffix
    const propsEntries = Object.entries(getAngularProps(props));

    for (const [key, value] of propsEntries) {
      if (this.knownInputs.has(key)) {
        this.componentRef.setInput(key, value);
      }
      if (this.knownOutputs.has(key)) {
        if (typeof value === 'function') {
          this.outputHandlers.set(key, value);
        } else {
          console.warn(
            `"${key}" param expects a callback function, got "${typeof value}" instead.`
          );
        }
      }
    }

    this.appRef!.tick();
  }

  private _subscribeToEvents(): void {
    if (!this.mirror) {
      return;
    }

    const eventEmitters = this.mirror.outputs.map(({ propName, templateName }) => {
      const emitter = (this.componentRef.instance as any)[propName] as EventEmitter<any>;
      return emitter.pipe(map((value: any) => ({ name: templateName, value })));
    });
    const outputEvents = merge(...eventEmitters);
    // listen for events from the merged stream and dispatch them as custom events
    outputEvents.pipe(takeUntil(this.onDestroy$)).subscribe((e) => {
      // emit the event to the registered handler
      this.outputHandlers.get(e.name)?.(e.value);
    });
  }

  private async loadZoneJs(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (typeof Zone === 'function') {
        return resolve();
      }
      const script = document.createElement('script');
      script.src = zoneJs;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
      script.remove();
    });
  }
}
