# TypeScript Best Practices

This is a guideline of best practices that we can apply to our TypeScript project.
These tips are based on TypeScript documentation, books, articles and professional experience.
Most of these recommendations also apply to JavaScript.


## Follow conventions

Code conventions are base rules that allow the creation of a uniform code base across an organization.
Following them does not only increase the uniformity and therefore the quality of the code.
[Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) is very popular and recommended. We can complete them with rules just for TypeScript.
To make it mandatory, we need a linter, formatter and strong code review. The code conventions must be dynamic and adaptable for each team and project.
It is up to each team to define its convention.

## Testing

Testing is more important than shipping.
If we have no tests or an inadequate amount, then every time we ship code, we won't be sure that we didn't break anything.
There's no excuse to not write tests.
There are plenty of good JavaScript test frameworks with typing support for TypeScript.
Always write tests for every new feature/module we introduce.

## Strict configuration

The stricter configuration should be mandatory and should be enabled by default because there is not much value in using Typescript without these few flags.
Otherwise, our types will be too permissive, and it is what we are trying to avoid as much as possible with Typescript.

```json
{
  "forceConsistentCasingInFileNames": true,
  "noImplicitReturns": true,
  "strict": true,
  "noUnusedLocals": true,
}
```

The most important one here is the `strict` flag which actually covers four other flags.
We could add independently to progressively introduce Typescript in an existing codebase and slowly get stricter over time: `noImplicitAny`, `noImplicitThis`, `alwaysStrict` and `strictNullChecks`.

## Avoid any. Type everything

Always declare variables or constants with a type other than any.
When declaring variables or constants in Typescript without a typing, the typing of the variable/constant will be deduced by the value that gets assigned to it.
This will cause unintended problems.
Another advantage of having good typings in our application is that it makes refactoring easier and safer.
The any type isn't necessarily a bad thing and, in fact, does still come in useful sometimes.
However, in most cases, there is a better alternative that leads to having better defined types overall.
In new projects, it is worth setting `strict:true` in the `tsconfig.json` file to enable all strict type checking options.

## Strings should be safe

If we have a variable of type string that can have only a set of values, instead of declaring it as a string type, we can declare the list of possible values as the type.

```typescript
type MyStringType = 'First' | 'Second';
```

By declaring the type of the variable appropriately, we can avoid bugs while writing the code during compile time rather than during runtime.

## Call things by their name

This is a no-brainer, but it is scary how often you will come across variables like `x1`, `fe2` or `xbqne` in JavaScript, or, on the other end of the spectrum, long variable names like `incrementorForMainLoopFromTenToTwenty` or `createNewMemberIfAgeOverTwentyOneAndMoonIsFull`.
None of these make much sense.
Good variable and function names should be easy to understand and tell us what is going on.
Not more and not less.
One trap to avoid is marrying values and functionality in names.
A function called `isLegalDrinkingAge()` makes more sense than `isOverEighteen()` as the legal drinking age varies from country to country, and there are other things than drinking to consider that are limited by age.
Keeping to English is a good idea, too, because, programming languages are in English.

## Use utility types

TypeScript already has a few utility types built-in, such as `Partial<T>`, which makes all properties of `T` optional, or `Readonly<T>`, which makes `T` read-only.
They will help make our code much easier to understand.
As a side note, only try to break interfaces or types into smaller nested interfaces/types if it makes sense from our code's domain point-of-view.
Once they are aggressively split up, it's hard to see the structure, especially when using code completion.

## Use const and let

JavaScript first searches to see if a variable exists locally, then searches progressively in higher levels of scope until global variables.
`var` is function scope, but, `let` and `const` are block scope. Using `let` and `const` where appropriate makes the intention of the declarations clearer.
It will also help in identifying issues when a value is reassigned to a constant accidentally by throwing a compile time error.
Do use a linter that automates checking and fixing this so that changing let to const doesn't become a delay in code review.

## Use === instead of ==

JavaScript utilizes two different kinds of equality operators: `=== | !==` and `== | !=`.
It is considered best practice to always use the former set when comparing.
If two operands are of the same type and value, then `===` produces `true` and `!==` produces `false`.
However, when working with `==` and `!=`, we'll run into issues when working with different types.
In these cases, they'll try to coerce the values, unsuccessfully.

## Use shortcut notation sparingly

Shortcut notation is a tricky subject.
On the one hand it keeps our code small but on the other we might make it hard for other developers.
Well, here's a small list of what can (and should) be done:

- Use `{}` instead of `new Object()`
- Use `""` instead of `new String()`
- Use `0` instead of `new Number()`
- Use `false` instead of `new Boolean()`
- Use `[]` instead of `new Array()`
- Use `/()/` instead of `new RegExp()`
- Use function `(){}` instead of `new Function()`

