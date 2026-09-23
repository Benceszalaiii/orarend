import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import {
  hasSeenA2HS,
  isAppInstalled,
  isIphoneSafari,
  markA2HSSeen,
  shouldOfferAndroidA2HS,
  shouldOfferIosA2HS,
} from "./a2hs";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

afterEach(uninstallBrowser);

describe("isAppInstalled", () => {
  test("böngészőlapban nem", () => {
    installBrowser();
    expect(isAppInstalled()).toBe(false);
  });

  test("az iOS `navigator.standalone` jelzése elég", () => {
    const b = installBrowser();
    b.navigator.standalone = true;
    expect(isAppInstalled()).toBe(true);
  });

  test("mindhárom nem-böngésző display-mode telepítettnek számít", () => {
    for (const mode of ["standalone", "fullscreen", "minimal-ui"]) {
      installBrowser({ media: { [`(display-mode: ${mode})`]: true } });
      expect(isAppInstalled()).toBe(true);
    }
  });

  test("dobó matchMedia: nem telepített", () => {
    const b = installBrowser();
    b.window.matchMedia = () => {
      throw new Error("nope");
    };
    expect(isAppInstalled()).toBe(false);
  });
});

describe("isIphoneSafari", () => {
  test.each([
    [IPHONE_SAFARI, true],
    [IPHONE_CHROME, false],
    [IPHONE_INSTAGRAM, false],
    [IPAD_SAFARI, false],
    [ANDROID_CHROME, false],
  ])("%#", (ua, expected) => {
    installBrowser({ userAgent: ua });
    expect(isIphoneSafari()).toBe(expected);
  });
});

describe("a jelölő", () => {
  test("friss eszközön nem láttuk, jelölés után igen", () => {
    installBrowser();
    expect(hasSeenA2HS()).toBe(false);
    markA2HSSeen();
    expect(hasSeenA2HS()).toBe(true);
  });

  test("privát módban (dobó tárhely) inkább hallgatunk", () => {
    const b = installBrowser();
    b.localStorage.broken = true;
    expect(hasSeenA2HS()).toBe(true);
    expect(() => markA2HSSeen()).not.toThrow();
  });
});

describe("shouldOfferIosA2HS", () => {
  test("iPhone Safari, nem telepített, még nem szóltunk: igen", () => {
    installBrowser({ userAgent: IPHONE_SAFARI });
    expect(shouldOfferIosA2HS()).toBe(true);
  });

  test("egyszeri: a jelölés után nem", () => {
    installBrowser({ userAgent: IPHONE_SAFARI });
    markA2HSSeen();
    expect(shouldOfferIosA2HS()).toBe(false);
  });

  test("telepítve soha", () => {
    const b = installBrowser({ userAgent: IPHONE_SAFARI });
    b.navigator.standalone = true;
    expect(shouldOfferIosA2HS()).toBe(false);
  });

  test("más böngészőben soha", () => {
    installBrowser({ userAgent: IPHONE_CHROME });
    expect(shouldOfferIosA2HS()).toBe(false);
  });
});

describe("shouldOfferAndroidA2HS", () => {
  test("nincs böngésző-felismerés: bármely UA-n igen", () => {
    installBrowser({ userAgent: ANDROID_CHROME });
    expect(shouldOfferAndroidA2HS()).toBe(true);
  });

  test("telepítve vagy már látva: nem", () => {
    installBrowser({ media: { "(display-mode: standalone)": true } });
    expect(shouldOfferAndroidA2HS()).toBe(false);
    installBrowser();
    markA2HSSeen();
    expect(shouldOfferAndroidA2HS()).toBe(false);
  });
});
