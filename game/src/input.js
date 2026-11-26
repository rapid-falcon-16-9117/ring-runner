// Ring Runner — keyboard and mouse input. Produces one control shape that the
// aircraft, the autopilot and the screenshot stager all speak:
//   { pitch: -1..1 (nose down..up), roll: -1..1 (left..right),
//     throttle: 0..1 absolute, brake: bool }
// plus edge-triggered `pressed` codes for menus (Enter, R, digits...).

const KEYMAP = {
  ArrowUp: 'pitchDown', // pushing the stick forward: nose down, as in a real yoke
  ArrowDown: 'pitchUp',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  ArrowLeft: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyA: 'rollLeft',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  Space: 'brake',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const state = {
    throttle: 0,
    mouseX: 0.5, // 0..1 across the canvas
    mouseY: 0.5, // 0..1 down the canvas
    mouseIn: false,
    mouseDown: false,
  };

  window.addEventListener('keydown', (event) => {
    if (KEYMAP[event.code] || event.code === 'Enter' || event.code.startsWith('Digit')) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = (event.clientX - rect.left) / rect.width;
    state.mouseY = (event.clientY - rect.top) / rect.height;
    state.mouseIn = true;
  });
  canvas.addEventListener('mousedown', () => {
    state.mouseDown = true;
    pressed.add('MouseDown');
  });
  window.addEventListener('mouseup', () => {
    state.mouseDown = false;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.throttle = clamp01(state.throttle - Math.sign(event.deltaY) * 0.08);
  }, { passive: false });

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  return {
    /** Snapshot the continuous controls for one physics step. */
    controls(dt) {
      if (held.has('KeyW') || held.has('ShiftLeft') || held.has('ShiftRight')) {
        state.throttle = clamp01(state.throttle + dt * 0.55);
      }
      if (held.has('KeyS') || held.has('ControlLeft') || held.has('ControlRight')) {
        state.throttle = clamp01(state.throttle - dt * 0.55);
      }
      let pitch = 0;
      let roll = 0;
      for (const code of held) {
        const action = KEYMAP[code];
        if (action === 'pitchUp') pitch += 1;
        else if (action === 'pitchDown') pitch -= 1;
        else if (action === 'rollLeft') roll -= 1;
        else if (action === 'rollRight') roll += 1;
      }
      // Mouse flying: while the pointer is over the canvas and no keys steer,
      // the stick follows the pointer — right of centre banks right, low
      // on the canvas pulls the nose up, as a yoke does.
      if (state.mouseIn && pitch === 0 && roll === 0) {
        roll = clamp11((state.mouseX - 0.5) * 2.2);
        pitch = clamp11((state.mouseY - 0.5) * 1.6);
      }
      return {
        pitch: clamp11(pitch),
        roll: clamp11(roll),
        throttle: state.throttle,
        brake: held.has('Space'),
      };
    },
    /** True once per physical press of a key code (menus, pause, restart). */
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** Forget pending presses (used when a screen changes under the keys). */
    clearPressed() {
      pressed.clear();
    },
    setThrottle(v) {
      state.throttle = clamp01(v);
    },
    get throttle() {
      return state.throttle;
    },
  };
}

function clamp11(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
