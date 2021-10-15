import { qRender, qDehydrate, h, qObject, QObject } from '@builder.io/qwik';
import { ArchApp, Cmp } from './architecture';
/* eslint no-console: ["off"] */

const monolith = createApp();
const islands = createApp();
const uIslets = createApp();

qRender(document.querySelector('#app')!, h(ArchApp, { monolith, islands, uIslets })).then(() => {
  qDehydrate(document);
  console.clear();
});

function createApp(): QObject<Cmp> {
  const product = qObject<Cmp>({ class: 'product' });
  const cart = qObject<Cmp>({});
  return qObject<Cmp>({
    class: 'root',
    children: [
      qObject<Cmp>({
        class: 'header',
        isLazy: true,
        children: [
          qObject<Cmp>({ children: [qObject<Cmp>({}), qObject<Cmp>({}), qObject<Cmp>({})] }),
          qObject<Cmp>({}),
          qObject<Cmp>({}),
          qObject<Cmp>({}),
          qObject<Cmp>({}),
          qObject<Cmp>({ children: [qObject<Cmp>({}), qObject<Cmp>({})] }),
          qObject<Cmp>({}),
          cart,
        ],
      }),
      qObject<Cmp>({
        class: 'middle',
        children: [
          qObject<Cmp>({
            isLazy: true,
            class: 'left',
            children: [qObject<Cmp>({}), qObject<Cmp>({}), qObject<Cmp>({}), qObject<Cmp>({})],
          }),
          qObject<Cmp>({
            class: 'main',
            isLazy: true,
            children: [
              qObject<Cmp>({
                class: 'product-main',
                children: [
                  product,
                  qObject<Cmp>({
                    class: 'product-details',
                    children: [
                      qObject<Cmp>({ related: product }),
                      qObject<Cmp>({ related: product }),
                      qObject<Cmp>({ related: product }),
                      qObject<Cmp>({ related: product }),
                      qObject<Cmp>({ related: product }),
                      qObject<Cmp>({ related: product }),
                    ],
                  }),
                ],
              }),
              qObject<Cmp>({
                class: 'product-side',
                children: [
                  qObject<Cmp>({ related: cart }),
                  qObject<Cmp>({ related: cart }),
                  qObject<Cmp>({ related: cart }),
                  qObject<Cmp>({ related: cart }),
                  qObject<Cmp>({ related: cart }),
                  qObject<Cmp>({ related: cart }),
                ],
              }),
            ],
          }),
        ],
      }),
      qObject<Cmp>({
        class: 'footer',
        isLazy: true,
        children: [
          qObject<Cmp>({ children: [qObject<Cmp>({}), qObject<Cmp>({}), qObject<Cmp>({})] }),
          qObject<Cmp>({}),
          qObject<Cmp>({}),
        ],
      }),
    ],
  });
}
