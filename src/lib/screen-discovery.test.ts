import { describe, expect, test } from "bun:test";
import { discoveryAddresses, thirdOctetCandidates } from "./screen-discovery";

describe("thirdOctetCandidates", () => {
  test("a terem száma az első, utána az utolsó két jegye", () => {
    expect(thirdOctetCandidates("214")).toEqual([214, 14]);
    expect(thirdOctetCandidates("a218")).toEqual([218, 18]);
    expect(thirdOctetCandidates("k2")).toEqual([2]);
  });

  test("oktettbe nem férő szám kimarad, a rövidítése nem", () => {
    expect(thirdOctetCandidates("305")).toEqual([5]);
  });

  test("a mezőbe írt harmadik szám mindent megelőz", () => {
    expect(thirdOctetCandidates("214", "10.0.40.")).toEqual([40, 214, 14]);
    expect(thirdOctetCandidates("214", "http://10.0.214.7:7070/")).toEqual([
      214, 14,
    ]);
    expect(thirdOctetCandidates("214", "192.168.1.")).toEqual([214, 14]);
  });

  test("szám nélküli terem: nincs jelölt", () => {
    expect(thirdOctetCandidates("Tornaterem")).toEqual([]);
  });
});

describe("discoveryAddresses", () => {
  test("1–25. gép, mindkét port, a valószínű teremmel kezdve", () => {
    const addresses = discoveryAddresses([112, 12]);
    expect(addresses).toHaveLength(100);
    expect(addresses[0]).toEqual({ host: "10.0.112.1", port: 7070 });
    expect(addresses[1]).toEqual({ host: "10.0.112.1", port: 8080 });
    expect(addresses[49]).toEqual({ host: "10.0.112.25", port: 8080 });
    expect(addresses[50]).toEqual({ host: "10.0.12.1", port: 7070 });
  });
});
