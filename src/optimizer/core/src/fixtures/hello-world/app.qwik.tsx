import { qComponent, qHook } from '@builder.io/qwik';
import { Header } from './header.qwik';

export const App = qComponent({
  onRender: qHook(() => {
    return <Header />;
  }),
});
