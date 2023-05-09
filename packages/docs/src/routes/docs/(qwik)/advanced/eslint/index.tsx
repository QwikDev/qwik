import { component$, useStyles$ } from '@builder.io/qwik';
import { CodeBlock } from '../../../../../components/code-block/code-block';
import { rules, configs } from './rules.json';
import styles from './styles.css?inline';

const rulesMap = Object.keys(rules).map((rule) => {
  return {
    name: rule,
    description: rules[rule].meta.docs.description,
    recommended: configs.recommended.rules[`qwik/${rule}`] || false,
    strict: configs.strict.rules[`qwik/${rule}`] || false,
    messages: rules[rule].meta.messages,
    examples: rules[rule].meta.examples,
  };
});

export default component$(() => {
  useStyles$(styles);
  return (
    <>
      <h1>ESLint-Rules</h1>
      Qwik comes with an own set of ESLint rules to help developers write better code.
      <div class="bg-slate-50 rounded-md border border-slate-200 mt-4 grid grid-cols-4 text-sm panel">
        <div class="list-none border-r border-slate-200 my-6 px-6 panel-border">
          <span class="opacity-50 block mb-2">✅</span>
          <b>Warn</b> in 'recommended' ruleset
        </div>
        <div class="list-none border-r border-slate-200 my-6 px-6 panel-border">
          <span class="block mb-2">✅</span>
          <b>Error</b> in 'recommended' ruleset
        </div>
        <div class="list-none border-r border-slate-200 my-6 px-6 panel-border">
          <span class="opacity-50 block mb-2">🔔</span>
          <b>Warn</b> in 'strict' ruleset
        </div>
        <div class="list-none my-6 px-6">
          <span class="block mb-2">🔔</span>
          <b>Error</b> in 'strict' ruleset
        </div>
      </div>
      <h2>Possible Problems</h2>
      These rules are available.
      <div class="my-6">
        {rulesMap.map((rule) => (
          <a
            class="bg-slate-50 rounded-md p-4 mt-4 flex cursor-pointer panel"
            href={`#${rule.name}`}
          >
            <div class="flex-1">
              <code>{rule.name}</code>
              <span class="text-xs block mt-2 max-w-[90%] leading-5">{rule.description}</span>
            </div>
            <div class="flex gap-2 items-center">
              <span
                class={{
                  'opacity-100': rule.recommended === false,
                  'opacity-50': rule.recommended === 'warn',
                }}
              >
                ✅
              </span>
              <span
                class={{
                  'opacity-100': rule.strict === false,
                  'opacity-50': rule.strict === 'warn',
                }}
              >
                🔔
              </span>
            </div>
          </a>
        ))}
      </div>
      <h2>Details</h2>
      <div class="my-6">
        {rulesMap.map((rule) => (
          <div>
            <h3 id={rule.name}>{rule.name}</h3>
            <span>{rule.description}</span>
            {Object.keys(rule.messages).map((messageKey) => (
              <>
                <h4>{messageKey}</h4>
                {rule?.examples?.[messageKey]?.good?.map((example) => (
                  <pre>{example.code}</pre>
                ))}
              </>
            ))}
          </div>
        ))}
      </div>
    </>
  );
});
