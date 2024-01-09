import { $, component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';

type AlgoliaResult = {
  hits: {
    type: string;
    anchor?: string;
    content?: string;
    url: string;
  }[];
};

export default component$(() => {
  useStylesScoped$(`
		.search {
			font-size: 100%;
			width: calc(100% - 38px);
			border-radius: 0.5rem;
			border: 1px black solid;
			padding: 1rem;
			color: black;
			outline: none;
		}

		.search-button {
			border: none;
			padding: 6px 0px;
			cursor: pointer;
			background-color: transparent;
			position: absolute;
      right: 2.4rem;
      padding: 0.85rem 0.5rem 0.4rem 0.5rem;
			outline: none;
		}

		.list {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .list li {
      counter-increment: cardCount;
      display: flex;
      color: white;
      margin-top: 1rem;
      margin-bottom: 1rem;
      max-width: 500px;
    }

    .list li::before {
      content: counter(cardCount, decimal-leading-zero);
      background: white;
      color: var(--cardColor);
      font-size: 2em;
      font-weight: 700;
      transform: translateY(calc(-1 * 1rem));
      margin-right: calc(-1 * 1rem);
      z-index: 1;
      display: flex;
      align-items: center;
      padding-inline: 0.5em;
      border: 1px solid black;
    }

    .list li .content {
      background-color: var(--cardColor);
      display: grid;
      padding: 0.5em calc(1em + 1.5rem) 0.5em calc(1em + 1rem);
      grid-template-areas:
        "icon title"
        "icon text";
      gap: 0.25em;
      clip-path: polygon(
        0 0,
        calc(100% - 1.5rem) 0,
        100% 50%,
        calc(100% - 1.5rem) 100%,
        calc(100% - 1.5rem) calc(100% + 1rem),
        0 calc(100% + 1rem)
      );
    }

    .list li .content .title {
      grid-area: title;
      font-size: 1.25em;
    }

    .list li .content .text {
      grid-area: text;
      color: black;
    }    
	`);
  const termSignal = useSignal('');
  const hitsSig = useSignal<AlgoliaResult['hits']>([]);

  const onSearch = $(async (query: string) => {
    const algoliaURL = new URL(
      `/1/indexes/${import.meta.env.VITE_ALGOLIA_INDEX}/query`,
      `https://${import.meta.env.VITE_ALGOLIA_APP_ID}-dsn.algolia.net`
    );
    const response = await fetch(algoliaURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Algolia-Application-Id': import.meta.env.VITE_ALGOLIA_APP_ID!,
        'X-Algolia-API-Key': import.meta.env.VITE_ALGOLIA_SEARCH_KEY!,
      },
      body: JSON.stringify({ query }),
    });
    const algoliaResult: AlgoliaResult = await response.json();
    hitsSig.value = algoliaResult.hits;
  });

  return (
    <div>
      <div style="margin: 1rem;">
        <div style="position: relative;">
          <input
            class="search"
            placeholder="Algolia search: type here and press enter"
            bind:value={termSignal}
            onKeyDown$={(e) => {
              if (e.key === 'Enter') {
                onSearch(termSignal.value);
              }
            }}
          />
          <button
            type="submit"
            class="search-button"
            onClick$={() => onSearch(termSignal.value)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
              />
            </svg>
          </button>
        </div>
      </div>
      <div class="list">
        {hitsSig.value.map(({ anchor, content, url }, key) => (
          <li
            key={key}
            style={`--cardColor:${key % 2 === 0 ? '#19b6f6' : '#ac7ef4'}`}
          >
            <div class="content">
              <div class="title">
                {(anchor || content || url || '').substring(0, 30)}
              </div>
              <a class="text" href={url}>
                Documentation link
              </a>
            </div>
          </li>
        ))}
      </div>
    </div>
  );
});
