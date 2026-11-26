// Ring Runner — deterministic randomness. One seeded generator per world, so a
// seed always builds the same sky: the screenshot scenes and any replay agree.

/** mulberry32: a small, fast, seedable PRNG with a decent spread. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator with the helpers the world builders keep reaching for. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max], both ends included. */
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    /** One element of a non-empty array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}

/**
 * A stable 0..1 hash of two integer cell coordinates and a salt. Terrain tint
 * and tree placement use it so the ground looks the same from any camera and
 * never has to be stored.
 */
export function hash2(ix, iz, salt = 0) {
  let h = (ix * 374761393 + iz * 668265263 + salt * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
