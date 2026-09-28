import { component$ } from '@qwik.dev/core';
import { useHttpStatus } from '@qwik.dev/router';

export default component$(() => {
  const httpStatus = useHttpStatus();
  return (
    <p id="members-error">
      {httpStatus.status} {httpStatus.message}
    </p>
  );
});
