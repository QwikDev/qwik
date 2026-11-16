import { createAffinityTree, groupByAffinity } from '../../src/stats/bundle-affinity';

const features = [
  'Catalog',
  'Product',
  'Search',
  'Cart',
  'Checkout',
  'Account',
  'Orders',
  'Reviews',
  'Wishlist',
  'Navigation',
  'Promotions',
  'Support',
];
const actions = [
  'render',
  'open',
  'close',
  'select',
  'submit',
  'validate',
  'update',
  'load',
  'track',
  'reset',
];
const symbols = features.flatMap((feature, group) =>
  actions.map((action, index) => ({
    name: `${feature}_${action}`,
    feature,
    executions: 150 + ((group * 331 + index * 127) % 2800),
  }))
);
const vectors = symbols.map((_, index) => {
  const group = Math.floor(index / 10);
  const vector = Array(symbols.length + features.length + 3).fill(0);
  vector[index] = 0.24 + (index % 10) * 0.135;
  vector[symbols.length + group] = 0.5 + group * 0.13;
  vector[symbols.length + features.length + Math.floor(group / 4)] = 0.9;
  return vector;
});
const tree = createAffinityTree(vectors);
const slider = document.querySelector<HTMLInputElement>('#affinity')!;
let groups = groupByAffinity(symbols, tree, 50);
let selected = 0;
function showSelected() {
  const bundle = groups[selected];
  document.querySelector('#selected')!.textContent = bundle.name;
  document.querySelector('#description')!.textContent =
    `${bundle.symbols.length} symbols · ${new Set(bundle.symbols.map((symbol) => symbol.feature)).size} feature areas`;
  document.querySelector('#symbols')!.replaceChildren(
    ...bundle.symbols.map((symbol) => {
      const row = document.createElement('li');
      const name = document.createElement('code');
      name.textContent = symbol.name;
      const count = document.createElement('span');
      count.className = 'muted';
      count.textContent = ` · ${symbol.executions.toLocaleString()} executions`;
      row.append(name, count);
      return row;
    })
  );
  document
    .querySelectorAll<HTMLButtonElement>('.bundle')
    .forEach((button, index) => button.setAttribute('aria-pressed', String(index === selected)));
}
function render() {
  const start = performance.now();
  groups = groupByAffinity(symbols, tree, Number(slider.value));
  selected = 0;
  document.querySelector('#count')!.textContent = String(groups.length);
  document.querySelector('#largest')!.textContent = String(groups[0].symbols.length);
  document.querySelector('#average')!.textContent = (symbols.length / groups.length).toFixed(1);
  document.querySelector('#level')!.textContent =
    `${slider.value}%${slider.value === '50' ? ' · automatic' : ''}`;
  slider.setAttribute('aria-valuetext', `${slider.value}% affinity, ${groups.length} bundles`);
  document.querySelector('#bundles')!.replaceChildren(
    ...groups.map((bundle, index) => {
      const button = document.createElement('button');
      button.className = 'bundle';
      const title = document.createElement('code');
      title.textContent = bundle.name;
      const summary = document.createElement('small');
      summary.textContent = `${bundle.symbols.length} symbols · ${bundle.symbols[0].feature}${new Set(bundle.symbols.map((symbol) => symbol.feature)).size > 1 ? ' + others' : ''}`;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = `${(bundle.symbols.length / symbols.length) * 100}%`;
      button.append(title, summary, bar);
      button.addEventListener('click', () => {
        selected = index;
        showSelected();
      });
      return button;
    })
  );
  showSelected();
  document.body.dataset.renderMs = String(performance.now() - start);
}
slider.addEventListener('input', render);
document.querySelector('#reset')!.addEventListener('click', () => {
  slider.value = '50';
  render();
});
render();
