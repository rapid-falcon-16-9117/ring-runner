// Ring Runner — deterministic screenshot staging, the game's own equivalent
// of a photo flight. Each scene runs the real physics forward from a fresh
// sortie under a simple autopilot, so a screenshot is a frame the game truly
// produces, and the same seed always produces the same frame:
//   cover   — the title screen over the parked aeroplane on the home strip
//   takeoff — seconds after liftoff, runway falling away, first ring ahead
//   rings   — mid-course in the coast circuit, next ring dead ahead, HUD lit
//   landing — final approach to the far strip, gear-down energy, runway big

import { STEP } from './config.js';
import { SCREEN, wrapAngle } from './world.js';

/**
 * A pilot of fixed habits: steer for a target point, hold a target altitude
 * and a target speed. Good enough to fly the coast circuit hands-off.
 */
function autopilot(world, target, targetAlt, targetSpeed) {
  const p = world.plane;
  const desired = Math.atan2(target.x - p.x, target.z - p.z);
  const diff = wrapAngle(desired - p.heading);
  const roll = clamp(diff * 1.5, -0.85, 0.85);
  const altErr = targetAlt - p.y;
  let pitch = clamp(altErr * 0.0016, -0.5, 0.8);
  if (!p.airborne) pitch = p.speed > 58 ? 0.55 : 0;
  const throttle = clamp(0.62 + (targetSpeed - p.speed) * 0.02, 0, 1);
  return { pitch, roll, throttle, brake: false };
}

function fly(world, seconds, controlFor) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, controlFor(world));
    if (world.screen !== SCREEN.PLAY) break;
  }
}

/**
 * Stage the named scene on a fresh world (already created with the seed).
 * Returns the screen the frame should show.
 */
export function stageShot(name, world) {
  if (name === 'takeoff') return stageTakeoff(world);
  if (name === 'rings') return stageRings(world);
  if (name === 'landing') return stageLanding(world);
  return stageCover(world);
}

function stageCover(world) {
  world.startSortie(0, false);
  world.screen = SCREEN.TITLE;
  // Park the camera behind the aeroplane on the strip, rings ahead.
  const p = world.plane;
  world.camera = {
    x: p.x - 74,
    y: 30,
    z: p.z - 74,
    heading: 0.06,
    pitch: 0.02,
  };
  return SCREEN.TITLE;
}

function stageTakeoff(world) {
  world.startSortie(0, false);
  world.launch();
  const first = world.rings[0];
  fly(world, 10.5, (w) => autopilot(w, first, 700, 120));
  return SCREEN.PLAY;
}

function stageRings(world) {
  world.startSortie(0, false);
  world.launch();
  // Fly the first two rings, then stop with the third framed ahead.
  let guard = 0;
  while (world.nextRing < 2 && guard < 60 * 90) {
    const ring = world.rings[world.nextRing];
    world.step(STEP, autopilot(world, ring, ring.y, 132));
    guard += 1;
    if (world.screen !== SCREEN.PLAY) break;
  }
  const third = world.rings[world.nextRing];
  let flown = 0;
  while (third && flown < 60 * 26) {
    const p = world.plane;
    const d = Math.hypot(p.x - third.x, p.z - third.z);
    if (d < 1050) break;
    world.step(STEP, autopilot(world, third, third.y, 132));
    flown += 1;
    if (world.screen !== SCREEN.PLAY) break;
  }
  return SCREEN.PLAY;
}

function stageLanding(world) {
  world.startSortie(0, false);
  world.launch();
  // Place the aeroplane on a stabilised final: 3,400 ft out, 330 ft up,
  // 80 kt, lined up on the destination strip — then fly the approach.
  const dest = world.mission.dest;
  const p = world.plane;
  p.x = dest.x;
  p.z = dest.z - 3400;
  p.y = 335;
  p.speed = 80;
  p.throttle = 0.34;
  p.heading = 0;
  p.airborne = true;
  world.camera = { x: p.x, y: p.y + 17, z: p.z - 58, heading: 0, pitch: 0 };
  world.nextRing = world.rings.length; // the sortie's rings are behind us
  world.rings.forEach((r) => { if (r.state === 'pending') r.state = 'passed'; });
  world.ringsFlown = world.rings.length;
  const aim = { x: dest.x, z: dest.z + 300 };
  fly(world, 10.5, (w) => {
    const pp = w.plane;
    const targetAlt = Math.max(24, (dest.z - pp.z) * 0.088);
    return autopilot(w, aim, targetAlt, 71);
  });
  return SCREEN.PLAY;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
