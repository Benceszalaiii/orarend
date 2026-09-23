import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { registerWorker, supportsWorker } from "./sw-register";

afterEach(uninstallBrowser);

describe("sw-register", () => {
  test("service worker nélkül: nem támogatott, null", async () => {
    installBrowser();
    expect(supportsWorker()).toBe(false);
    expect(await registerWorker()).toBeNull();
  });

  test("a gyökérre regisztrál, gyorsítótár nélküli frissítéssel", async () => {
    const b = installBrowser();
    const calls: unknown[][] = [];
    const registration = { scope: "/" };
    b.navigator.serviceWorker = {
      register: async (...args: unknown[]) => {
        calls.push(args);
        return registration;
      },
    };
    expect(supportsWorker()).toBe(true);
    expect(await registerWorker()).toBe(registration as never);
    //* Tesztben nem production a NODE_ENV: a fejlesztői változat megy.
    expect(calls).toEqual([["/sw.js?dev=1", { scope: "/", updateViaCache: "none" }]]);
  });

  test("elbukott regisztráció: null", async () => {
    const b = installBrowser();
    b.navigator.serviceWorker = {
      register: async () => {
        throw new Error("SecurityError");
      },
    };
    expect(await registerWorker()).toBeNull();
  });
});
