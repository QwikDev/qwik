import type { EndpointHandler } from "../../../library/types";

export const post: EndpointHandler = async (ev) => {
  const headers = ev.request.headers;
  console.log(headers.toString());
  const formdata = await ev.request.formData();
  if (formdata.get('username') === 'admin' && formdata.get('password') === 'password') {
    return new Response('You Are Logged In!');
  }
  return new Response('Incorrect user name and password', {
    status: 403
  });
}