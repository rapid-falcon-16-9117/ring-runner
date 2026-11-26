// Ring Runner — the aeroplane: state and the flight model. One step function
// advances it by a fixed dt under a control input; the world above it decides
// what the consequences are (rings, terrain, landings). Speeds are knots,
// distances feet, angles radians, heading 0 = north (+Z), clockwise positive.

import { FT_PER_KT, PHYS } from './config.js';

export function createAircraft(livery, x, z) {
  return {
    livery,
    x,
    y: 0, // altitude, feet above sea level; the ground is terrain.heightAt
    z,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0, // kt
    throttle: 0,
    fuel: 100, // percent
    damage: 0, // percent; 100 is a wreck
    airborne: false,
    stalled: false,
    engineOut: false,
    propPhase: 0, // propeller rotation, for the renderer
    vy: 0, // last vertical speed, ft/s (the HUD's VSI reads this)
  };
}

/**
 * Advance the aircraft one step. `env` carries what the airframe cannot know:
 * ground height under it, fuel burn rate, and the wind's push this step.
 * Returns flags the world acts on: { liftedOff, touchedDown } — touchdown
 * evaluation itself (runway? sink? alignment?) is the world's job.
 */
export function stepAircraft(a, ctrl, dt, env) {
  const events = { liftedOff: false, touchedDown: false };
  const ground = env.groundHeight;

  // Throttle: the control carries an absolute setting (keys and wheel move
  // it in input.js; the autopilot sets it directly). A dead engine or a dry
  // tank pins it to zero.
  a.throttle = a.engineOut || a.fuel <= 0 ? 0 : clamp(ctrl.throttle, 0, 1);
  if (a.fuel > 0 && !a.engineOut) {
    a.fuel = Math.max(0, a.fuel - dt * env.fuelRate * (0.3 + a.throttle * 0.9));
  }

  // Speed chases the throttle's promise, slower on grass, slower uphill.
  const topSpeed = a.livery.maxSpeed * (a.engineOut || a.fuel <= 0 ? 0 : 1);
  const target = a.throttle * topSpeed * 1.12;
  const chase = (a.airborne ? PHYS.airAccel : PHYS.groundAccel) * a.livery.accelFactor;
  a.speed += (target - a.speed) * Math.min(1, dt * chase * 3.2);
  if (!a.airborne && ctrl.brake) a.speed = Math.max(0, a.speed - 60 * dt);
  if (a.airborne && a.speed < 40) a.speed = Math.max(a.speed, 0);

  // Attitude: pitch and roll chase the stick, with a gentle self-level.
  const pitchTarget = ctrl.pitch * (ctrl.pitch > 0 ? PHYS.maxPitch : -PHYS.minPitch);
  const rollTarget = ctrl.roll * PHYS.maxRoll;
  a.pitch = approach(a.pitch, pitchTarget, PHYS.pitchRate * dt);
  a.roll = approach(a.roll, rollTarget, PHYS.rollRate * dt);

  // Stall: slow, airborne and still asking the wing for lift. The nose drops
  // whether the pilot likes it or not, and the sink builds until speed does.
  a.stalled = a.airborne && a.speed < PHYS.stallSpeed && a.pitch > 0.04;
  if (a.stalled) a.pitch = approach(a.pitch, -0.22, 0.9 * dt);

  // Turning: bank makes heading, paid for with a little lift. Roll is
  // signed the way the stick, the HUD and the sprite all agree on:
  // positive roll is a right bank, and a right bank swings the nose
  // clockwise — heading (compass-style, clockwise from north) grows.
  const turnRate = Math.sin(a.roll) * 0.62 * a.livery.turnFactor * (120 / Math.max(70, a.speed));
  if (a.airborne) a.heading += turnRate * dt + (env.windYaw || 0) * dt;

  // Motion along the nose.
  const fps = a.speed * FT_PER_KT;
  const fwdX = Math.sin(a.heading);
  const fwdZ = Math.cos(a.heading);
  a.x += fwdX * fps * Math.cos(a.pitch) * dt + (env.windX || 0) * dt;
  a.z += fwdZ * fps * Math.cos(a.pitch) * dt + (env.windZ || 0) * dt;

  if (!a.airborne) {
    a.y = ground;
    a.vy = 0;
    if (a.speed > PHYS.rotateSpeed && a.pitch > 0.1) {
      a.airborne = true;
      events.liftedOff = true;
      a.y = ground + 1;
    }
  } else {
    const liftLoss = 1 - Math.cos(a.roll) * 0.45;
    let vy = fps * Math.sin(a.pitch) * (1 - liftLoss * 0.5);
    if (a.stalled) vy -= (PHYS.stallSpeed - a.speed) * 0.55;
    vy += (env.windY || 0) * dt;
    a.vy = vy;
    a.y += vy * dt;
    if (a.y <= ground) {
      a.y = ground;
      a.airborne = false;
      events.touchedDown = true;
    }
  }

  a.propPhase += dt * (2 + a.throttle * 46 + a.speed * 0.12);
  return events;
}

/** Move `value` toward `target` by at most `maxDelta`. */
function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

function clamp(v, lo, hi) {
  return v < lo ? v : v > hi ? v : v;
}
