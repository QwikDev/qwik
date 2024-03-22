import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ html }) => {
  html(
    200,
    `
      <form id="myForm" method="POST">
        <input type="text" name="project" value="Qwik"/>
        <input type="text" name="url" value="http://qwik.dev"/>
      </form>
      <script>myForm.submit()</script>`
  );
};

export const onPost: RequestHandler = async ({ parseBody, json }) => {
  json(200, { body: await parseBody() });
};
