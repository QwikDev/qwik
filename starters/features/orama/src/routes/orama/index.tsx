import { $, component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { search } from "@orama/orama";
import { type Pokemon, oramaDb, createOramaDb } from "~/orama";

createOramaDb();

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
			right: 0.6rem;
			padding: 0.7rem 0.5rem 0.4rem 0.5rem;
			outline: none;
		}

		.list {
			display: flex;
			flex-wrap: wrap;
			justify-content: space-around;
		}

		.card {
			width: 300px;
			border-radius: .5rem;
			border: 1px black solid;
			background-color: white;
			color: black;
		}
	`);
  const termSignal = useSignal("");
  const pokedexSig = useSignal<Pokemon[]>([]);

  const onSearch = $(async (term: string) => {
    const response = await execSearch(term);
    pokedexSig.value = (response.hits || []).map(
      (hit) => hit.document as unknown as Pokemon,
    );
  });

  return (
    <div>
      <div style="margin: 1rem;">
        <div style="position: relative;">
          <input
            class="search"
            placeholder="e.g. search for plant, water, hot."
            bind:value={termSignal}
            onKeyDown$={(e) => {
              if (e.key === "Enter") {
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
        {pokedexSig.value.map(({ name, description, image }) => (
          <div key={name} class="card">
            <div style="padding: 1.25rem; text-align:center;">
              <img width={200} height={200} src={image} alt={name} />
              <div style="font-weight: 700; font-size: 1.5rem;">{name}</div>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export const execSearch = server$(async (term: string) => {
  const response = await search(oramaDb, {
    term,
    properties: "*",
    boost: { name: 1.5 },
  });
  return response;
});
