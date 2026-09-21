import { describe, it, expect } from "vitest";
import { hit, getSpawnInterval } from "./logic.js";

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
