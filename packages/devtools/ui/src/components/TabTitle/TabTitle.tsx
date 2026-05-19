import { component$ } from '@qwik.dev/core';

interface TabTitleProps {
  title: string;
}

export const TabTitle = component$(({ title }: TabTitleProps) => {
  return (
    <h3 class="from-foreground to-muted-foreground bg-gradient-to-br bg-clip-text text-2xl font-bold tracking-tight text-transparent">
      {title}
    </h3>
  );
});
