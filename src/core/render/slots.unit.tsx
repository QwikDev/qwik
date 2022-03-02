import { html } from '../../testing/util';
import { toDOM } from '../../testing/jsx';
import { QSlotSelector } from '../util/markers';
import { getSlotMap } from './slots';
import { getQComponent } from '../component/component-ctx';

describe('slots', () => {
  describe('getSlotMap', () => {
    it('should materialize nothing', async () => {
      const component = toDOM(<component on:q-render={'' as any}></component>);
      const ctx = getQComponent(component);
      const slots = getSlotMap(ctx!);
      expect(slots).toEqual([]);
    });

    it('should retrieve unnamed slots which are unused', async () => {
      const component = toDOM(
        <component on:q-render={'' as any}>
          <template q:slot="">
            some text
            <span>more text</span>
          </template>
        </component>
      );
      const ctx = getQComponent(component);
      const slots = getSlotMap(ctx!);
      const template = (component.querySelector('template')! as HTMLTemplateElement).content;
      const someText = template.firstChild as Text;
      const moreText = someText.nextElementSibling;
      expect(someText.textContent).toEqual('some text');
      expect(moreText?.outerHTML).toEqual('<span>more text</span>');
      expect(html(slots)).toEqual(html(['', [-1, template, someText, moreText]]));
    });

    it('should retrieve empty slots', () => {
      const component = toDOM(
        <component on:q-render={'' as any}>
          <template q:slot={true as any}></template>
          <q:slot name=""></q:slot>
          <q:slot name="b"></q:slot>
        </component>
      );
      const ctx = getQComponent(component);
      const slots = getSlotMap(ctx!);
      const [qSlot, qSlotB] = Array.from(component.querySelectorAll('q\\:slot'));
      expect(html(slots)).toEqual(html(['', [-1, qSlot], 'b', [-1, qSlotB]]));
    });

    it('should retrieve slots in complex case', async () => {
      const component = toDOM(
        <component on:q-render={'' as any}>
          <template q:slot={true as any}>
            <b>text</b>
            <span q:slot="description">more text</span>
          </template>
          <div>
            <q:slot name="title">
              <span q:slot="title">title</span>
            </q:slot>
            <q:slot name="sub-title">
              <span q:slot="sub-title">sub-title</span>
            </q:slot>
          </div>
        </component>
      );
      const ctx = getQComponent(component);
      const slots = getSlotMap(ctx!);
      const template = (component.querySelector('template')! as HTMLTemplateElement).content;
      expect(html(slots)).toEqual(
        html([
          '',
          [-1, template, template.querySelector('b')],
          'description',
          [-1, template, template.querySelector('[q\\:slot="description"]')],
          'sub-title',
          [
            -1,
            component.querySelector('q\\:slot[name="sub-title"]'),
            component.querySelector('span[q\\:slot="sub-title"]'),
          ],
          'title',
          [
            -1,
            component.querySelector('q\\:slot[name="title"]'),
            component.querySelector('span[q\\:slot="title"]'),
          ],
        ])
      );
    });

    it('should not retrieve sub-slots', () => {
      const component = toDOM(
        <component on:q-render={'' as any}>
          <div>
            <q:slot name="include">
              <span q:slot="include">
                <q:slot>
                  <span q:slot="ignore">sub-title</span>
                </q:slot>
              </span>
            </q:slot>
          </div>
        </component>
      );
      const ctx = getQComponent(component);
      const slots = getSlotMap(ctx!);
      expect(html(slots)).toEqual([
        'include',
        [
          -1,
          html(component.querySelector(QSlotSelector)),
          html(component.querySelector('span[q\\:slot="include"]')),
        ],
      ]);
    });
  });
});
