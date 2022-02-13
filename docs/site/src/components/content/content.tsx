import { $, component } from '@builder.io/qwik';
import { getContents } from '../../utils/get-content';

interface ContentProps {
  content: string;
}

export const Content = component(
  'section',
  $(async (props: ContentProps) => {
    const contents = getContents();
    const content = contents.find((c) => c.name === props.content)!;
    const contentModule = await content.module();
    const Markdown = contentModule.default;

    return $(() => <Markdown />);
  })
);
