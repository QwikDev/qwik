import { Meta, StoryObj } from 'storybook-framework-qwik';
import { Button, ButtonProps } from './button';

const meta: Meta<ButtonProps> = {
  component: Button,
};

type Story = StoryObj<ButtonProps>;

export default meta;

export const Primary: Story = {
  args: {
    content: 'Hi there',
    size: 'medium',
  },
  render: ({ content, ...rest }) => <Button {...rest}>{content}</Button>,
};
