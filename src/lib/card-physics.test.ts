import { describe, expect, test } from "bun:test";
import {
  addBody,
  advanceWorld,
  createWorld,
  resizeWorld,
  seededRandom,
  worldSettled,
} from "./card-physics";

describe("seededRandom", () => {
  test("ugyanaz a mag ugyanazt a sorozatot adja, [0, 1) között", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seq = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(seq);
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRandom(43)()).not.toBe(seq[0]);
  });
});

describe("a világ", () => {
  test("a kártya a késleltetésig áll, utána felfelé lökéssel kiszakad", () => {
    const world = createWorld(400, 600);
    const card = addBody(world, {
      id: "a",
      x: 200,
      y: 100,
      hw: 40,
      hh: 20,
      delay: 0.1,
    });
    const rnd = seededRandom(1);
    advanceWorld(world, 1 / 60, rnd);
    expect(card.released).toBe(false);
    expect(card.y).toBe(100);
    for (let i = 0; i < 10; i++) advanceWorld(world, 1 / 60, rnd);
    expect(card.released).toBe(true);
  });

  test("a gravitáció lehúzza, és végül kihullik — a jelenet lecseng", () => {
    const world = createWorld(400, 300);
    for (let i = 0; i < 6; i++) {
      addBody(world, {
        id: String(i),
        x: 60 + i * 50,
        y: 50,
        hw: 22,
        hh: 14,
        delay: i * 0.05,
      });
    }
    const rnd = seededRandom(7);
    let frames = 0;
    while (!worldSettled(world) && frames < 60 * 20) {
      advanceWorld(world, 1 / 60, rnd);
      frames++;
    }
    expect(worldSettled(world)).toBe(true);
    expect(world.bodies.every((b) => b.gone)).toBe(true);
  });

  test("a falakon belül marad", () => {
    const world = createWorld(200, 5000);
    const card = addBody(world, {
      id: "a",
      x: 5,
      y: 0,
      hw: 30,
      hh: 10,
      delay: 0,
    });
    const rnd = seededRandom(3);
    for (let i = 0; i < 120; i++) {
      advanceWorld(world, 1 / 60, rnd);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x).toBeLessThanOrEqual(200);
    }
  });

  test("egy nagy időugrás legfeljebb nyolc lépést tesz", () => {
    const world = createWorld(400, 600);
    addBody(world, { id: "a", x: 200, y: 100, hw: 40, hh: 20, delay: 0 });
    expect(advanceWorld(world, 10, seededRandom(1))).toBe(true);
    expect(world.t).toBeCloseTo(8 / 120, 6);
  });

  test("a lépésköznél rövidebb idő nem léptet", () => {
    const world = createWorld(400, 600);
    expect(advanceWorld(world, 1 / 1000, seededRandom(1))).toBe(false);
  });

  test("determinisztikus: ugyanaz a mag ugyanazt a pályát adja", () => {
    const run = () => {
      const world = createWorld(400, 600);
      addBody(world, { id: "a", x: 200, y: 100, hw: 40, hh: 20, delay: 0 });
      addBody(world, { id: "b", x: 210, y: 40, hw: 40, hh: 20, delay: 0 });
      const rnd = seededRandom(99);
      for (let i = 0; i < 60; i++) advanceWorld(world, 1 / 60, rnd);
      return world.bodies.map((b) => [b.x, b.y, b.a]);
    };
    expect(run()).toEqual(run());
  });

  test("átméretezéskor a kilógó kártya visszakerül a falak közé", () => {
    const world = createWorld(800, 600);
    const card = addBody(world, {
      id: "a",
      x: 700,
      y: 100,
      hw: 40,
      hh: 20,
      delay: 0,
    });
    const idle = addBody(world, {
      id: "b",
      x: 700,
      y: 100,
      hw: 40,
      hh: 20,
      delay: 99,
    });
    advanceWorld(world, 1 / 60, seededRandom(1));
    resizeWorld(world, 300, 600);
    expect(world.w).toBe(300);
    expect(card.x).toBeLessThanOrEqual(300);
    //* A még ki nem szakadt kártya a rács helyén marad.
    expect(idle.x).toBe(700);
  });

  test("üres világ azonnal lecsengett", () => {
    expect(worldSettled(createWorld(1, 1))).toBe(true);
  });
});
