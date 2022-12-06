import { Meta } from '@storybook/html';
import { StoryExample, StoryExampleProps } from './story-example';

export default {
  title: 'Story Example',
  args: {
    label: 'Example label',
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
} as Meta;

type Options = StoryExampleProps & { label: string };

const Template = ({ label, color }: Options) => <StoryExample color={color}>{label}</StoryExample>;

export const Default = Template.bind({});
