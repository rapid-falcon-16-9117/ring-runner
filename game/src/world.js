// Ring Runner — the world: one sortie's whole state and the rules that judge
// it. Owns the screen state machine (title, briefing, play, complete, crash),
// the rings and crates, birds and storm cells, landing evaluation, scoring
// and achievements. The renderer and HUD read this; they never change it.

import { LIVERIES, SCORE } from './config.js';
import { buildTerrain, courseX } from './terrain.js';
import { ACHIEVEMENTS, MISSIONS, endlessRing } from './course.js';
import { createAircraft, stepAircraft } from './aircraft.js';
import { makeRng } from './random.js';

export const SCREEN = {
  TITLE: 'title',
  BRIEFING: 'briefing',
  PLAY: 'play',
  COMPLETE: 'complete',
  CRASH: 'crash',
  CAMPAIGN: 'campaign',
};

export function createWorld(seed = 1) {
  const world = {
    seed,
    screen: SCREEN.TITLE,
    liveryIndex: 0,
    missionIndex: 0,
    unlocked: 1, // missions available on the title screen
    freeFlight: false,
    achievements: new Set(),
    toast: null, // { text, until } achievement banner
    campaignScore: 0,
    // per-sortie state, filled by startSortie:
    mission: null,
    terrain: null,
    plane: null,
    rings: [],
    crates: [],
    birds: [],
    storms: [],
    score: 0,
    time: 0,
    ringsFlown: 0,
    cratesGot: 0,
    nextRing: 0,
    endlessCount: 0,
    message: null, // { text, sub, until } centre-screen callout
    result: null, // landing/crash report for the end screens
    camera: { x: 0, y: 300, z: -600, heading: 0, pitch: 0 },
    shake: 0,
    timeScale: 1,
  };

  /** Set up (or reset) a sortie: campaign mission `index`, or free flight. */
  function startSortie(index, freeFlight) {
    const def = freeFlight ? null : MISSIONS[index];
    const zoneId = freeFlight ? 'coast' : def.zone;
    const terrain = buildTerrain(zoneId, freeFlight ? seed * 17 + 5 : def.seed);
    const home = { x: courseX(0), z: 0, length: 2600, width: 110, heading: 0 };
    const plane = createAircraft(LIVERIES[world.liveryIndex], home.x, home.z - 1150);
    plane.fuel = freeFlight ? 100 : def.fuel;
    world.mission = def;
    world.freeFlight = freeFlight;
    world.terrain = terrain;
    world.plane = plane;
    world.rings = freeFlight ? [endlessRing(seed, 0), endlessRing(seed, 1), endlessRing(seed, 2)] : def.rings.map((r) => ({ ...r, state: 'pending' }));
    world.crates = freeFlight ? [] : def.crates.map((c) => ({ ...c, taken: false }));
    world.storms = freeFlight ? [] : def.storms.map((s) => ({ x: courseX(s.dz) + s.off, z: s.dz, r: s.r }));
    world.birds = [];
    const birdCount = freeFlight ? 2 : def.birdFlocks;
    const rng = makeRng((freeFlight ? seed : def.seed) * 13 + 3);
    for (let i = 0; i < birdCount; i += 1) {
      const z = rng.range(5000, 17000);
      world.birds.push({
        x: courseX(z) + rng.range(-500, 500),
        y: rng.range(420, 900),
        z,
        phase: rng.range(0, Math.PI * 2),
        speed: rng.range(14, 22),
        hit: false,
      });
    }
    world.score = 0;
    world.time = 0;
    world.ringsFlown = 0;
    world.cratesGot = 0;
    world.nextRing = 0;
    world.endlessCount = 0;
    world.message = null;
    world.result = null;
    world.shake = 0;
    world.screen = SCREEN.BRIEFING;
  }

  /** Begin flying the sortie that startSortie prepared. */
  function launch() {
    world.screen = SCREEN.PLAY;
    world.time = 0;
  }

  /** Wind for this step: gusts scale with the mission's wind factor. */
  function windAt(t) {
    const w = world.freeFlight ? 0.15 : world.mission.wind;
    if (w <= 0) return { windX: 0, windY: 0, windZ: 0, windYaw: 0 };
    return {
      windX: Math.sin(t * 0.7) * 14 * w,
      windY: Math.sin(t * 1.7 + 2) * 22 * w,
      windZ: Math.cos(t * 0.5) * 8 * w,
      windYaw: Math.sin(t * 0.9 + 1) * 0.05 * w,
    };
  }

  function showMessage(text, sub, seconds) {
    world.message = { text, sub, until: world.time + seconds };
  }

  function award(id) {
    if (world.achievements.has(id)) return;
    world.achievements.add(id);
    world.toast = { text: ACHIEVEMENTS.find((a) => a.id === id).name, until: world.time + 3.4 };
  }

  /** Which runway (if any) a ground point sits on, and how it is aligned. */
  function runwayAt(x, z) {
    const strips = world.freeFlight
      ? [{ x: courseX(0), z: 0, length: 2600, width: 110, heading: 0 }]
      : [world.mission.home, world.mission.dest];
    for (const s of strips) {
      if (Math.abs(x - s.x) < s.width / 2 + 14 && z > s.z - s.length / 2 && z < s.z + s.length / 2) return s;
    }
    return null;
  }

  /** Judge a touchdown the aircraft just reported. */
  function judgeTouchdown() {
    const p = world.plane;
    const strip = runwayAt(p.x, p.z);
    const sink = Math.abs(Math.min(0, p.vy));
    const aligned = Math.abs(wrapAngle(p.heading - (strip ? strip.heading : 0))) < 0.35;
    const banked = Math.abs(p.roll) > 0.3;
    if (strip && aligned && !banked && sink <= 14 && p.speed <= 95) {
      const grade = sink <= 3.5 && p.speed >= 52 && p.speed <= 78 ? 'Perfect'
        : sink <= 7 ? 'Good' : 'Hard';
      finishSortie(grade, strip);
    } else if (!strip && sink <= 5 && p.speed <= 60 && !banked) {
      endInCrash('Field landing', 'Down in one piece, but off the strip the sortie is over — and so is the cargo run.');
    } else {
      const why = !strip ? 'You met the ground away from any runway'
        : banked ? 'You touched down banked over — a wingtip caught first'
        : sink > 14 ? `You came down at ${Math.round(sink)} ft/s. The gear, then the airframe, gave up`
        : 'Too fast and crooked for the strip';
      endInCrash('Crashed on landing', why);
    }
  }

  function finishSortie(grade, strip) {
    const p = world.plane;
    const atDest = !world.freeFlight && strip === world.mission.dest;
    if (!atDest && !world.freeFlight) {
      // Put down back at home base: safe, but the sortie is a failure to deliver.
      endInCrash('Back at base', 'A safe landing at the home strip — but the rings and the far shore were the job. The sortie scores nothing.');
      return;
    }
    let bonus = 0;
    if (grade === 'Perfect') bonus += SCORE.landingPerfect;
    else if (grade === 'Good') bonus += SCORE.landingGood;
    else bonus += SCORE.landingHard;
    if (!world.freeFlight) {
      bonus += Math.max(0, Math.round((world.mission.parTime - world.time)) * SCORE.secondBonus);
      bonus += Math.round(p.fuel) * SCORE.fuelBonus;
      if (p.fuel < 10) award('deadstick');
      if (world.cratesGot === world.mission.crateCount) award('cargo-hand');
      if (world.rings.every((r) => r.state !== 'missed' && r.state !== 'pending')) award('ring-master');
      if (world.missionIndex === 0) award('first-solo');
      if (world.missionIndex === 2) award('storm-rider');
      world.unlocked = Math.min(MISSIONS.length, Math.max(world.unlocked, world.missionIndex + 2));
      world.campaignScore += world.score + bonus;
      if (world.missionIndex === MISSIONS.length - 1) award('grand-tour');
    }
    world.score += bonus;
    world.result = {
      grade,
      bonus,
      title: world.freeFlight ? 'Flight over' : `${grade} landing`,
      lines: [
        `Rings: ${world.ringsFlown} flown · Crates: ${world.cratesGot}`,
        `Time ${formatTime(world.time)} · Fuel left ${Math.round(p.fuel)}%`,
        `Landing bonus +${bonus}`,
      ],
    };
    world.screen = world.missionIndex === MISSIONS.length - 1 && !world.freeFlight
      ? SCREEN.CAMPAIGN
      : SCREEN.COMPLETE;
  }

  function endInCrash(title, why) {
    world.result = { grade: 'Crash', title, lines: [why, `Score kept: ${world.score}`] };
    world.screen = SCREEN.CRASH;
    world.shake = 1;
  }

  /** Advance the flying world by one fixed step under `ctrl`. */
  function step(dt, ctrl) {
    if (world.screen !== SCREEN.PLAY) return;
    const p = world.plane;
    world.time += dt;
    const groundHere = Math.max(0, world.terrain.heightAt(p.x, p.z));
    const events = stepAircraft(p, ctrl, dt, {
      groundHeight: groundHere,
      fuelRate: world.freeFlight ? 0.5 : world.mission.fuelRate,
      ...windAt(world.time),
    });

    // Storm cells: inside one, the air itself is a hazard.
    let inStorm = false;
    for (const s of world.storms) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz < s.r * s.r && p.y < 2400) inStorm = true;
    }
    world.inStorm = inStorm;
    if (inStorm && p.airborne) {
      p.damage += dt * 3.2;
      world.shake = Math.min(1, world.shake + dt * 2.4);
      p.pitch += Math.sin(world.time * 7.3) * 0.0016;
      p.roll += Math.cos(world.time * 6.1) * 0.0022;
    } else {
      world.shake = Math.max(0, world.shake - dt * 1.8);
    }
    if (p.damage >= 100) {
      endInCrash('Broken up in the storm', 'The storm cell worried the airframe past what it could hold.');
      return;
    }

    // Birds: a flock crossing the nose costs damage and feathers.
    for (const b of world.birds) {
      b.x += Math.sin(world.time * 0.6 + b.phase) * b.speed * dt * 3;
      b.z += Math.cos(world.time * 0.23 + b.phase) * b.speed * dt;
      if (!b.hit && p.airborne) {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const dz = p.z - b.z;
        if (dx * dx + dy * dy + dz * dz < 55 * 55) {
          b.hit = true;
          p.damage += 22;
          world.shake = 1;
          showMessage('BIRD STRIKE', 'Damage +22%', 2.2);
          if (p.damage >= 100) {
            endInCrash('Down after a bird strike', 'One flock too many: the engine coughed, the wing folded, the ground arrived.');
            return;
          }
        }
      }
    }

    // Rings: crossing the ring's plane inside its circle counts.
    const ring = world.rings[world.nextRing];
    if (ring) {
      const dz = p.z - ring.z;
      if (world.prevDz !== undefined && Math.sign(dz) !== Math.sign(world.prevDz) && Math.sign(dz) !== 0) {
        const dx = p.x - ring.x;
        const dy = p.y - ring.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ring.r * 0.68) {
          ring.state = 'clean';
          world.score += SCORE.ringClean;
          showMessage('CLEAN RING', `+${SCORE.ringClean}`, 1.6);
        } else if (dist < ring.r) {
          ring.state = 'passed';
          world.score += SCORE.ringPass;
          showMessage('RING', `+${SCORE.ringPass}`, 1.6);
        } else {
          ring.state = 'missed';
          showMessage('RING MISSED', 'It stays grey behind you', 1.6);
        }
        if (ring.state !== 'missed') world.ringsFlown += 1;
        world.nextRing += 1;
        if (world.freeFlight) {
          world.endlessCount += 1;
          p.fuel = Math.min(100, p.fuel + 9);
          world.rings.push(endlessRing(world.seed, world.endlessCount + 2));
        }
      }
      if (dz > 500 && ring.state === 'pending') {
        ring.state = 'missed';
        showMessage('RING MISSED', 'It stays grey behind you', 1.6);
        world.nextRing += 1;
        if (world.freeFlight) world.rings.push(endlessRing(world.seed, world.endlessCount + 2));
      }
      world.prevDz = dz;
    }

    // Crates: fly through the halo and the crate is yours.
    for (const c of world.crates) {
      if (c.taken) continue;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dz = p.z - c.z;
      if (dx * dx + dy * dy + dz * dz < 70 * 70) {
        c.taken = true;
        world.cratesGot += 1;
        world.score += SCORE.crate;
        showMessage('SUPPLY CRATE', `+${SCORE.crate}`, 1.6);
      }
    }

    // Terrain and touchdown.
    if (events.touchedDown) {
      judgeTouchdown();
      return;
    }
    if (p.airborne && p.y <= groundHere + 2 && !runwayAt(p.x, p.z)) {
      endInCrash('Terrain', 'The ground out here is not a runway, and it did not forgive the meeting.');
      return;
    }

    // Camera: chase position behind and above, smoothed so it never snaps.
    const back = 58;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const camTarget = {
      x: p.x - fx * back,
      z: p.z - fz * back,
      y: Math.max(p.y + 17, groundHere + 12),
      heading: p.heading,
      pitch: p.pitch,
    };
    const k = 1 - Math.pow(0.0001, dt);
    world.camera.x += (camTarget.x - world.camera.x) * k;
    world.camera.z += (camTarget.z - world.camera.z) * k;
    world.camera.y += (camTarget.y - world.camera.y) * k;
    world.camera.heading += wrapAngle(camTarget.heading - world.camera.heading) * k;
    world.camera.pitch += (camTarget.pitch - world.camera.pitch) * k;
  }

  world.startSortie = startSortie;
  world.launch = launch;
  world.step = step;
  world.showMessage = showMessage;
  return world;
}

/** Format seconds as m:ss for the HUD and end screens. */
export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Shortest signed equivalent of an angle, in (-pi, pi]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
