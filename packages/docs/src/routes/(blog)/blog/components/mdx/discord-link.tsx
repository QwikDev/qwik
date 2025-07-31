import { component$ } from '@qwik.dev/core';

type Props = { text?: string };

export const DiscordLink = component$<Props>(({ text = 'Discord server' }) => (
  <a href="https://discord.gg/7QZ85hCkSM" rel="noopener noreferrer" target="_blank">
    {text}
  </a>
));
