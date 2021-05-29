/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/// <reference types="cypress" />

describe('bootloader_spec', () => {
  beforeEach(() => cy.visit('/specs/qwikloader_spec.html'));
  it('should register all events', () => {
    cy.get('#click_test > button').click();
    cy.get('#click_test > pre').should((pre) => expect(pre).to.have.text('PASSED'));
  });

  it('should listen on non-bubbling event', () => {
    cy.get('#non_bubbling_event > button').trigger('mouseenter');
    cy.get('#non_bubbling_event > pre').should((pre) => expect(pre).to.have.text('PASSED'));
  });

  it('should should set up `$init` event', () => {
    cy.get('#autofire_\\$init > pre').should((pre) => expect(pre).to.have.text('PASSED'));
  });
});
