import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// This has to run before qdev.ts loads. `beforeAll` is too late
globalThis.qTest = false; // Forces Qwik to run as if it was in a Browser
globalThis.qRuntimeQrl = true;
globalThis.qDev = true;
globalThis.qInspector = false;

afterEach(async () => {
  const { cleanup } = await import("@noma.to/qwik-testing-library");
  cleanup();
});
