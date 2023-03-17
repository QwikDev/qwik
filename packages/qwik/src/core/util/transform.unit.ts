import { suite } from 'uvu';
import { equal, throws } from 'uvu/assert';
import { combineInlines, functionToString } from './transform';

const functionToStringSuite = suite('functionToString');
functionToStringSuite('convert a function to a string, with auto execution on', () => {
  function addFunc() {
    const a = 2;
    const b = 1;
    return a + b;
  }
  const actual = functionToString(addFunc);
  const expected =
    `function addFunc(){const a=2;const b=1;return a+b} addFunc();`.replace(/\s+/g, ' ').trim() +
    '\n';
  equal(actual, expected);
});

functionToStringSuite('convert a function to a string, without executing', () => {
  function addFunc() {
    const a = 2;
    const b = 1;
    return a + b;
  }
  const actual = functionToString(addFunc, false);
  const expected =
    `function addFunc(){const a=2;const b=1;return a+b}`.replace(/\s+/g, ' ').trim() + '\n';
  equal(actual, expected);
});

functionToStringSuite('throw error for arrow function to string', () => {
  const addFunc = () => {
    const a = 2;
    const b = 1;
    return a + b;
  };
  throws(() => functionToString(addFunc));
});

const combineInlinesSuite = suite('combineInlines');
combineInlinesSuite('combine two functions, to be executed in order', () => {
  function addFunc(): number {
    return 1 + 2;
  }
  function subFunc(): number {
    return 1 - 2;
  }
  const actual = combineInlines([addFunc, subFunc]);
  const expected = `function addFunc(){return 1+2} addFunc(); function subFunc(){return 1-2} subFunc(); \n`;
  equal(actual.replace(/\s+/g, ' '), expected.replace(/\s+/g, ' '));
});

combineInlinesSuite('combine two functions without execution option', () => {
  function addFunc(): number {
    return 1 + 2;
  }
  function subFunc(): number {
    return 1 - 2;
  }
  const actual = combineInlines([addFunc, subFunc], false);
  const expected = `function addFunc(){return 1+2} function subFunc(){return 1-2}\n`;
  equal(actual.replace(/\s+/g, ' '), expected.replace(/\s+/g, ' '));
});

combineInlinesSuite('combine one functions and a some string', () => {
  function addFunc(): number {
    return 1 + 2;
  }
  const runThis = 'document.documentElement.classList.add("dark");';
  const actual = combineInlines([addFunc, runThis]);
  const expected = `function addFunc(){return 1+2} addFunc(); document.documentElement.classList.add("dark");\n`;
  equal(actual.replace(/\s+/g, ' '), expected.replace(/\s+/g, ' '));
});

combineInlinesSuite.run();
functionToStringSuite.run();
