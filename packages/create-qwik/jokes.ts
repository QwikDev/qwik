import jokes from './jokes.json';

export function getRandomJoke() {
  const index = Math.floor(Math.random() * jokes.length);
  return jokes[index]!;
}
