import { Meta, StoryObj } from 'storybook-framework-qwik';
import { StoryExample, StoryExampleProps } from './story-example';

export default {
  title: 'Story Example',
  component: StoryExample,
  args: {
    color: 'red',
  },
  argTypes: {
    color: {
      options: ['red', 'green', 'blue'],
      control: {
        type: 'select',
      },
    },
  },
} as Meta<StoryExampleProps>;

export const Default: StoryObj<StoryExampleProps> = {};
