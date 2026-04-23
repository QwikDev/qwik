import { component$ } from '@qwik.dev/core';

type PlaygroundGlyphName = 'spark' | 'route' | 'stack' | 'pulse' | 'notes' | 'arrow-up-right';

interface PlaygroundGlyphProps {
  name: PlaygroundGlyphName;
  class?: string;
}

export const PlaygroundGlyph = component$<PlaygroundGlyphProps>(({ name, class: className }) => {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.7,
  };

  return (
    <svg aria-hidden="true" class={className} viewBox="0 0 24 24" role="presentation">
      {name === 'spark' && (
        <>
          <path {...shared} d="M12 3.5 14.2 9l5.3 2.2-5.3 2.2L12 19l-2.2-5.6-5.3-2.2L9.8 9Z" />
          <path {...shared} d="M18.5 3.5v3M20 5h-3" />
        </>
      )}
      {name === 'route' && (
        <>
          <circle {...shared} cx="6" cy="7" r="2.5" />
          <circle {...shared} cx="18" cy="17" r="2.5" />
          <path {...shared} d="M8.5 7h3.5c2 0 3.5 1.5 3.5 3.5v0c0 2 1.5 3.5 3.5 3.5H21" />
          <path {...shared} d="M14.5 7H18" />
        </>
      )}
      {name === 'stack' && (
        <>
          <path {...shared} d="M12 4 4.5 8 12 12 19.5 8 12 4Z" />
          <path {...shared} d="M4.5 12 12 16l7.5-4" />
          <path {...shared} d="M4.5 16 12 20l7.5-4" />
        </>
      )}
      {name === 'pulse' && (
        <>
          <path {...shared} d="M3.5 12h4l2.2-4.3 4.1 8.6 2.3-4.3h4.4" />
          <path {...shared} d="M6 5.5a7.7 7.7 0 0 1 12 0" />
          <path {...shared} d="M18 18.5a7.7 7.7 0 0 1-12 0" />
        </>
      )}
      {name === 'notes' && (
        <>
          <rect {...shared} x="5" y="4.5" width="14" height="15" rx="2.5" />
          <path {...shared} d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
        </>
      )}
      {name === 'arrow-up-right' && (
        <>
          <path {...shared} d="M7 17 17 7" />
          <path {...shared} d="M9 7h8v8" />
        </>
      )}
    </svg>
  );
});
