/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/// <reference types="cypress" />

describe('todo', () => {
  beforeEach(() => cy.visit('/todo/'));
  it('should start with 3 items', () => {
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('3'));
  });

  it('should add new item', () => {
    cy.get('input.new-todo').type('New Item{enter}');
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('4'));
    cy.get('.todo-list>li:last-child label').should((todo) =>
      expect(todo).to.have.text('New Item')
    );
  });

  it('should remove item', () => {
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('3'));
    cy.get('.todo-list>li:last-child button').invoke('show').click();
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('2'));
  });

  it('should complete an item', () => {
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('3'));
    cy.get('.todo-list>li:last-child input').click();
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('2'));
  });

  it('should edit an item', function () {
    cy.get('.todo-list>li:first-child').dblclick();
    cy.wait(20);
    cy.get('.todo-list>li:first-child input.edit').type('123{enter}');
    cy.get('.todo-list>li:first-child').should((item: any) =>
      expect(item).to.have.text('Read Qoot docs123')
    );
  });

  it('should clear completed', () => {
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('3'));
    cy.get('.todo-list>li:first-child input[type=checkbox]').click();
    cy.get('button.clear-completed').click();
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('2'));
    cy.get('.todo-list>li').should('have.length', 2);
  });

  it('should add item, remove item, set filter.', () => {
    // Add item
    cy.get('input.new-todo').type('New Item{enter}');
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('4'));

    // Remove item
    cy.get('.todo-list>li:nth-child(2) button').invoke('show').click();
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('3'));

    // Mark as completed
    cy.get('.todo-list>li:last-child input').click();
    cy.get('.todo-count > strong').should((strong) => expect(strong).to.have.text('2'));

    // filter
    cy.get('footer li:last').click();
    cy.get('.main li').should('have.length', 1);

    // click completed
    cy.get('footer li:first').click();
    cy.get('.clear-completed').click();
    cy.get('.main li').should('have.length', 2);
  });
});
