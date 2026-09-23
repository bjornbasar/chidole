import { describe, it, expect } from "vitest";
import { hit, getSpawnInterval, direction, nearestIndex, advanceSpawnTier, aimFrame, hpBarColor, xpThreshold } from "./logic.js";

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

describe("advanceSpawnTier", () => {
  it("stays basic until the basic streak target is reached", () => {
    let state = { basicCount: 0, basicTarget: 3, extraCount: 0, extraTarget: 2 };
    let r = advanceSpawnTier(state, 4, 2);
    expect(r.tier).toBe("basic");
    state = r.state;
    r = advanceSpawnTier(state, 4, 2);
    expect(r.tier).toBe("basic");
  });

  it("escalates to extra once the basic streak is hit, and resets the basic counter", () => {
    let state = { basicCount: 2, basicTarget: 3, extraCount: 0, extraTarget: 2 };
    const r = advanceSpawnTier(state, 4, 2);
    expect(r.tier).toBe("extra");
    expect(r.state.basicCount).toBe(0);
    expect(r.state.basicTarget).toBe(4); // adopted the rolled next target
    expect(r.state.extraCount).toBe(1);
  });

  it("escalates to tank once the extra streak is hit, and resets both counters", () => {
    // one basic streak away from triggering extra #2, which hits extraTarget=2
    let state = { basicCount: 2, basicTarget: 3, extraCount: 1, extraTarget: 2 };
    const r = advanceSpawnTier(state, 5, 6);
    expect(r.tier).toBe("tank");
    expect(r.state.basicCount).toBe(0);
    expect(r.state.basicTarget).toBe(5);
    expect(r.state.extraCount).toBe(0);
    expect(r.state.extraTarget).toBe(6);
  });

  it("runs a full basic->extra->basic->tank cascade across repeated calls", () => {
    let state = { basicCount: 0, basicTarget: 3, extraCount: 0, extraTarget: 2 };
    const tiers = [];
    const nextBasics = [4, 5]; // rolled targets to use on each basic-streak reset
    const nextExtras = [3]; // rolled target to use on the extra-streak reset
    let bi = 0;
    for (let i = 0; i < 7; i++) {
      const r = advanceSpawnTier(state, nextBasics[bi] ?? 4, nextExtras[0]);
      if (r.tier === "extra" || r.tier === "tank") bi++;
      tiers.push(r.tier);
      state = r.state;
    }
    // basicTarget=3: basic,basic,extra(reset->4) / basic,basic,basic,tank(extraTarget=2 hit)
    expect(tiers).toEqual(["basic", "basic", "extra", "basic", "basic", "basic", "tank"]);
  });
});

describe("aimFrame", () => {
  it("maps the 4 native (right-side) cardinal/diagonal directions with no flip", () => {
    expect(aimFrame(0, 1)).toEqual({ frame: 0, flip: 1 }); // S — frame 0 is the front-view pose
    expect(aimFrame(1, 1)).toEqual({ frame: 2, flip: 1 }); // SE
    expect(aimFrame(1, 0)).toEqual({ frame: 4, flip: 1 }); // E
    expect(aimFrame(1, -1)).toEqual({ frame: 6, flip: 1 }); // NE
    expect(aimFrame(0, -1)).toEqual({ frame: 8, flip: 1 }); // N
  });

  it("mirrors the right-side frames for the 3 left-side directions", () => {
    expect(aimFrame(-1, -1)).toEqual({ frame: 6, flip: -1 }); // NW mirrors NE
    expect(aimFrame(-1, 0)).toEqual({ frame: 4, flip: -1 }); // W mirrors E
    expect(aimFrame(-1, 1)).toEqual({ frame: 2, flip: -1 }); // SW mirrors SE
  });
});

describe("hpBarColor", () => {
  it("is red at or below 25%", () => {
    expect(hpBarColor(0)).toBe("red");
    expect(hpBarColor(0.25)).toBe("red");
  });

  it("is yellow between 25% (exclusive) and 70% (inclusive)", () => {
    expect(hpBarColor(0.26)).toBe("yellow");
    expect(hpBarColor(0.5)).toBe("yellow");
    expect(hpBarColor(0.7)).toBe("yellow");
  });

  it("is green above 70%", () => {
    expect(hpBarColor(0.71)).toBe("green");
    expect(hpBarColor(1)).toBe("green");
  });
});

describe("xpThreshold", () => {
  it("grows linearly with level", () => {
    expect(xpThreshold(1)).toBe(10);
    expect(xpThreshold(2)).toBe(20);
    expect(xpThreshold(5)).toBe(50);
  });
});
