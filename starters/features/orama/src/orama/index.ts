import { type Orama, create, insert } from "@orama/orama";

export type Pokemon = { name: string; description: string; image: string };

const pokedex: Pokemon[] = [
  {
    name: "Bulbasaur",
    description:
      "There is a plant seed on its back right from the day this Pokémon is born. The seed slowly grows larger.",
    image: "https://assets.pokemon.com/assets/cms2/img/pokedex/full/001.png",
  },
  {
    name: "Charmander",
    description:
      "It has a preference for hot things. When it rains, steam is said to spout from the tip of its tail.",
    image: "https://assets.pokemon.com/assets/cms2/img/pokedex/full/004.png",
  },
  {
    name: "Squirtle",
    description:
      "When it retracts its long neck into its shell, it squirts out water with vigorous force.",
    image: "https://assets.pokemon.com/assets/cms2/img/pokedex/full/007.png",
  },
];

export let oramaDb: Orama;

export const createOramaDb = async () => {
  if (oramaDb) {
    return;
  }
  const db = await create({
    schema: {
      name: "string",
      description: "string",
      image: "string",
    },
  });
  oramaDb = db;
  pokedex.map(async (pokemon) => await insert(oramaDb, pokemon));
};
