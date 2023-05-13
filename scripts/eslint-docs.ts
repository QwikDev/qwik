import * as fs from 'fs';
import { resolve } from 'path';
import { format } from 'prettier';
import {
  rules,
  configs,
  examples,
  type QwikEslintExample,
  type QwikEslintExamples,
} from '../packages/eslint-plugin-qwik/index';

const outputPathMdx = resolve(
  process.cwd(),
  'packages/docs/src/routes/docs/(qwik)/advanced/eslint/index.mdx'
);

function escapeHtml(htmlStr: string) {
  return htmlStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const rulesMap = Object.keys(rules).map((ruleName) => {
  const rule = ruleName as keyof typeof rules;
  return {
    name: rule,
    description: escapeHtml(rules[rule]?.meta?.docs?.description || ''),
    recommended: configs?.recommended?.rules[`qwik/${rule}`] || false,
    strict: configs.strict.rules[`qwik/${rule}`] || false,
    messages: rules[rule]?.meta?.messages || '',
    examples: examples[rule],
  };
});

const mdx = [];

mdx.push(`
[//]: <> (--------------------------------------)
[//]: <> (......THIS FILE IS AUTOGENERATED......)
[//]: <> (--------------------------------------)
[//]: <> ( to update run: pnpm eslint.update    )
[//]: <> ( after changing the rule metadata on  )
[//]: <> ( packages/eslint-plugin-qwik/index.ts )
[//]: <> (--------------------------------------)
`);

mdx.push(`import './styles.css';\n\n`);

mdx.push('<div>');

mdx.push('<h1 id="smth">ESLint-Rules</h1>');
mdx.push('<p>Qwik comes with an own set of ESLint rules to help developers write better code.</p>');

mdx.push(`
<div class="ruleset-legend panel">
  <div class="panel-border">
    <span class="icon icon-inactive">✅</span>
    <b>Warn</b> in 'recommended' ruleset
  </div>
  <div class="panel-border">
    <span class="icon">✅</span>
    <b>Error</b> in 'recommended' ruleset
  </div>
  <div class="panel-border">
    <span class="icon icon-inactive">🔔</span>
    <b>Warn</b> in 'strict' ruleset
  </div>
  <div class="list-none my-6 px-6">
    <span class="icon">🔔</span>
    <b>Error</b> in 'strict' ruleset
  </div>
</div>
`);

mdx.push(`<h2>Possible Problems</h2>`);
mdx.push(`<p>These rules are available.</p>`);

mdx.push(`<div class="my-6">`);
rulesMap.forEach((rule) => {
  mdx.push(`  
    <a href="#${rule.name}" class="p-4 flex panel">
      <div class="flex-1">
        <code>${rule.name}</code>
        <span class="rule-description">${rule.description}</span>
      </div>
      <div class="flex gap-2 items-center">
        <span
          class={{
            'opacity-100': ${rule.recommended === false},
            'opacity-50': ${rule.recommended === 'warn'},
          }}     
        >
          ✅
        </span>
        <span
          class={{
            'opacity-100': ${rule.strict === false},
            'opacity-50': ${rule.strict === 'warn'},
          }}
        >
          🔔
        </span>
      </div>
    </a>
  `);
});
mdx.push(`</div>`);

mdx.push(`<h2>Details</h2>`);
mdx.push(`<div class="my-6">`);
rulesMap.forEach((rule) => {
  mdx.push(`
    <div class="rule-wrapper">
      <h3 id="${rule.name}">${rule.name}</h3>
      <span>${rule.description}</span>
  `);
  Object.keys(rule.messages).map((messageKey) => {
    mdx.push(`
      <h4>${messageKey}</h4>
    `);

    const goodExamples: QwikEslintExample[] = rule?.examples?.[messageKey]?.good || [];
    const badExamples: QwikEslintExample[] = rule?.examples?.[messageKey]?.bad || [];

    if (goodExamples) {
      mdx.push('<p>Examples of <b>correct</b> code for this rule:</p>');
      goodExamples.map((example) => {
        mdx.push('<div class="code-wrapper">');
        mdx.push('<span class="badge good">✓</span>');
        mdx.push('```tsx ' + example.codeHighlight);
        mdx.push(example.code);
        mdx.push('```');
        mdx.push('</div>');
      });
    }

    if (badExamples) {
      mdx.push('<p>Examples of <b>incorrect</b> code for this rule:</p>');
      badExamples.map((example) => {
        mdx.push('<div class="code-wrapper">');
        mdx.push('<span class="badge bad">✕</span>');
        mdx.push('```tsx ' + example.codeHighlight);
        mdx.push(example.code);
        mdx.push('```');
        mdx.push('</div>');
      });
    }
  });
  mdx.push(`
    </div>
  `);
});
mdx.push(`</div>`);

mdx.push(`</div>`);

fs.writeFileSync(outputPathMdx, format(mdx.join('\n'), { parser: 'markdown' }));
