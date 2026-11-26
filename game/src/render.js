// Ring Runner — the pseudo-3D renderer. The camera sits behind the aircraft;
// the world is projected point by point (rotate by heading, divide by depth)
// and painted far to near: sky, ridges, farmland cells, terrain features,
// rings and crates, weather, birds, then the aircraft itself in the frame.
// Everything is drawn in code — there are no image assets to load.

import { CELL, VIEW, VIEW_DIST } from './config.js';
import { hash2 } from './random.js';
import { courseX } from './terrain.js';

const FOCAL = VIEW.height * 1.12;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fogCache = new Map();

  /** Mix a #rrggbb colour toward the zone fog by t (0..1), cached per band. */
  function fogged(colour, fog, t) {
    const band = Math.round(t * 12);
    const key = colour + fog + band;
    let out = fogCache.get(key);
    if (out) return out;
    const a = parseInt(colour.slice(1), 16);
    const b = parseInt(fog.slice(1), 16);
    const k = band / 12;
    const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k);
    const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k);
    const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * k);
    out = `rgb(${r},${g},${bl})`;
    fogCache.set(key, out);
    return out;
  }

  function draw(world) {
    const cam = world.camera;
    const zone = world.terrain.zone;
    const horizonY = VIEW.height * 0.48 + Math.tan(cam.pitch) * FOCAL * 0.5;
    const sinH = Math.sin(cam.heading);
    const cosH = Math.cos(cam.heading);

    /** World point -> screen point, or null when behind the camera. */
    function project(x, y, z) {
      const dx = x - cam.x;
      const dz = z - cam.z;
      const cx = dx * cosH - dz * sinH;
      const cz = dx * sinH + dz * cosH;
      if (cz < 12) return null;
      return {
        sx: VIEW.width / 2 + (cx / cz) * FOCAL,
        sy: horizonY - ((y - cam.y) / cz) * FOCAL,
        cz,
        scale: FOCAL / cz,
      };
    }

    drawSky(zone, horizonY, cam.heading);
    drawGround(world, project, horizonY);
    drawRunways(world, project);
    drawTerrainFeatures(world, project);
    drawClouds(world, project, false);
    drawStorms(world, project);
    drawRings(world, project);
    drawCrates(world, project);
    drawBirds(world, project);
    drawPlane(world, horizonY);
    drawClouds(world, project, true);
    // A breath of vignette to sit the frame down.
    const v = ctx.createRadialGradient(640, 400, 420, 640, 400, 900);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,10,30,0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawSky(zone, horizonY, heading) {
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    g.addColorStop(0, zone.sky[0]);
    g.addColorStop(0.62, zone.sky[1]);
    g.addColorStop(1, zone.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, Math.max(0, horizonY + 1));
    // Sun: a soft disc fixed to the sky, sliding with heading.
    const sunX = ((zone.sun.x - heading / (Math.PI * 2)) % 1 + 1) % 1 * VIEW.width * 1.4 - VIEW.width * 0.2;
    const sunY = zone.sun.y * VIEW.height;
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    sg.addColorStop(0, zone.sun.colour);
    sg.addColorStop(0.25, zone.sun.colour + 'cc');
    sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    // Two ridge lines, far and near, their teeth hashed from the world so
    // they slide past like real headlands as the heading changes.
    ridgeLine(horizonY, heading * 900, 46, zone.ridgeFar, 0.55);
    ridgeLine(horizonY, heading * 1600 + 300, 84, zone.ridge, 0.8);
  }

  function ridgeLine(baseY, offset, amp, colour, alpha) {
    ctx.beginPath();
    ctx.moveTo(-4, baseY + 2);
    for (let sx = -4; sx <= VIEW.width + 40; sx += 40) {
      const i = Math.floor((sx + offset) / 40);
      const h = hash2(i, 99, 5) * amp + hash2(i, 7, 11) * amp * 0.4;
      ctx.lineTo(sx, baseY - h);
    }
    ctx.lineTo(VIEW.width + 4, baseY + 2);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(world, project, horizonY) {
    const zone = world.terrain.zone;
    const terrain = world.terrain;
    ctx.fillStyle = zone.ground[0];
    ctx.fillRect(0, horizonY, VIEW.width, VIEW.height - horizonY);
    const cam = world.camera;
    const ciX = Math.floor(cam.x / CELL);
    const ciZ = Math.floor(cam.z / CELL);
    const span = Math.ceil(VIEW_DIST / CELL) + 1;
    // Far to near so nearer fields paint over farther ones.
    for (let iz = ciZ + span; iz >= ciZ - 2; iz -= 1) {
      for (let ix = ciX - span; ix <= ciX + span; ix += 1) {
        const cx = ix * CELL;
        const cz = iz * CELL;
        const centre = project(cx + CELL / 2, 0, cz + CELL / 2);
        if (!centre || centre.cz > VIEW_DIST) continue;
        const corners = [
          project(cx, 0, cz),
          project(cx + CELL, 0, cz),
          project(cx + CELL, 0, cz + CELL),
          project(cx, 0, cz + CELL),
        ];
        if (corners.some((c) => !c)) continue;
        const water = terrain.isWater(cx + CELL / 2, cz + CELL / 2);
        const palette = water ? zone.water : zone.ground;
        const base = palette[terrain.cellTint(ix, iz) % palette.length];
        ctx.beginPath();
        ctx.moveTo(corners[0].sx, corners[0].sy);
        for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].sx, corners[i].sy);
        ctx.closePath();
        ctx.fillStyle = fogged(base, zone.fog, Math.min(1, centre.cz / VIEW_DIST));
        ctx.fill();
      }
    }
  }

  function quad(project, pts, fill) {
    const ps = pts.map((p) => project(p[0], p[1], p[2]));
    if (ps.some((p) => !p)) return;
    ctx.beginPath();
    ctx.moveTo(ps[0].sx, ps[0].sy);
    for (let i = 1; i < ps.length; i += 1) ctx.lineTo(ps[i].sx, ps[i].sy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawRunways(world, project) {
    const strips = world.freeFlight
      ? [{ x: courseX(0), z: 0, length: 2600, width: 110 }]
      : [world.mission.home, world.mission.dest];
    for (const s of strips) {
      const hw = s.width / 2;
      const z0 = s.z - s.length / 2;
      const z1 = s.z + s.length / 2;
      quad(project, [[s.x - hw, 1, z0], [s.x + hw, 1, z0], [s.x + hw, 1, z1], [s.x - hw, 1, z1]], '#3c3f45');
      // Edge lines and a dashed centreline: the runway's grammar.
      quad(project, [[s.x - hw + 6, 1.2, z0], [s.x - hw + 11, 1.2, z0], [s.x - hw + 11, 1.2, z1], [s.x - hw + 6, 1.2, z1]], '#e8e8e2');
      quad(project, [[s.x + hw - 11, 1.2, z0], [s.x + hw - 6, 1.2, z0], [s.x + hw - 6, 1.2, z1], [s.x + hw - 11, 1.2, z1]], '#e8e8e2');
      for (let i = 0; i < 9; i += 1) {
        const dz = z0 + 120 + i * 260;
        quad(project, [[s.x - 4, 1.2, dz], [s.x + 4, 1.2, dz], [s.x + 4, 1.2, dz + 110], [s.x - 4, 1.2, dz + 110]], '#f5f2df');
      }
      // Threshold bars at both ends.
      for (const endZ of [z0 + 26, z1 - 90]) {
        for (let b = -2; b <= 2; b += 1) {
          if (b === 0) continue;
          quad(project, [[s.x + b * 20 - 6, 1.2, endZ], [s.x + b * 20 + 6, 1.2, endZ], [s.x + b * 20 + 6, 1.2, endZ + 60], [s.x + b * 20 - 6, 1.2, endZ + 60]], '#f5f2df');
        }
      }
    }
  }

  function drawTerrainFeatures(world, project) {
    const terrain = world.terrain;
    const zone = terrain.zone;
    const cam = world.camera;
    // Mesas: flat-topped boxes with a lit top and shaded flanks.
    for (const m of terrain.mesas) {
      const c = project(m.x, m.h, m.z);
      if (!c || c.cz > VIEW_DIST) continue;
      const hw = m.w / 2;
      const hd = m.d / 2;
      const top = ['#d99a5f', '#cf9054', '#c28447'][Math.floor(m.tint * 3)];
      const side = ['#9c5f31', '#8a4f2c'][Math.floor(m.tint * 2)];
      quad(project, [[m.x - hw, 0, m.z + hd], [m.x + hw, 0, m.z + hd], [m.x + hw, m.h, m.z + hd], [m.x - hw, m.h, m.z + hd]], side);
      if (cam.x < m.x) quad(project, [[m.x + hw, 0, m.z - hd], [m.x + hw, 0, m.z + hd], [m.x + hw, m.h, m.z + hd], [m.x + hw, m.h, m.z - hd]], side);
      else quad(project, [[m.x - hw, 0, m.z + hd], [m.x - hw, 0, m.z - hd], [m.x - hw, m.h, m.z - hd], [m.x - hw, m.h, m.z + hd]], side);
      quad(project, [[m.x - hw, m.h, m.z - hd], [m.x + hw, m.h, m.z - hd], [m.x + hw, m.h, m.z + hd], [m.x - hw, m.h, m.z + hd]], fogged(top, zone.fog, Math.min(1, c.cz / VIEW_DIST)));
    }
    // Peaks: cones with snow on the top third.
    for (const p of terrain.peaks) {
      const apex = project(p.x, p.h, p.z);
      if (!apex || apex.cz > VIEW_DIST) continue;
      const left = project(p.x - p.r, 0, p.z);
      const right = project(p.x + p.r, 0, p.z);
      if (!left || !right) continue;
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy);
      ctx.lineTo(apex.sx, apex.sy);
      ctx.lineTo(right.sx, right.sy);
      ctx.closePath();
      ctx.fillStyle = fogged(zone.ridge, zone.fog, Math.min(1, apex.cz / VIEW_DIST));
      ctx.fill();
      const snowL = { sx: apex.sx + (left.sx - apex.sx) * 0.32, sy: apex.sy + (left.sy - apex.sy) * 0.32 };
      const snowR = { sx: apex.sx + (right.sx - apex.sx) * 0.32, sy: apex.sy + (right.sy - apex.sy) * 0.32 };
      ctx.beginPath();
      ctx.moveTo(snowL.sx, snowL.sy);
      ctx.lineTo(apex.sx, apex.sy);
      ctx.lineTo(snowR.sx, snowR.sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,248,252,0.92)';
      ctx.fill();
    }
    // Lighthouses: banded towers on the coast.
    for (const l of terrain.landmarks) {
      const base = project(l.x, 0, l.z);
      if (!base || base.cz > VIEW_DIST) continue;
      const top = project(l.x, l.h, l.z);
      const w = Math.max(1.5, 26 * base.scale);
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(top.sx - w / 2, top.sy, w, base.sy - top.sy);
      ctx.fillStyle = '#c23b2e';
      ctx.fillRect(top.sx - w / 2, top.sy + (base.sy - top.sy) * 0.3, w, (base.sy - top.sy) * 0.18);
      ctx.fillRect(top.sx - w / 2, top.sy + (base.sy - top.sy) * 0.62, w, (base.sy - top.sy) * 0.18);
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(top.sx - w * 0.4, top.sy - w * 0.5, w * 0.8, w * 0.5);
    }
    // Trees: little conifer triangles on the wooded cells near the route.
    const ciX = Math.floor(cam.x / CELL);
    const ciZ = Math.floor(cam.z / CELL);
    let drawn = 0;
    for (let iz = ciZ + 5; iz >= ciZ && drawn < 110; iz -= 1) {
      for (let ix = ciX - 5; ix <= ciX + 5 && drawn < 110; ix += 1) {
        if (!terrain.cellWooded(ix, iz) || terrain.isWater(ix * CELL, iz * CELL)) continue;
        for (let t = 0; t < 3; t += 1) {
          const tx = ix * CELL + hash2(ix, iz, 31 + t) * CELL;
          const tz = iz * CELL + hash2(ix, iz, 47 + t) * CELL;
          const th = terrain.heightAt(tx, tz);
          const base = project(tx, th, tz);
          if (!base || base.cz > 3200) continue;
          const h = 46 * base.scale;
          const w = 15 * base.scale;
          if (h < 2) continue;
          ctx.beginPath();
          ctx.moveTo(base.sx - w, base.sy);
          ctx.lineTo(base.sx, base.sy - h);
          ctx.lineTo(base.sx + w, base.sy);
          ctx.closePath();
          ctx.fillStyle = fogged('#2f5d33', zone.fog, Math.min(1, base.cz / VIEW_DIST));
          ctx.fill();
          drawn += 1;
        }
      }
    }
  }

  function drawClouds(world, project, nearLayer) {
    const cam = world.camera;
    const cell = 3000;
    const ciX = Math.floor(cam.x / cell);
    const ciZ = Math.floor(cam.z / cell);
    for (let iz = ciZ; iz <= ciZ + 4; iz += 1) {
      for (let ix = ciX - 2; ix <= ciX + 2; ix += 1) {
        const h = hash2(ix, iz, 77);
        if (h < 0.42) continue;
        const cx = ix * cell + h * 1400;
        const cz = iz * cell + hash2(ix, iz, 78) * 1400;
        const cy = 2000 + h * 800;
        const c = project(cx, cy, cz);
        if (!c) continue;
        const isNear = c.cz < 1500;
        if (isNear !== nearLayer) continue;
        const r = 340 * c.scale;
        if (r < 6 || r > 700) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (const [ox, oy, orr] of [[0, 0, 1], [-0.7, 0.16, 0.66], [0.72, 0.14, 0.7], [0.1, -0.22, 0.6]]) {
          ctx.beginPath();
          ctx.ellipse(c.sx + ox * r, c.sy + oy * r * 0.4, r * orr, r * orr * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawStorms(world, project) {
    for (const s of world.storms) {
      const base = project(s.x, 0, s.z);
      if (!base || base.cz > VIEW_DIST) continue;
      // A dark anvil column: stacked translucent puffs from ground to cap.
      for (let i = 0; i < 5; i += 1) {
        const y = 300 + i * 430;
        const c = project(s.x, y, s.z);
        if (!c) continue;
        const r = s.r * (0.75 + i * 0.09) * c.scale;
        ctx.fillStyle = `rgba(38,38,52,${0.16 + i * 0.03})`;
        ctx.beginPath();
        ctx.ellipse(c.sx, c.sy, r, r * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(20,20,34,0.25)';
      ctx.beginPath();
      ctx.ellipse(base.sx, base.sy, s.r * base.scale, s.r * base.scale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(world, project) {
    const t = world.time;
    for (let i = world.rings.length - 1; i >= 0; i -= 1) {
      const ring = world.rings[i];
      const c = project(ring.x, ring.y, ring.z);
      if (!c || c.cz > VIEW_DIST) continue;
      const radius = ring.r * c.scale;
      if (radius < 3) continue;
      const isNext = i === world.nextRing;
      let colour = '#7fd4ff';
      if (ring.state === 'clean') colour = '#58e08a';
      else if (ring.state === 'passed') colour = '#3fae72';
      else if (ring.state === 'missed') colour = 'rgba(200,90,80,0.55)';
      else if (isNext) colour = '#ffd34d';
      ctx.save();
      if (isNext && ring.state === 'pending') {
        const pulse = 1 + Math.sin(t * 4) * 0.05;
        ctx.shadowColor = '#ffd34d';
        ctx.shadowBlur = 22;
        ctx.lineWidth = Math.max(2, radius * 0.13);
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.ellipse(c.sx, c.sy, radius * pulse, radius * pulse * 0.94, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Chevrons pointing the way through.
        ctx.fillStyle = 'rgba(255,211,77,0.85)';
        for (const f of [0.42, 0.62]) {
          ctx.beginPath();
          ctx.moveTo(c.sx - radius * 0.16, c.sy - radius * f);
          ctx.lineTo(c.sx + radius * 0.16, c.sy - radius * f);
          ctx.lineTo(c.sx, c.sy - radius * (f - 0.17));
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.lineWidth = Math.max(1.5, radius * 0.11);
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.ellipse(c.sx, c.sy, radius, radius * 0.94, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawCrates(world, project) {
    const t = world.time;
    for (const crate of world.crates) {
      if (crate.taken) continue;
      const bobY = crate.y + Math.sin(t * 1.6 + crate.z) * 7;
      const c = project(crate.x, bobY, crate.z);
      if (!c || c.cz > VIEW_DIST) continue;
      const s = 30 * c.scale;
      if (s < 2) continue;
      ctx.save();
      ctx.shadowColor = '#ffcf4d';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#d9a441';
      ctx.translate(c.sx, c.sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.rotate(-Math.PI / 4);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#7a5514';
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.strokeRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72);
      // A little parachute canopy above the box.
      ctx.beginPath();
      ctx.arc(0, -s * 1.15, s * 0.62, Math.PI, 0);
      ctx.fillStyle = '#e8e4da';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBirds(world, project) {
    ctx.strokeStyle = 'rgba(24,24,30,0.9)';
    ctx.lineCap = 'round';
    for (const b of world.birds) {
      const c = project(b.x, b.y, b.z);
      if (!c || c.cz > 4000) continue;
      const s = Math.max(2, 26 * c.scale);
      const flap = Math.sin(world.time * 9 + b.phase) * s * 0.5;
      ctx.lineWidth = Math.max(1, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(c.sx - s, c.sy - flap);
      ctx.quadraticCurveTo(c.sx - s * 0.3, c.sy + s * 0.3, c.sx, c.sy);
      ctx.quadraticCurveTo(c.sx + s * 0.3, c.sy + s * 0.3, c.sx + s, c.sy - flap);
      ctx.stroke();
      // Two companions trail each flock leader.
      for (const [ox, oy] of [[-1.9, 0.7], [1.7, 0.9]]) {
        ctx.beginPath();
        ctx.moveTo(c.sx + ox * s - s * 0.7, c.sy + oy * s - flap * 0.7);
        ctx.quadraticCurveTo(c.sx + ox * s, c.sy + oy * s + s * 0.2, c.sx + ox * s + s * 0.7, c.sy + oy * s - flap * 0.7);
        ctx.stroke();
      }
    }
  }

  /** The aircraft, drawn from behind at its chase anchor, plus its shadow. */
  function drawPlane(world, horizonY) {
    const p = world.plane;
    if (!p) return;
    // Ground shadow first: a soft ellipse that shrinks and fades with height.
    const groundH = world.terrain.heightAt(p.x, p.z);
    const heightAbove = Math.max(0, p.y - groundH);
    // (Projected by the caller path: recompute with the same camera maths.)
    // We reuse draw()'s projection via a fresh closure below.
    drawPlaneShadow(world, heightAbove);
    const cx = VIEW.width / 2 - p.roll * 46 + (world.shake > 0 ? (Math.sin(world.time * 61) * 5 * world.shake) : 0);
    const cy = horizonY + VIEW.height * 0.17 + p.pitch * 60 + (world.shake > 0 ? Math.cos(world.time * 53) * 4 * world.shake : 0);
    const W = 330; // wingspan on screen, px
    const L = LiveryOf(p);
    ctx.save();
    ctx.translate(cx, cy);
    // Positive roll is a right bank: the right wingtip drops, which on
    // screen is a clockwise tilt — canvas rotation is clockwise-positive.
    ctx.rotate(p.roll * 0.55);
    // Wings: one broad trapezoid, trim tips.
    ctx.fillStyle = L.body;
    ctx.beginPath();
    ctx.moveTo(-W / 2, 6);
    ctx.lineTo(-W * 0.16, -8);
    ctx.lineTo(W * 0.16, -8);
    ctx.lineTo(W / 2, 6);
    ctx.lineTo(W * 0.3, 15);
    ctx.lineTo(-W * 0.3, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = L.trim;
    ctx.fillRect(-W / 2, 4, W * 0.09, 9);
    ctx.fillRect(W / 2 - W * 0.09, 4, W * 0.09, 9);
    // Nav lights: red port, green starboard.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(-W / 2 + 4, 9, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4dff7a';
    ctx.beginPath(); ctx.arc(W / 2 - 4, 9, 3.4, 0, Math.PI * 2); ctx.fill();
    // Tailplane.
    ctx.fillStyle = L.body;
    ctx.beginPath();
    ctx.moveTo(-W * 0.17, -34);
    ctx.lineTo(W * 0.17, -34);
    ctx.lineTo(W * 0.13, -26);
    ctx.lineTo(-W * 0.13, -26);
    ctx.closePath();
    ctx.fill();
    // Fuselage: a rounded body running up the frame, fin on top.
    const fg = ctx.createLinearGradient(-26, 0, 26, 0);
    fg.addColorStop(0, L.dark);
    fg.addColorStop(0.5, L.body);
    fg.addColorStop(1, L.dark);
    ctx.fillStyle = fg;
    roundRectPath(-24, -64, 48, 84, 20);
    ctx.fill();
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.lineTo(13, -58);
    ctx.lineTo(-13, -58);
    ctx.closePath();
    ctx.fill();
    // Canopy with a sky glint.
    const cg = ctx.createLinearGradient(-12, -52, 12, -20);
    cg.addColorStop(0, '#bfe2f2');
    cg.addColorStop(0.5, '#5d87a8');
    cg.addColorStop(1, '#2c4258');
    ctx.fillStyle = cg;
    roundRectPath(-13, -50, 26, 34, 11);
    ctx.fill();
    // Propeller: a blurred disc and a spinner, spinning with the phase.
    ctx.fillStyle = 'rgba(30,30,36,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 30, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,26,0.5)';
    ctx.lineWidth = 3;
    const pa = p.propPhase % Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(pa) * -28, 24 + Math.sin(pa) * -32);
    ctx.lineTo(Math.cos(pa) * 28, 24 + Math.sin(pa) * 32);
    ctx.stroke();
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.arc(0, 24, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlaneShadow(world, heightAbove) {
    // Cheap ground shadow: project the point under the aircraft.
    const cam = world.camera;
    const p = world.plane;
    const groundH = world.terrain.heightAt(p.x, p.z);
    const dx = p.x - cam.x;
    const dz = p.z - cam.z;
    const cx = dx * Math.cos(cam.heading) - dz * Math.sin(cam.heading);
    const cz = dx * Math.sin(cam.heading) + dz * Math.cos(cam.heading);
    if (cz < 12) return;
    const horizonY = VIEW.height * 0.48 + Math.tan(cam.pitch) * FOCAL * 0.5;
    const sx = VIEW.width / 2 + (cx / cz) * FOCAL;
    const sy = horizonY - ((groundH - cam.y) / cz) * FOCAL;
    const fade = Math.max(0, 1 - heightAbove / 900);
    if (fade <= 0) return;
    const r = (FOCAL / cz) * (30 + heightAbove * 0.02);
    ctx.fillStyle = `rgba(15,20,15,${0.34 * fade})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function LiveryOf(p) {
    return p.livery;
  }

  return { draw };
}
