import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { scopeStylesheet } from './scoped-stylesheet';

const scopedStyles = suite('scopedStyles');

scopedStyles('element scoping', () => {
  equal(scopeStylesheet('a{x}', 'ABC'), 'a.⭐️ABC{x}');
  equal(scopeStylesheet('aa{x}', 'ABC'), 'aa.⭐️ABC{x}');
  equal(scopeStylesheet('a-2{x}', 'ABC'), 'a-2.⭐️ABC{x}');
  equal(scopeStylesheet('a_a{x}', 'ABC'), 'a_a.⭐️ABC{x}');
  equal(scopeStylesheet('a {x}', 'ABC'), 'a.⭐️ABC {x}');
  equal(scopeStylesheet('body {x}', 'ABC'), 'body.⭐️ABC {x}');
  equal(scopeStylesheet('body {body{x}}', 'ABC'), 'body.⭐️ABC {body{x}}');
});

scopedStyles('ignore string content', () => {
  equal(scopeStylesheet('body{"}bar{"}', 'ABC'), 'body.⭐️ABC{"}bar{"}');
});

scopedStyles('escape', () => {
  equal(scopeStylesheet('q\\:bar{}', 'ABC'), 'q\\:bar.⭐️ABC{}');
});

scopedStyles('class scoping', () => {
  equal(scopeStylesheet('.class {}', 'ABC'), '.class.⭐️ABC {}');
  equal(scopeStylesheet('.a.b.c {}', 'ABC'), '.a.b.c.⭐️ABC {}');
  equal(scopeStylesheet('.div{}', 'ABC'), '.div.⭐️ABC{}');
});

scopedStyles('nested scoping', () => {
  equal(scopeStylesheet('a > .b > c {}', 'ABC'), 'a.⭐️ABC > .b.⭐️ABC > c.⭐️ABC {}');
});

scopedStyles('media', () => {
  equal(
    scopeStylesheet('@media(max-width: 999px){body{}}', 'ABC'),
    '@media(max-width: 999px){body.⭐️ABC{}}'
  );
});

scopedStyles('comments', () => {
  equal(
    scopeStylesheet('@media(max-width: 999px){/*body{}*/}', 'ABC'),
    '@media(max-width: 999px){/*body{}*/}'
  );
});

scopedStyles.run();
