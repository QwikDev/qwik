import { component$, Slot, useStylesScoped$ } from '@builder.io/qwik';

export interface StoryExampleProps {
  color: 'red' | 'green' | 'blue';
}

export const StoryExample = component$((props: StoryExampleProps) => {
  useStylesScoped$(`
    div {
      align-items: center;
      border-radius: 50%;
      display: flex;
      height: 200px;
      justify-content: center;
      width: 200px;
    }
  `);

  return (
    <div style={`background-color: ${props.color}`}>
      <span>
        <Slot />
      </span>
    </div>
  );
});
