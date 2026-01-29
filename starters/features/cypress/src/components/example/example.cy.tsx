import { $, component$ } from '@builder.io/qwik';
import { QwikCityMockProvider } from '@builder.io/qwik-city';

import { ExampleTest } from './example';
import { useExampleLoader } from '../../loaders/example.loader';
import { useExampleAction } from '../../actions/example.action';

const Template = component$((props: { flag: boolean }) => {
  const loadersMock = [
    {
      loader: useExampleLoader,
      data: 'Loader Data',
    },
  ];

  const actionStub = $(() => cy.stub().as('actionStub'))();
  const actionsMock = [
    {
      action: useExampleAction,
      handler: $(async () => {
        await actionStub.then((_) => _());
        return { status: 200, result: 'Action Data' };
      }),
    },
  ];

  return (
    <QwikCityMockProvider loaders={loadersMock} actions={actionsMock}>
      <ExampleTest flag={props.flag} />
    </QwikCityMockProvider>
  );
});

it('should render ⭐', () => {
  cy.mount(<Template flag={true} />);
  cy.get('#icon').should('contain.text', '⭐');
});

it('should render 💣', () => {
  cy.mount(<Template flag={false} />);
  cy.get('#icon').should('contain.text', '💣');
});

it('should count clicks', () => {
  cy.mount(<Template flag={true} />);
  cy.get('#count').should('contain.text', 'Count:0');
  cy.get('#btn-counter').click();
  cy.get('#count').should('contain.text', 'Count:1');
});

it('should render loader data', () => {
  cy.mount(<Template flag={true} />);
  cy.get('#loader-data').should('contain.text', 'Loader Data');
});

it('should call action on button click', () => {
  cy.mount(<Template flag={true} />);
  cy.get('#btn-action').click();
  cy.get('@actionStub').should('have.been.called');
});
