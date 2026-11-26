// Ring Runner — shared constants: canvas, physics, aircraft liveries and tuning.
// Everything the other modules agree on lives here so the numbers stay in one place.

/** Canvas resolution the game renders at (CSS scales it to the window). */
export const VIEW = { width: 1280, height: 800 };

/** Fixed physics step, seconds. The world advances in these and only these. */
export const STEP = 1 / 60;

/** World scale: distances and altitudes are feet, speeds are knots. */
export const FT_PER_KT = 1.68781;

/** How far ahead the renderer draws terrain, feet. */
export const VIEW_DIST = 7600;

/** Farmland grid cell size, feet. */
export const CELL = 600;

/** Flight model limits shared by the aircraft and the HUD. */
export const PHYS = {
  stallSpeed: 52, // kt: below this, airborne and nose-high, the wing lets go
  rotateSpeed: 60, // kt: ground speed at which a raised nose lifts the plane
  maxPitch: 0.46, // rad nose up
  minPitch: -0.5, // rad nose down
  maxRoll: 1.05, // rad of bank either way
  pitchRate: 1.5, // rad/s of pitch change at full stick
  rollRate: 2.4, // rad/s of roll change at full stick
  throttleRate: 0.55, // throttle units per second at full key press
  groundAccel: 0.32, // how fast speed chases its target on the runway
  airAccel: 0.22, // ... and in the air
  crashSink: 14, // ft/s of descent at touchdown that breaks the aeroplane
  hardSink: 7, // ft/s: firmer than this is a hard landing, gentler is good
};

/**
 * The three flyable liveries. Paint is cosmetic; the numbers are not: each
 * airframe trades top speed against turn authority and throttle response.
 */
export const LIVERIES = [
  {
    id: 'comet',
    name: 'Comet',
    cn: '彗星',
    body: '#b3372e',
    trim: '#f3e5c8',
    dark: '#6e1f1a',
    maxSpeed: 205,
    turnFactor: 1.0,
    accelFactor: 1.0,
    blurb: 'Balanced trainer. Forgiving everywhere, fastest nowhere.',
  },
  {
    id: 'gull',
    name: 'Gull',
    cn: '海鸥',
    body: '#1f7a8c',
    trim: '#eef6f2',
    dark: '#0f4552',
    maxSpeed: 188,
    turnFactor: 1.22,
    accelFactor: 1.05,
    blurb: 'Harbour glider. Turns on a coin, gives back top speed.',
  },
  {
    id: 'hawk',
    name: 'Hawk',
    cn: '苍鹰',
    body: '#c9922e',
    trim: '#2b2b30',
    dark: '#7a5514',
    maxSpeed: 228,
    turnFactor: 0.86,
    accelFactor: 1.12,
    blurb: 'Racing thoroughbred. Very fast, wants wide sky to turn.',
  },
];

/** Score values, named so the world and the briefing agree. */
export const SCORE = {
  ringClean: 150,
  ringPass: 100,
  crate: 200,
  landingPerfect: 500,
  landingGood: 300,
  landingHard: 100,
  secondBonus: 5, // per second of par time left when the sortie ends
  fuelBonus: 10, // per percent of fuel left when the sortie ends
};
