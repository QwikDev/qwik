import { component$ } from '@builder.io/qwik';

export const LvlIcon = () => {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M17 6v12c0 .52-.2 1-1 1H4c-.7 0-1-.33-1-1V2c0-.55.42-1 1-1h8l5 5zM14 8h-3.13c-.51 0-.87-.34-.87-.87V4"
        stroke="currentColor"
        fill="none"
        fill-rule="evenodd"
        stroke-linejoin="round"
      />
    </svg>
  );
};

export const SourceIcon = component$((props: { type: string }) => {
  switch (props.type) {
    case 'lvl1':
      return <LvlIcon />;
    case 'content':
      return <ContentIcon />;
    default:
      return <AnchorIcon />;
  }
});

export function AnchorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M13 13h4-4V8H7v5h6v4-4H7V8H3h4V3v5h6V3v5h4-4v5zm-6 0v4-4H3h4z"
        stroke="currentColor"
        fill="none"
        fill-rule="evenodd"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function ContentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M17 5H3h14zm0 5H3h14zm0 5H3h14z"
        stroke="currentColor"
        fill="none"
        fill-rule="evenodd"
        stroke-linejoin="round"
      />
    </svg>
  );
}
