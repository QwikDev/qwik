export async function onRequest() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const response = new Response(`console.log("service worker loaded")`);

      resolve(response);
    }, 10000);
  });
}
