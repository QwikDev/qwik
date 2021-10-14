/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/// <reference types="cypress" />

describe('hello_server', () => {
  // TODO(OPTIMIZER): re-enable once optimizer is working
  it.skip('typing into input updates text', () => {
    cy.visit('/hello_server/');
    cy.get('input').type('.ABC', { delay: 30 }); // TODO(misko): We should not have to use `delay`
    cy.get('body span').should((span) => expect(span).to.have.text('Hello World.ABC!'));
  });
});
