/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/// <reference types="cypress" />

describe('hello_static', () => {
  it('typing into input updates text', () => {
    cy.visit('/hello_static/');
    cy.get('#name').type('!!!');
    cy.get('body span').should((span) => expect(span).to.have.text('World!!!'));

    cy.get('button').click();
    cy.on('window:alert', (txt) => {
      // electron does not have alert, so this part of the test does not execute
      // in electron.
      expect(txt).to.contains('Hello World!!!');
    });
  });
});
