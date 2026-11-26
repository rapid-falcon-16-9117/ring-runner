// Ring Runner — the ground itself: three zones with their own height fields,
// palettes and landmarks. Pure data plus heightAt(x, z): the aircraft asks it
// where the ground is, the renderer asks it what the ground looks like.

import { hash2, makeRng } from './random.js';

/**
 * Zone palettes. Sky is a three-stop gradient (zenith, mid, horizon); ground
 * tints are the farmland rotation the renderer picks from per cell; fog is
 * the colour distance dissolves into (kept close to the horizon stop).
 */
export const ZONES = {
  coast: {
    name: 'Verdant Coast',
    cn: '青翠海岸',
    sky: ['#7fb2dd', '#bcd6ea', '#f6dfae'],
    fog: '#cfdde6',
    sun: { x: 0.78, y: 0.16, colour: '#fff3c4' },
    ground: ['#6da34c', '#7fb457', '#5d9440', '#a9b45e', '#8aa653', '#c2b280'],
    water: ['#2e6f9e', '#357cae'],
    ridge: '#5b7d99',
    ridgeFar: '#8ba7bf',
  },
  mesa: {
    name: 'Red Mesa Canyon',
    cn: '赤岩峡谷',
    sky: ['#6fa8d8', '#c3d9e8', '#f2cf9a'],
    fog: '#e3cfa8',
    sun: { x: 0.5, y: 0.1, colour: '#fff6d8' },
    ground: ['#b0723f', '#bd8148', '#a56535', '#c08a52', '#9c5f31', '#caa06a'],
    water: ['#3a7d8c', '#428794'],
    ridge: '#8a4f2c',
    ridgeFar: '#bb8757',
  },
  alpine: {
    name: 'Alpine Dusk',
    cn: '雪岭暮色',
    sky: ['#3d4a7a', '#8d6a9e', '#f0a56b'],
    fog: '#c99a86',
    sun: { x: 0.24, y: 0.3, colour: '#ffb877' },
    ground: ['#5c6e50', '#687a58', '#52634a', '#77875f', '#6d7c62', '#8b9078'],
    water: ['#44557e', '#4d608a'],
    ridge: '#6a7590',
    ridgeFar: '#97919e',
  },
};

/** The course corridor half-width: terrain keeps this clear around x = courseX(z). */
export const CORRIDOR = 900;

/** The S-curve every mission flies: course centre x as a function of z. */
export function courseX(z) {
  return Math.sin(z * 0.00016) * 850 + Math.sin(z * 0.00053 + 1.7) * 260;
}

/**
 * Build one zone's terrain from a seed. Mesas and peaks are placed beside —
 * never inside — the course corridor, so the route is always flyable and the
 * obstacles are the ones the mission brief promises.
 */
export function buildTerrain(zoneId, seed) {
  const rng = makeRng(seed);
  const mesas = [];
  const peaks = [];
  if (zoneId === 'mesa') {
    for (let i = 0; i < 26; i += 1) {
      const z = rng.range(1500, 20500);
      const side = rng.chance(0.5) ? -1 : 1;
      const x = courseX(z) + side * rng.range(CORRIDOR + 500, CORRIDOR + 2600);
      mesas.push({
        x, z,
        w: rng.range(700, 1500),
        d: rng.range(700, 1600),
        h: rng.range(260, 640),
        tint: rng.next(),
      });
    }
  }
  if (zoneId === 'alpine') {
    for (let i = 0; i < 30; i += 1) {
      const z = rng.range(500, 21500);
      const side = rng.chance(0.5) ? -1 : 1;
      const x = courseX(z) + side * rng.range(CORRIDOR + 700, CORRIDOR + 3400);
      peaks.push({ x, z, r: rng.range(900, 1700), h: rng.range(1400, 2600), tint: rng.next() });
    }
  }
  const landmarks = [];
  if (zoneId === 'coast') {
    landmarks.push({ kind: 'lighthouse', x: courseX(9200) - 2350, z: 9200, h: 190 });
    landmarks.push({ kind: 'lighthouse', x: courseX(2600) - 2450, z: 2600, h: 170 });
  }

  /** Ground height in feet at a world point. Flat except where a mesa or peak stands. */
  function heightAt(x, z) {
    let h = 0;
    for (const m of mesas) {
      if (Math.abs(x - m.x) < m.w / 2 && Math.abs(z - m.z) < m.d / 2 && m.h > h) h = m.h;
    }
    for (const p of peaks) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < p.r * p.r) {
        const ph = p.h * (1 - Math.sqrt(d2) / p.r);
        if (ph > h) h = ph;
      }
    }
    return h;
  }

  /** Coast only: the sea lies west of a meandering shoreline. */
  function isWater(x, z) {
    if (zoneId !== 'coast') return false;
    const shore = courseX(z) - 2100 + Math.sin(z * 0.00045 + 0.6) * 420;
    return x < shore;
  }

  /** Farmland tint index for a ground cell, stable for any camera. */
  function cellTint(ix, iz) {
    return Math.floor(hash2(ix, iz, 7) * 6);
  }

  /** Whether a cell grows a tree cluster (renderer decides the shape). */
  function cellWooded(ix, iz) {
    return hash2(ix, iz, 21) > 0.86;
  }

  return { zone: ZONES[zoneId], zoneId, mesas, peaks, landmarks, heightAt, isWater, cellTint, cellWooded };
}
