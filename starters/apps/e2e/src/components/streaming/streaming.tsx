import { component$, Host } from '@builder.io/qwik';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Streaming = component$(() => {
  return (
    <Host class="my-app p-20">
      <ul>
        {/* <li>1</li>
        <li>2</li>
        <li>3</li>
        <li>4</li>
        <li>5</li>
        <li>6</li> */}
        {delay(0).then(() => (
          <li>1</li>
        ))}
        {delay(1000).then(() => (
          <li>2</li>
        ))}
        {delay(2000).then(() => (
          <li>3</li>
        ))}
        {delay(3000).then(() => (
          <li>4</li>
        ))}
        {delay(4000).then(() => (
          <li>5</li>
        ))}
        {delay(5000).then(() => (
          <li>6</li>
        ))}
      </ul>
    </Host>
  );
});
