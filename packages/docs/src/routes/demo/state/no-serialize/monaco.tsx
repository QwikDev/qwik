export default class Monaco {}
export const monacoEditor = {
  create(element: HTMLElement, { value }: { value: string }): any {
    setTimeout(() => {
      element.textContent = value;
    }, 1000);
    return new Monaco();
  },
};
