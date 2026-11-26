// Ring Runner — the three campaign missions and the free-flight generator.
// A mission is a route: a home runway, a chain of rings and supply crates
// along the S-curve, and a destination runway to land on. Ring and crate
// positions are laid out by rule from the course curve, so every mission is
// the same sky on every visit — and the numbers below are the countable
// content the briefings advertise.

import { courseX } from './terrain.js';
import { makeRng } from './random.js';

/** A runway: centre of the threshold end, heading north (0 rad), feet. */
function runway(z) {
  return { x: courseX(z), z, length: 2600, width: 110, heading: 0 };
}

/**
 * Lay a chain of rings along the course between two z marks. Rings ride the
 * S-curve with a gentle altitude wave; every ring faces along the course.
 */
function ringChain(zFrom, zTo, count, baseAlt) {
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = zFrom + (zTo - zFrom) * t;
    rings.push({
      x: courseX(z),
      y: baseAlt + Math.sin(t * Math.PI * 2.2) * 130,
      z,
      r: 95,
      state: 'pending', // pending | clean | passed | missed
    });
  }
  return rings;
}

/** Crates hang below the line between rings, low enough to make you descend. */
function crateLine(rings, count, seed) {
  const rng = makeRng(seed);
  const crates = [];
  for (let i = 0; i < count; i += 1) {
    const a = rings[Math.min(rings.length - 1, Math.floor((i + 0.5) * (rings.length / count)))];
    crates.push({
      x: a.x + rng.range(-260, 260),
      y: Math.max(150, a.y - rng.range(190, 300)),
      z: a.z + rng.range(300, 700),
      taken: false,
    });
  }
  return crates;
}

function buildMission(def) {
  const rings = ringChain(def.ringZ[0], def.ringZ[1], def.ringCount, def.baseAlt);
  return {
    ...def,
    home: runway(0),
    dest: runway(def.destZ),
    rings,
    crates: crateLine(rings, def.crateCount, def.seed * 31 + 7),
  };
}

export const MISSIONS = [
  buildMission({
    id: 'm1',
    name: 'First Light Circuit',
    cn: '晨光首航',
    zone: 'coast',
    seed: 1101,
    brief:
      'Take off at dawn, thread 8 rings over the bay, pick up 3 supply crates for the lighthouse keepers, and land on the far shore strip. Full fuel, calm air — a circuit to learn the aeroplane.',
    ringZ: [3200, 15600],
    ringCount: 8,
    crateCount: 3,
    baseAlt: 620,
    destZ: 18800,
    fuel: 100,
    fuelRate: 0.34,
    parTime: 300,
    birdFlocks: 0,
    storms: [],
    wind: 0,
  }),
  buildMission({
    id: 'm2',
    name: 'Mesa Cargo Run',
    cn: '峡谷货运',
    zone: 'mesa',
    seed: 2202,
    brief:
      'Midday freight through the canyon: 10 rings between the mesas, 5 crates for the survey camps, and bird flocks riding the thermals. The mesas are real — stay in the corridor or climb.',
    ringZ: [3000, 16400],
    ringCount: 10,
    crateCount: 5,
    baseAlt: 780,
    destZ: 19600,
    fuel: 100,
    fuelRate: 0.44,
    parTime: 330,
    birdFlocks: 3,
    storms: [],
    wind: 0.25,
  }),
  buildMission({
    id: 'm3',
    name: 'Alpine Storm Line',
    cn: '风暴雪线',
    zone: 'alpine',
    seed: 3303,
    brief:
      'Dusk over the snow line: 12 rings, 4 crates, and storm cells squatting on the route. Storm air costs damage and throws the nose around; route wide or thread the gaps. Land before dark and before the tanks run dry.',
    ringZ: [2800, 17200],
    ringCount: 12,
    crateCount: 4,
    baseAlt: 900,
    destZ: 20200,
    fuel: 100,
    fuelRate: 0.52,
    parTime: 360,
    birdFlocks: 2,
    storms: [
      { dz: 6200, off: 250, r: 620 },
      { dz: 10400, off: -380, r: 720 },
      { dz: 14200, off: 300, r: 660 },
      { dz: 17600, off: -200, r: 580 },
    ],
    wind: 0.6,
  }),
];

/**
 * Free flight: an endless chain generated ahead of the pilot. Returns the
 * next ring after `afterZ`, deterministic in (seed, index) so the chain
 * never changes under the wings.
 */
export function endlessRing(seed, index) {
  const rng = makeRng(seed * 7919 + index * 131);
  const z = 3400 + index * 1750;
  return {
    x: courseX(z) + rng.range(-300, 300),
    y: 640 + rng.range(-160, 220),
    z,
    r: 95,
    state: 'pending',
  };
}

/** The six achievements, in the order the title screen lists them. */
export const ACHIEVEMENTS = [
  { id: 'first-solo', name: 'First Solo', desc: 'Finish the First Light Circuit' },
  { id: 'cargo-hand', name: 'Cargo Hand', desc: 'Deliver every crate in one sortie' },
  { id: 'ring-master', name: 'Ring Master', desc: 'Fly every ring of a mission, none missed' },
  { id: 'storm-rider', name: 'Storm Rider', desc: 'Finish the Alpine Storm Line' },
  { id: 'deadstick', name: 'Deadstick', desc: 'Land safely with under 10% fuel' },
  { id: 'grand-tour', name: 'Grand Tour', desc: 'Complete the whole campaign' },
];
