import { getRandomJoke } from '../../../../create-qwik/src/helpers/jokes';
import { note } from '../utils/utils';
import pc from 'picocolors';

export async function runJokeCommand() {
  const [setup, punchline] = getRandomJoke();
  note(pc.magenta(`${setup!.trim()}\n${punchline!.trim()}`), '🙈');
}
