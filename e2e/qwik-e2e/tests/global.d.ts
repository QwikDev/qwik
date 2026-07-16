declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      hasAttribute(a: string): Promise<R>;
    }
  }
}

export {};
