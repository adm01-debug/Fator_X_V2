import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Global per-test hygiene (QA fix — system-testing-qa):
//  - cleanup(): unmount every rendered tree so repeated render() calls don't
//    accumulate in document.body (slow queries) or keep effects/timers alive.
//  - useRealTimers(): if a test enables fake timers and then fails before
//    restoring them, the fake clock leaks into later tests and any waitFor()
//    hangs until it times out — cascading one failure into many. Restoring
//    real timers here guarantees isolation regardless of test outcome.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom does not implement scrollIntoView; some Radix/cmdk components call it.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
