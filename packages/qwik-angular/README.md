# Qwik Angular

QwikAngular allows you to use Angular components in Qwik, including the whole ecosystem of component libraries.

## Installation

Inside your Qwik app run:

```shell
npm run qwik add angular
```

If you don't have a Qwik app yet, then you need to [create one first](../../../docs/getting-started/index.mdx), then, follow the instructions and run the command add Angular to your app.

```shell
npm create qwik@latest
cd to-my-app
npm run qwik add angular
```

## Usage

The @builder.io/qwik-angular package exports the qwikify$() function that lets you convert Angular components into Qwik components, that you can use across your application.

Angular and Qwik components can not be mixed in the same file, if you check your project right after running the installation command, you will see a new folder src/integrations/angular/components, from now on, all your Angular components will live there. Qwikified components are declared and exported from src/integrations/angular/index.ts file, it is important to not place Qwik code in the Angular component files.

## Limitations

## Defining A Component

The Qwik Angular integration **only** supports rendering standalone components. You can still compose required UIs with Angular code that uses modules by wrapping it inside standalone components:

```ts
import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hello',
  standalone: true,
  imports: [NgIf, MatButtonModule],
  template: `
    <p>Hello from Angular!!</p>

    <p *ngIf="show">{{ helpText }}</p>

    <button mat-raised-button color="primary" (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  @Input() helpText = 'help';

  show = false;

  toggle() {
    this.show = !this.show;
  }
}
```

### Every qwikified Angular component is isolated

Each instance of a qwikified Angular component becomes an independent Angular app. Fully isolated.

```tsx
export const AngularHelloComponent = qwikify$(HelloComponent);
<AngularHelloComponent></AngularHelloComponent>;
```

- Each `AngularHelloComponent` is a fully isolated Angular application, with its own state, lifecycle, etc.
- Styles will be duplicated
- State will not be shared.
- Islands will hydrate independently

### Use `qwikify$()` as a migration strategy

Using Angular components in Qwik is a great way to migrate your application to Qwik, but it's not a silver bullet, you will need to rewrite your components to take advantage of Qwik's features.

It's also a great way to enjoy the Angular ecosystem.

> Don't abuse of `qwikify$()` to build your own application, all performance gains will be lost.

### Build wide islands, not leaf nodes

For example, if you need to use several Angular components, to build a list, don't qwikify each individual component, instead, build the whole list as a single qwikified Angular component.

#### GOOD: Wide island

A single qwikified component, with all the Angular components inside. Styles will not be duplicated, and context and theming will work as expected.

```ts
// folder.component.ts
import List from './list.component';
import ListItem from './list-item.component';
import ListItemText from './list-item-text.component';
import ListItemAvatar from './list-item-avatar.component';
import Avatar from './avatar.component';
import Icon from './icon.component';

// Qwikify the whole list
@Component({
  standalone: true,
  imports: [List, ListItem, ListItemText, ListItemAvatar, Avatar, Icon],
  template: `
     <app-list [sx]={ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }>
      <app-list-item>
        <app-list-item-avatar>
          <app-avatar>
            <app-icon fontIcon="image"></app-icon>
          </app-avatar>
        </app-list-item-avatar>
        <app-list-item-text primary="Photos" secondary="Jan 9, 2014"></app-list-item-text>
      </app-list-item>
      <app-list-item>
        <app-list-item-avatar>
          <app-avatar>
            <app-icon fontIcon="work"></app-icon>
          </app-avatar>
        </app-list-item-avatar>
        <app-list-item-text primary="Work" secondary="Jan 7, 2014"></app-list-item-text>
      </app-list-item>
      <app-list-item>
        <app-list-item-avatar>
          <app-avatar>
            <app-icon fontIcon="beach-access"></app-icon>
          </app-avatar>
        </app-list-item-avatar>
        <app-list-item-text primary="Vacation" secondary="July 20, 2014"></app-list-item-text>
      </app-list-item>
    </app-list>
`,
})
export class FolderList {}
```

#### BAD: Leaf nodes

Leaf nodes are qwikified independently, effectively rendering dozens of nested Angular applications, each fully isolated from the others, and styles being duplicated.

```tsx
import List from './list.component';
import ListItem from './list-item.component';
import ListItemText from './list-item-text.component';
import ListItemAvatar from './list-item-avatar.component';
import Avatar from './avatar.component';
import Icon from './icon.component';

