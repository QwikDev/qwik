import { component$ } from '@builder.io/qwik';
import { Form } from '@builder.io/qwik-city';
import { useCommonRouteAction, useCommonRouteLoader } from './shared/loaders';

// As mentioned, here we are re-exporting them
export { useCommonRouteAction, useCommonRouteLoader } from './shared/loaders';

export default component$(() => {
  const commonRouteAction = useCommonRouteAction();
  const commonRouteLoader = useCommonRouteLoader();

  return (
    <div class="flex justify-around text-xl">
      <Form action={commonRouteAction}>
        <div class="mb-2">CommonRouteAction</div>
        <div class="mb-4">response:</div>
        <div class="text-lg font-bold mb-4">
          {commonRouteAction.value?.data.join(' ') || ''}
        </div>
        <button type="submit">Submit</button>
      </Form>
      <div>
        <div class="mb-2">CommonRouteLoader</div>
        <div class="mb-4">response:</div>
        <div class="text-lg font-bold mb-4">
          {commonRouteLoader.value.join(' ')}
        </div>
      </div>
    </div>
  );
});