## Avoid globals

Global variables and function names are an incredibly bad idea.
The reason is that every JavaScript file included in the page runs in the same scope.
If we have global variables or functions in our code, scripts included after ours that contain the same variable and function names will overwrite our variables/functions.

## Avoid mixing with other technologies

Although it is possible to create everything we need in a document using JavaScript and DOM, it is not necessarily the most effective way of doing so.
Techniques such as [CSS-in-JS](https://en.wikipedia.org/wiki/CSS-in-JS) are very popular.
However, mixing different technologies in the same file, JavaScript, HTML and CSS, it can be dangerous.
A good separation of concerns is always the best practice.

## Avoid heavy nesting

Nesting code explains its logic and makes it much easier to read.
However nesting it too far can also make it hard to follow what we are trying to do.
Readers of our code shouldn't have to scroll horizontally or suffer confusion when their code editors wrap long lines.
The other problem of nesting is variable names and loops.
As we normally start our first loop with as the iterator variable, we'll go on with `j`, `k`, `l` and so on.
This can become messy quite quickly.

## Avoid long functions

Long functions generally indicate that they are doing too many things.
Small functions are better to read and faster to understand the purpose.
If our function has more than 10 lines we need to ask yourself if it would be better to break it into smaller functions.
The best functions or methods are from 5 to 10 lines of code.
The method itself might be doing one thing, but inside it, there are a few other operations that could be happening.
We can extract those methods into their own method and make them do one thing each and use them instead.

## Reduce function parameters

Limiting the amount of function parameters is incredibly important because it makes testing our function easier.
Having more than three leads to a combinatorial explosion of test scenarios.
One or two arguments is the ideal case, and three should be avoided if possible.
Anything more than that should be consolidated.
Usually, if we have more than two arguments then our function is trying to do too much.
In cases where it's not, most of the time a higher-level object will suffice as an argument.

## Do not use flags as function parameters

Flags tell our user that this function does more than one thing.
Functions should do one thing.
Split out our functions if they are following different code paths based on a Boolean.
When functions do more than one thing, they are harder to compose, test, and reason about.
When we can isolate a function to just one action, it can be refactored easily, and our code will read much cleaner.

## Comment as much as needed but not more

Comments are our messages to other developers.
However, if we are adding a comment, it's because it's not self-explanatory and we should choose a better way to implement it.
Good comments are informative comments, when be useful to provide basic information.
Bad Comments are commented-out code is a common practice, but we shouldn't do it, because other developers will think the code is there for a reason and won't have the courage to delete it.
Just delete the code.
Another case is noise comments.
Some comments that we see are just noise.
Redundant comments are comments that are not more informative than the code.
These comments only clutter the code.

## Use the fastest way to loop arrays

There are many ways to loop through array.
The first way is a `for` loop.
Other ways include the `for...of` loop, the `forEach` method for arrays, `map`, `filter`, and others.
There is also the `while` loop.
The `for` loop is the fastest way.
Caching the `length` makes the loop performs better.
Some browser engines have optimized the `for` loop without manually caching the `length` property.
The `forEach` is slower than the `for` loop, so it's probably better to avoid it, especially for large arrays.
However, unless we are desperate for performance at the code level (which is rare), make it readable.
For example, we can use the `for` loop in server-side applications and the array methods in client-side applications, because, in general, we don't have expensive operations on the client-side.

## Prefer array methods

It is recommended to use a functional approach without intermediate variables.
The base JavaScript `for` loop can be more performant in some browsers but the benefit can be measured only by iterating over millions of items.
It is job of compiler and runtime to remove penalty of using new array methods.
We should ignore critics and switch to new syntax because it is shorter and more readable.
Another thing, we will use functional programing instead of imperative programing.
The functional programming paradigm was explicitly created to support a pure functional approach to problem solving.

## Do not trust any data

One of the main points to bear in mind when talking about code and data security is not to trust any data.
Make sure that all the data that goes into our systems is clean and exactly what we need.
This is most important on the back end when writing out parameters retrieved from the URL.
The same applies to forms that validate only on the client side.
Another very insecure practice is to read information from the DOM and use it without validation.

## Do not use short-hand

Technically, we can get away with omitting most curly braces and semi-colons.
Most browsers will correctly interpret the following:

```typescript
if(someVariableExists)
   x = false
```

However, this approach is dangerous and not recommended.
This is a terrible practice that should be avoided at all costs.
The only time that curly braces should be omitted is with one-liners, and even this is a highly debated topic.

## Use parameter defaults

When we call a function and forget to pass a parameter to it, then the missing argument is set to undefined.
ES6 introduced default parameters for the function.
We can do this:

```typescript
function logNumber(num = 25): void {}
```

It is a good habit to assign default values to arguments.

## Use spread and destructuring

The [spread syntax](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/Spread_syntax) allows us to expand something that is currently grouped inside a particular container and assign it to a different container.
Compatible containers include: arrays, strings, objects and any iterable (such as Maps, Sets, TypedArrays, etc) and their elements can be expanded into function arguments, array elements and key-value pairs.
Another interesting new feature from JavaScript is [destructuring](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment).
This syntax allows us to unpack values from objects and arrays into individual properties.

## Use template literals

Template literals make working with strings so much easier than before.
No more long string concatenation.
To create a template literal, instead of single quotes (') or double quotes (") quotes we use the backtick (`) character.
This will produce a new string, and we can use it in any way we want.

## End the switches with defaults

Don't leave the switch statements without a default case because something can go wrong, and we want to make sure it is detected.
However, in some cases, it is unnecessary.
To avoid duplicate conditions, we can combine the default statement with another switch statement:

```typescript
function getEmoji(key: string): string {
  switch (key) {
    case 'dog':
      return '🐶';
    case 'cat':
      return '😺';
    // the rest of the emojis...
    default: case 'smile':
      return '🙂';
  }
}
```

## Use the prefix "is" and "has" for Booleans

Using variables with prefixes `is` and `has` will communicate clearly that the variable is a Boolean.
The code is read more often than it is written.
Correctly used variable names do not need comments and explanations that can get out of sync with the code rather quickly.
The code is written and should be readable for humans.

## Declarations on top

It is a good coding practice to put all declarations at the top of each script or function.
This will give cleaner code, provide a single place to look for local variables, make it easier to avoid unwanted (implied) global variables and reduce the possibility of unwanted re-declarations.

## Initialize variables

It is a good coding practice to initialize variables when we declare them.
This will give cleaner code, provide a single place to initialize variables and avoid undefined values.
Variables should be declared and initialized at the beginning.

## Use iterators and generators

Use [iterators and generators](https://developer.mozilla.org/docs/Web/JavaScript/Guide/Iterators_and_Generators) when working with collections of data used like a stream.
There are some good reasons such as decouples the call from the generator implementation, lazy execution because the items are streamed on demand, built-in support for iterating items using the `for-of` syntax and iterables allow to implement optimized iterator patterns.

## Prefer pure functions

A [pure function](https://www.freecodecamp.org/news/what-is-a-pure-function-in-javascript-acb887375dfe/) is a function where the return value is only determined by its input values, without observable side effects.
They're easier to reason about, easier to combine, easier to test, easier to debug, easier to parallelize.
Other benefits of writing pure functions for functional programming, for instance, they are idempotent, offer referential transparency, are memoizable and can be lazy.

## Prefer immutability

The immutability in JavaScript allows us to differentiate objects and track changes in our objects.
It may sound petty and insignificant, but it turns out to be crucial, especially in front-end applications.
In frameworks such as [Angular](https://angular.io/) and [React](https://reactjs.org/), we'll actually get a performance boost by using immutable data structures.
We gain predictability, change tracking, easiness of implementing reactive interface, change history and others such as testability and a single source of truth.

## Avoid side effects

A function produces a side effect if it does anything other than take a value in and return another value or values.
A side effect could be writing to a file or modifying some global variable.
We do need to have side effects in a program on occasion.
What we want to do is to centralize where we are doing this.
The main point is to avoid common pitfalls like sharing state between objects without any structure, using mutable data types and not centralizing where our side effects occur.

## Avoid magic numbers

Magic numbers are values that appear in source code without any explanation of what they mean.
This makes the code difficult to understand and maintain.
Magic numbers should be avoided as they often lack documentation.
Forcing them to be stored in variables gives them implicit documentation.
With [no-magic-numbers](https://palantir.github.io/tslint/rules/no-magic-numbers/) lint rule, we make code more readable and refactoring easier by ensuring that special numbers are declared as constants to make their meaning explicit.

## Avoid conditionals

This seems like an impossible task.
Upon first hearing this, most people say, "how am I supposed to do anything without an if statement?".
The answer is that we can use polymorphism to achieve the same task in many cases.
The second question is usually, "well that's great but why would I want to do that?".
The answer is the clean code concept, that is, a function should only do one thing.
When we have classes and functions that have if statements, we are telling our user that our function does more than one thing.

## Handle JavaScript errors

Thrown errors are a good thing.
They mean the runtime has successfully identified when something in our program has gone wrong and it's letting us know by stopping function execution on the current stack, killing the process (in Node), and notifying us in the console with a stack trace.
JavaScript as well as TypeScript allow us to throw any object.
A Promise can also be rejected with any reason object.
It is advisable to use the throw syntax with an Error type.
This is because our error might be caught in higher level code with a `catch` syntax.

## Prefer promises over callbacks

Promises are easy to use and anything with a callback can be “promisified”.
Callbacks are synchronous and with promises and `async…await`, we get to do things asynchronous which help speed up the code, especially because JavaScript is single-threaded.

## Do not use weird JavaScript features

Things like updating array length property, using the `with` keyword, `void` keyword, updating native Object prototypes like Date, Array, Object, etc.
Others like `eval()` function or passing a string to `setTimeout` and `setInterval`.
Just because the language allows us to, does not mean we should.

## Keep DOM access to a minimum

Accessing the DOM in browsers is an expensive thing to do.
The DOM is a very complex API and rendering in browsers can take up a lot of time.
To make sure that our code is fast and doesn't slow down the browser to a halt try to keep DOM access to a bare minimum.
Instead of constantly creating and applying elements, have a tool function that turns a string into DOM elements and call this function at the end of our generation process to disturb the browser rendering once rather than continually.

## Allow configuration and translation

One of the most successful tips to keep our code maintainable and clean is to create a configuration object that contains all the things that are likely to change over time.
If we have this as a part of a module pattern and make it public, we even allow implementers to only override what they need before initializing the module.
It is of utmost importance to keep code maintenance simple, avoiding the need for future maintainers having to read all our code and find where they need to change things.

## Progressive Enhancement

We should do is write code that works regardless of available technology.
In the case of JavaScript, this means that when scripting is not available (say on an old browser, or because of an over-zealous security policy) our web products should still allow users to reach a certain goal, not block them because of the lack of JavaScript which they can't turn on, or don't want to.
For example, imagine links to navigate to other pages after the click action.
The problem starts when the navigation is done by JavaScript.
When JavaScript is disabled, users cannot navigate.
Using the correct HTML construction (Hyperlinks), we were able to get rid of JavaScript.

## Raw JavaScript is faster

JavaScript libraries, such as [jQuery](https://jquery.com/), can save us an enormous amount of time when coding, especially with AJAX operations.
Having said that, always keep in mind that a library can never be as fast as raw JavaScript.
jQuery's `each` method is great for looping, but using a native `for` loop will always be an ounce quicker.

## Organize and remove unused imports

With clean and easy to read import statements we can quickly see the dependencies of current code.
With [no-unused-variable](https://palantir.github.io/tslint/rules/no-unused-variable) lint rule are automatically remove unused imports, variables, functions, and private class members, when using TSLint's --fix option.
[ordered-imports](https://palantir.github.io/tslint/rules/ordered-imports) lint rule requires that import statements be alphabetized and grouped.

## Modularization

This is a general programming best practice.
Making sure that we create functions that fulfill one job at a time makes it easy for other developers to debug and change the code without having to scan through all the code to work out what code block performs what function.
This also applies to creating helper functions for common tasks.
If we are doing the same thing in several different functions then it is a good idea to create a more generic helper function.

## Lazy-Loading

Lazy, or "on demand", loading is a great way to optimize our site or application.
[Lazy loading](https://angular.io/guide/lazy-loading-ngmodules) helps keep initial bundle sizes smaller, which in turn helps decrease load times.
This practice essentially involves splitting our code at logical breakpoints, and then loading it once the user has done something that requires, or will require, a new block of code.
This speed up the initial load of the application and lightens its overall weight as some blocks may never even be loaded.



## Use Web Workers

Use web workers when we need to execute code that needs a lot of execution time.
Web Workers help us to run scripts in background threads.
The worker thread can perform tasks without interfering with the user interface.
They can perform processor-intensive calculations without blocking the user interface thread.

# Code Parsing and AST Hanlding

## Should only ever parse once.

Once you have an AST from parsing, always resuse it instead reparsing a subset of the original raw input.

## Avoid `walk`ing the more than one

Once you are walking an AST you should avoid active avoid `walk`ing additional subtrees as this is duplicated work as the `walk` will eventually make it to that subtree.  Once there, any logic that was being implemented can be executed now.

## Consider the `enter` phase of a `walk` as information gathering only

When walking an AST, the enter phase should be used to gather all the information needed to make changes but should not implement any changes itself.  That should be part of the exit phase/

## Consider the `exit` phase the wokring phase.

The `exit` phase of the walk is where we take all the information gathered during the `enter` phase and make the appropriate changes, segment extractions, etc. 