export const AngularList = qwikify$(List);
export const AngularListItem = qwikify$(ListItem);
export const AngularListItemText = qwikify$(ListItemText);
export const AngularListItemAvatar = qwikify$(ListItemAvatar);
export const AngularAvatar = qwikify$(Avatar);
export const AngularIcon = qwikify$(Icon);
```

```tsx
// Qwik component using dozens of nested Angular islands
// Each Angular-* is an independent Angular application
export const FolderList = component$(() {
  return (
    <AngularList sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }}>
      <AngularListItem>
        <AngularListItemAvatar>
          <AngularAvatar>
            <AngularIcon fontIcon="image" />
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary="Photos" secondary="Jan 9, 2014" />
      </ListItem>
      <AngularListItem>
        <AngularListItemAvatar>
          <AngularAvatar>
            <AngularIcon fontIcon="work" />
          </Avatar>
        </ListItemAvatar>
        <AngularListItemText primary="Work" secondary="Jan 7, 2014" />
      </ListItem>
      <AngularListItem>
        <AngularListItemAvatar>
          <AngularAvatar>
            <AngularIcon fontIcon="beach-access" />
          </Avatar>
        </ListItemAvatar>
        <AngularListItemText primary="Vacation" secondary="July 20, 2014" />
      </ListItem>
    </List>
  );
});
```

## Adding interactivity

In order to add interactivity it is required to hydrate the Angular application. Angular uses [destructive hydration](https://blog.angular.io/angulars-vision-for-the-future-3cfca5e7b448), which means components are rendered on the server and then are fully recreated on the client. This [adds a massive overhead](https://www.builder.io/blog/hydration-is-pure-overhead) and making sites slow.

Qwik allows you decide when to hydrate your components, by using the `client:` JSX properties, this technique is commonly called partial hydration, popularized by [Astro](https://astro.build/).

```diff
export default component$(() => {
  return (
    <>
-      <AngularComponent></AngularComponent>
+      <AngularComponent client:visible></AngularComponent>
    </>
  );
});
```

Qwik comes with different strategies out of the box:

### `client:load`

The component eagerly hydrates when the document loads.

```tsx
<AngularComponent client:load></AngularComponent>
```

**Use case:** Immediately-visible UI elements that need to be interactive as soon as possible.

### `client:idle`

The component eagerly hydrates when the browser first become idle, ie, when everything important as already run before.

```tsx
<AngularComponent client:idle><AngularComponentlider>
```

**Use case:** Lower-priority UI elements that don’t need to be immediately interactive.

### `client:visible`

The component eagerly hydrates when it becomes visible in the viewport.

```tsx
<AngularComponent client:visible></AngularComponent>
```

**Use case:** Low-priority UI elements that are either far down the page (“below the fold”) or so resource-intensive to load that you would prefer not to load them at all if the user never saw the element.

### `client:hover`

The component eagerly hydrates when the mouse is over the component.

```tsx
<AngularComponent client:hover></AngularComponent>
```

**Use case:** Lowest-priority UI elements which interactivity is not crucial, and only needs to run in desktop.

### `client:signal`

This is an advanced API that allows to hydrate the component whenever the passed signal becomes `true`.

```tsx
export default component$(() => {
  const hydrateAngular = useSignal(false);
  return (
    <>
      <button onClick$={() => (hydrateAngular.value = true)}>
        Hydrate Angular Component when clicked
      </button>
      <AngularComponent client:signal={hydrateAngular}></AngularComponent>
    </>
  );
});
```

This effectively allows you to implement custom strategies for hydration.

### `client:event`

The component eagerly hydrates when specified DOM events are dispatched.

```tsx
<AngularComponent client:event="click"></AngularComponent>
```

### `client:only`

When `true`, the component will not run in SSR, only in the browser.

```tsx
<AngularComponent client:only></AngularComponent>
```

## Listening to Angular events

Events in Angular are propagated as component outputs:

```html
<!-- Angular code (won't work in Qwik) -->
<app-slider (change)="console.log('value changed', $event)"></app-slider>;
```

The `qwikify()` function will convert all outputs into properties with functional handlers

```tsx
import { Slider } from './components';
import { qwikify$ } from '@builder.io/qwik-angular';
const AngularSlider = qwikify$(Slider);
<AngularSlider client:visible change={() => console.log('value changed')} />;
```

> Notice that we use the `client:visible` property to eagerly hydrate the component, otherwise the component would not be interactive and the events would never be dispatched.

## Host element

When wrapping an Angular component with `qwikify$()`, under the hood, a new DOM element is created, such as:

```html
<qwik-angular>
  <button class="button"></button>
</qwik-angular>
```

> Notice, that the tag name of the wrapper element is configurable via `tagName`: `qwikify$(AngularCmp, { tagName: 'my-ng' })`.

### Listen to DOM events without hydration

The host element is not part of Angular, meaning that hydration is not necessary to listen for events, in order to add custom attributes and events to the host element, you can use the `host:` prefix in the JSX properties, such as:

```tsx
<AngularButton
  host:onClick$={() => {
    console.log('click an Angular component without hydration!!');
  }}
/>
```

This will effectively allow you to respond to a click in an Angular button without downloading a single byte of Angular code.

Happy hacking!
