import { describe, it, expect } from "vitest";
import { hit, getSpawnInterval, direction, nearestIndex } from "./logic.js";

describe("hit", () => {
  it("is true when within threshold", () => {
    expect(hit(0, 0, 3, 4, 5)).toBe(true); // distance exactly 5
  });

  it("is false when outside threshold", () => {
    expect(hit(0, 0, 10, 10, 5)).toBe(false);
  });

  it("is true for identical points", () => {
    expect(hit(5, 5, 5, 5, 0.01)).toBe(true);
  });
});

describe("getSpawnInterval", () => {
  it("starts at the initial interval at t=0", () => {
    expect(getSpawnInterval(0)).toBe(1400);
  });

  it("ramps down as elapsed time grows", () => {
    const early = getSpawnInterval(1000);
    const later = getSpawnInterval(30000);
    expect(later).toBeLessThan(early);
  });

  it("clamps to the floor once fully ramped", () => {
    expect(getSpawnInterval(60000)).toBe(400);
    expect(getSpawnInterval(999999)).toBe(400);
  });
});

describe("direction", () => {
  it("points from one point toward another as a unit vector", () => {
    const d = direction(0, 0, 10, 0);
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
  });

  it("has magnitude 1 for a diagonal vector", () => {
    const d = direction(0, 0, 3, 4);
    expect(Math.sqrt(d.x * d.x + d.y * d.y)).toBeCloseTo(1);
  });

  it("returns {0,0} for identical points instead of NaN", () => {
    expect(direction(5, 5, 5, 5)).toEqual({ x: 0, y: 0 });
  });
});

describe("nearestIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(nearestIndex(0, 0, [])).toBe(-1);
  });

  it("returns the index of the closest entity", () => {
    const entities = [{ x: 100, y: 100 }, { x: 1, y: 1 }, { x: 50, y: 50 }];
    expect(nearestIndex(0, 0, entities)).toBe(1);
  });
});
