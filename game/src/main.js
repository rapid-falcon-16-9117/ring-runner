// Ring Runner — boot and the frame loop. Wires the input, the world and the
// two drawing hands (renderer for the sky, HUD for the instruments and
// screens), runs physics in fixed steps so a slow frame never changes the
// flight, and — when the page is opened with ?shot=<scene>&seed=<n> — stages
// one deterministic scene instead, for the maker's screenshots.

import { STEP, VIEW, LIVERIES } from './config.js';
import { createInput } from './input.js';
import { createWorld, SCREEN } from './world.js';
import { MISSIONS } from './course.js';
import { createRenderer } from './render.js';
import { drawHud } from './hud.js';
import { stageShot } from './shots.js';
import { audio } from './audio.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shotName = params.get('shot');
if (shotName) window.__MUTE__ = true;

const input = createInput(canvas);
const world = createWorld(seed);
const renderer = createRenderer(canvas);

// The title screen's backdrop is a real sortie, parked: build mission one's
// world and hold it on the strip, camera behind the aeroplane.
world.startSortie(0, false);
world.screen = SCREEN.TITLE;
parkCamera();

function parkCamera() {
  const p = world.plane;
  world.camera = { x: p.x - 74, y: 30, z: p.z - 74, heading: 0.06, pitch: 0.02 };
}

function toTitle() {
  world.startSortie(world.missionIndex, false);
  world.screen = SCREEN.TITLE;
  parkCamera();
  input.clearPressed();
}

/** Sound cues read off world state changes, once per frame. */
const soundState = { message: null, screen: SCREEN.TITLE, stalled: false };
function sounds() {
  if (shotName) return;
  if (world.message && world.message !== soundState.message) {
    soundState.message = world.message;
    if (world.message.text.includes('RING')) audio.ring();
    else if (world.message.text.includes('CRATE')) audio.crate();
    else if (world.message.text.includes('STRIKE')) audio.thud();
  }
  if (world.screen !== soundState.screen) {
    if (world.screen === SCREEN.CRASH) audio.thud();
    if (world.screen === SCREEN.COMPLETE || world.screen === SCREEN.CAMPAIGN) audio.chime();
    soundState.screen = world.screen;
  }
  if (world.screen === SCREEN.PLAY && world.plane) {
    audio.setEngine(world.plane.throttle, world.plane.speed);
    if (world.plane.stalled && !soundState.stalled) audio.warn();
    soundState.stalled = world.plane.stalled;
  }
}

function menuKeys() {
  const s = world.screen;
  if (s === SCREEN.TITLE) {
    if (input.wasPressed('ArrowDown')) {
      world.missionIndex = Math.min(world.unlocked - 1, world.missionIndex + 1);
      world.startSortie(world.missionIndex, false);
      world.screen = SCREEN.TITLE;
      parkCamera();
    }
    if (input.wasPressed('ArrowUp')) {
      world.missionIndex = Math.max(0, world.missionIndex - 1);
      world.startSortie(world.missionIndex, false);
      world.screen = SCREEN.TITLE;
      parkCamera();
    }
    const leftPressed = input.wasPressed('ArrowLeft');
    const rightPressed = input.wasPressed('ArrowRight');
    if (leftPressed || rightPressed) {
      const d = leftPressed ? -1 : 1;
      world.liveryIndex = (world.liveryIndex + d + LIVERIES.length) % LIVERIES.length;
      world.plane.livery = LIVERIES[world.liveryIndex];
    }
    if (input.wasPressed('Enter')) {
      world.startSortie(world.missionIndex, false);
      input.setThrottle(0);
    }
    if (input.wasPressed('KeyF')) {
      world.startSortie(0, true);
      input.setThrottle(0);
    }
  } else if (s === SCREEN.BRIEFING) {
    if (input.wasPressed('Enter')) {
      audio.startEngine();
      world.launch();
    }
    if (input.wasPressed('Escape')) toTitle();
  } else if (s === SCREEN.COMPLETE) {
    if (input.wasPressed('Enter')) {
      if (!world.freeFlight && world.missionIndex < MISSIONS.length - 1) {
        world.missionIndex += 1;
        world.startSortie(world.missionIndex, false);
        input.setThrottle(0);
      } else toTitle();
    }
    if (input.wasPressed('KeyR')) {
      world.startSortie(world.missionIndex, world.freeFlight);
      input.setThrottle(0);
    }
    if (input.wasPressed('Escape')) toTitle();
  } else if (s === SCREEN.CRASH) {
    if (input.wasPressed('KeyR')) {
      world.startSortie(world.missionIndex, world.freeFlight);
      world.launch();
      input.setThrottle(0);
    }
    if (input.wasPressed('Escape')) toTitle();
  } else if (s === SCREEN.CAMPAIGN) {
    if (input.wasPressed('Enter')) toTitle();
    if (input.wasPressed('KeyF')) {
      world.startSortie(0, true);
      input.setThrottle(0);
    }
  }
}

let paused = false;
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (!shotName) {
    if (input.wasPressed('KeyP') && world.screen === SCREEN.PLAY) paused = !paused;
    menuKeys();
    if (world.screen === SCREEN.PLAY && !paused) {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, input.controls(STEP));
        accumulator -= STEP;
      }
    }
    sounds();
  }
  renderer.draw(world);
  drawHud(ctx, world);
  if (paused && world.screen === SCREEN.PLAY) {
    ctx.fillStyle = 'rgba(8,12,24,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.font = '800 44px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#eef4f8';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED 暂停', VIEW.width / 2, VIEW.height / 2);
  }
}

if (shotName) {
  stageShot(shotName, world);
  renderer.draw(world);
  drawHud(ctx, world);
  window.__SHOT_READY__ = true;
}
requestAnimationFrame(frame);
