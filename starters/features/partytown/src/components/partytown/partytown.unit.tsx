import { ElementFixture } from '@builder.io/qwik/testing';
import { suite } from 'uvu';
import { match } from 'uvu/assert';
import { render } from '@builder.io/qwik';
import { QwikPartytown } from '../partytown/partytown';

const qComponent = suite('q-component');

qComponent('should declare and render basic component with script party town', async () => {
  const fixture = new ElementFixture().host;
  await render(fixture, <QwikPartytown />);
  await expectRegex(fixture, `querySelectorAll\('script\[type="text\/partytown"\]'`);
});

export async function expectRegex(actual: Element, expected: string) {
  match(actual.outerHTML, expected);
}

qComponent.run();
