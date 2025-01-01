import { component$, useComputed$, useSignal } from '@builder.io/qwik';
// import { qwikGPT, rateResponse } from './search';
import { CodeBlock } from '../code-block/code-block';
// import { isBrowser } from '@builder.io/qwik';
import snarkdown from 'snarkdown';

const snarkdownEnhanced = (md: string) => {
  const htmls = md
    .split(/(?:\r?\n){2,}/)
    .map((l) =>
      [' ', '\t', '#', '-', '*'].some((ch) => l.startsWith(ch))
        ? snarkdown(l)
        : `<p>${snarkdown(l)}</p>`
    );

  return htmls.join('\n\n');
};

export const QwikGPT = component$((props: { query: string }) => {
  const message = useSignal('');
  // const done = useSignal(false);
  // const id = useSignal<string>();
  // const rated = useSignal(false);

  const process = useComputed$(() => {
    const rawLines = message.value.split('\n');
    const lines: { type: any; [key: string]: any }[] = [];
    let insideCode = false;
    let accumulated = '';
    for (const line of rawLines) {
      const lineParsed = line.trim();
      if (insideCode) {
        if (lineParsed.startsWith('```')) {
          insideCode = false;
          lines.push({
            type: CodeBlock,
            code: accumulated,
            language: 'tsx',
          });
          accumulated = '';
        } else {
          accumulated += line + '\n';
        }
      } else {
        if (lineParsed.startsWith('```')) {
          lines.push({
            type: 'div',
            dangerouslySetInnerHTML: snarkdownEnhanced(accumulated),
          });
          accumulated = '';
          insideCode = true;
        } else {
          accumulated += line + '\n';
        }
      }
    }
    if (insideCode) {
      lines.push({
        type: CodeBlock,
        code: accumulated,
        language: 'tsx',
      });
    } else {
      lines.push({
        type: 'div',
        dangerouslySetInnerHTML: snarkdownEnhanced(accumulated),
      });
    }

    return lines;
  });

  // useTask$(({ track }) => {
  //   const query = track(() => props.query);
  //   if (isBrowser) {
  //     message.value = '';
  //     done.value = false;
  //     rated.value = false;
  //     id.value = undefined;
  //     if (props.query !== '') {
  //       const run = async () => {
  //         done.value = false;
  //         const response = await qwikGPT(query);
  //         for await (const value of response) {
  //           if (typeof value === 'string') {
  //             message.value += value;
  //           } else if (value.type === 'id') {
  //             id.value = value.content;
  //           }
  //         }
  //         done.value = true;
  //       };
  //       run();
  //     }
  //   }
  // });

  if (message.value === '' && props.query !== '') {
    return (
      <div class="indeterminate-progress-bar">
        <div class="indeterminate-progress-bar__progress"></div>
      </div>
    );
  }

  return (
    <>
      <div>
        {process.value.map(({ type: Type, children, ...rest }, index) => {
          return (
            <Type key={index} {...rest}>
              {children}
            </Type>
          );
        })}
      </div>
      {/* {done.value && (
        <div class="ai-rate">
          {rated.value ? (
            <>Thank you very much!</>
          ) : (
            <>
              Help us improve! Rate the answer:
              <button
                class="rate-good"
                onClick$={async () => {
                  rated.value = true;
                  await rateResponse(id.value!, 1);
                }}
              >
                👍
              </button>
              <button
                class="rate-bad"
                onClick$={async () => {
                  rated.value = true;
                  await rateResponse(id.value!, -1);
                }}
              >
                👎
              </button>
            </>
          )}
        </div>
      )} */}
    </>
  );
});
