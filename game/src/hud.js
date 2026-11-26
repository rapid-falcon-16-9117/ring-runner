// Ring Runner — everything the pilot reads: the instrument cluster (airspeed,
// attitude, altimeter), compass strip, fuel and damage, the course minimap,
// centre callouts and warnings — and the menu screens (title, briefing,
// results) drawn over the rendered world.

import { ACHIEVEMENTS, MISSIONS } from './course.js';
import { courseX } from './terrain.js';
import { LIVERIES, PHYS, VIEW } from './config.js';
import { SCREEN, formatTime, wrapAngle } from './world.js';

const INK = '#eef4f8';
const DIM = 'rgba(238,244,248,0.72)';
const PANEL = 'rgba(10,16,26,0.55)';
const GOLD = '#ffd34d';

export function drawHud(ctx, world) {
  if (world.screen === SCREEN.PLAY) drawInstruments(ctx, world);
  else if (world.screen === SCREEN.TITLE) drawTitle(ctx, world);
  else if (world.screen === SCREEN.BRIEFING) drawBriefing(ctx, world);
  else if (world.screen === SCREEN.COMPLETE) drawResult(ctx, world, false);
  else if (world.screen === SCREEN.CRASH) drawResult(ctx, world, true);
  else if (world.screen === SCREEN.CAMPAIGN) drawCampaign(ctx, world);
  if (world.toast && world.time < world.toast.until && world.screen === SCREEN.PLAY) {
    drawToast(ctx, world);
  }
}

/** A rounded panel with a soft edge, the HUD's one background trick. */
function panel(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = PANEL;
  ctx.fill();
}

function text(ctx, str, x, y, size, colour = INK, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function drawInstruments(ctx, world) {
  const p = world.plane;
  const W = VIEW.width;
  // — Top-left: sortie identity and clock —
  panel(ctx, 18, 16, 300, 64);
  const title = world.freeFlight ? 'FREE FLIGHT 自由飞行' : `${world.mission.name} ${world.mission.cn}`;
  text(ctx, title, 34, 44, 19);
  text(ctx, `TIME ${formatTime(world.time)}   SCORE ${world.score}`, 34, 68, 15, DIM);
  // — Top-centre: compass strip —
  panel(ctx, W / 2 - 170, 16, 340, 40);
  drawCompass(ctx, world, W / 2, 36);
  // — Top-right: the course minimap —
  drawMinimap(ctx, world, W - 178, 16, 160, 196);
  // — Warnings and callouts —
  drawCallouts(ctx, world);
  // — Bottom cluster: three round instruments —
  const cy = VIEW.height - 92;
  drawGaugeSpeed(ctx, 92, cy, 74, p.speed, p.livery.maxSpeed);
  drawGaugeAttitude(ctx, 252, cy, 74, p);
  drawGaugeAlt(ctx, 412, cy, 74, p.y);
  // — Bottom-right: throttle, fuel, damage —
  panel(ctx, W - 318, VIEW.height - 148, 300, 132);
  bar(ctx, W - 300, VIEW.height - 122, 264, 15, p.throttle, '#ffb84d', `THR ${Math.round(p.throttle * 100)}%`);
  bar(ctx, W - 300, VIEW.height - 84, 264, 15, p.fuel / 100, p.fuel < 20 ? '#ff5d4d' : '#59c2ff', `FUEL ${Math.round(p.fuel)}%`);
  bar(ctx, W - 300, VIEW.height - 46, 264, 15, 1 - p.damage / 100, p.damage > 60 ? '#ff5d4d' : '#7ee787', `HULL ${Math.round(100 - p.damage)}%`);
  // — Bottom-left under the gauges: the numbers, spelled out —
  const hdg = ((Math.round(p.heading * 180 / Math.PI) % 360) + 360) % 360;
  text(ctx, `ALT ${Math.round(p.y)} FT   SPD ${Math.round(p.speed)} KT   HDG ${String(hdg).padStart(3, '0')}°   VS ${p.vy >= 0 ? '+' : ''}${Math.round(p.vy * 60)} FPM`,
    18, VIEW.height - 12, 16, INK);
  const next = world.rings[world.nextRing];
  if (next) {
    const d = Math.hypot(p.x - next.x, p.z - next.z);
    text(ctx, `NEXT RING ${Math.round(d)} FT · ${world.ringsFlown} FLOWN`, W - 18, VIEW.height - 12, 16, GOLD, 'right');
  }
  // Off-screen next ring: an arrow at the frame's edge.
  if (next) drawRingArrow(ctx, world, next);
}

function drawCompass(ctx, world, cx, cy) {
  const p = world.plane;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 160, cy - 18, 320, 36);
  ctx.clip();
  const pxPerDeg = 3.2;
  const hdg = p.heading * 180 / Math.PI;
  for (let d = -60; d <= 60; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const x = cx + (deg - hdg) * pxPerDeg;
    const norm = ((deg % 360) + 360) % 360;
    const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : (norm % 30 === 0 ? String(norm / 10).padStart(2, '0') : null);
    ctx.fillStyle = DIM;
    ctx.fillRect(x - 0.5, cy + 6, 1, label ? 6 : 4);
    if (label) text(ctx, label, x, cy + 2, 13, norm === 0 ? GOLD : INK, 'center', 700);
  }
  ctx.restore();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 16);
  ctx.lineTo(cx + 6, cy - 16);
  ctx.lineTo(cx, cy - 7);
  ctx.closePath();
  ctx.fill();
}

function drawMinimap(ctx, world, x, y, w, h) {
  panel(ctx, x, y, w, h);
  const maxZ = world.freeFlight ? world.plane.z + 9000 : 21500;
  const sx = (wx) => x + w / 2 + (wx / 5200) * (w / 2 - 8);
  const sz = (wz) => y + h - 12 - (wz / maxZ) * (h - 24);
  // Runways.
  ctx.fillStyle = '#cfd6dd';
  const strips = world.freeFlight ? [{ x: courseX(0), z: 0 }] : [world.mission.home, world.mission.dest];
  for (const s of strips) ctx.fillRect(sx(s.x) - 1.5, sz(s.z) - 7, 3, 14);
  // Rings and crates.
  world.rings.forEach((r, i) => {
    ctx.fillStyle = r.state === 'clean' || r.state === 'passed' ? '#58e08a'
      : r.state === 'missed' ? 'rgba(200,90,80,0.6)'
      : i === world.nextRing ? GOLD : 'rgba(127,212,255,0.75)';
    ctx.beginPath();
    ctx.arc(sx(r.x), sz(r.z), i === world.nextRing ? 4.4 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#ffcf4d';
  for (const c of world.crates) {
    if (!c.taken) ctx.fillRect(sx(c.x) - 2.4, sz(c.z) - 2.4, 4.8, 4.8);
  }
  // The aircraft: a little arrow that turns with the nose.
  const p = world.plane;
  ctx.save();
  ctx.translate(sx(p.x), sz(p.z));
  ctx.rotate(p.heading);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  text(ctx, 'COURSE', x + 10, y + 18, 11, DIM);
}

function drawCallouts(ctx, world) {
  const p = world.plane;
  const cx = VIEW.width / 2;
  // Centre message (ring, crate, strike) — fades with its own clock.
  if (world.message && world.time < world.message.until) {
    const left = world.message.until - world.time;
    ctx.globalAlpha = Math.min(1, left / 0.5);
    text(ctx, world.message.text, cx, 168, 40, GOLD, 'center', 800);
    if (world.message.sub) text(ctx, world.message.sub, cx, 198, 19, INK, 'center', 600);
    ctx.globalAlpha = 1;
  }
  // Warnings, in the order a pilot would want them.
  let wy = 248;
  const warn = (str, colour) => { text(ctx, str, cx, wy, 24, colour, 'center', 800); wy += 32; };
  if (p.stalled) warn('STALL', '#ff5d4d');
  if (p.airborne && p.fuel <= 0) warn('ENGINE OUT — GLIDE', '#ff5d4d');
  else if (p.airborne && p.fuel < 18) warn('LOW FUEL', '#ffb84d');
  if (world.inStorm) warn('STORM CELL', '#ffb84d');
  if (p.airborne && p.damage > 65) warn('AIRFRAME CRITICAL', '#ff5d4d');
}

function drawRingArrow(ctx, world, ring) {
  const p = world.plane;
  const bearing = Math.atan2(ring.x - p.x, ring.z - p.z);
  const rel = wrapAngle(bearing - p.heading);
  if (Math.abs(rel) < 0.5) return; // roughly ahead: the ring itself is the guide
  const cx = VIEW.width / 2;
  const cy = VIEW.height / 2 - 60;
  const R = 330;
  const x = cx + Math.sin(rel) * R;
  const y = cy + (rel > Math.PI / 2 || rel < -Math.PI / 2 ? 60 : -Math.abs(rel) * 20);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rel);
  ctx.fillStyle = 'rgba(255,211,77,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(9, 9);
  ctx.lineTo(0, 3);
  ctx.lineTo(-9, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGaugeShell(ctx, x, y, r, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,12,20,0.82)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(200,220,235,0.55)';
  ctx.stroke();
  text(ctx, label, x, y + r - 9, 11, DIM, 'center', 700);
}

function needle(ctx, x, y, angle, len, colour = '#ffb84d') {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * len * 0.22, y - Math.sin(angle) * len * 0.22);
  ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
  ctx.stroke();
}

function drawGaugeSpeed(ctx, x, y, r, speed, maxSpeed) {
  drawGaugeShell(ctx, x, y, r, 'SPD KT');
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  for (let v = 0; v <= 240; v += 40) {
    const a = a0 + (v / 260) * sweep;
    const tx = x + Math.cos(a) * (r - 13);
    const ty = y + Math.sin(a) * (r - 13);
    text(ctx, String(v), tx, ty + 4, 10.5, DIM, 'center', 700);
  }
  // Stall band in red.
  ctx.strokeStyle = 'rgba(255,93,77,0.85)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, r - 5, a0, a0 + (PHYS.stallSpeed / 260) * sweep);
  ctx.stroke();
  needle(ctx, x, y, a0 + (Math.min(speed, 260) / 260) * sweep, r - 20);
  text(ctx, String(Math.round(speed)), x, y + 22, 17, INK, 'center', 800);
  void maxSpeed;
}

function drawGaugeAlt(ctx, x, y, r, alt) {
  drawGaugeShell(ctx, x, y, r, 'ALT FT');
  const a0 = -Math.PI / 2;
  for (let v = 0; v <= 4000; v += 1000) {
    const a = a0 + (v / 5000) * Math.PI * 2;
    const tx = x + Math.cos(a) * (r - 13);
    const ty = y + Math.sin(a) * (r - 13);
    text(ctx, String(v / 1000), tx, ty + 4, 11, DIM, 'center', 700);
  }
  needle(ctx, x, y, a0 + ((alt % 1000) / 5000) * Math.PI * 2, r - 18, '#eef4f8');
  needle(ctx, x, y, a0 + ((alt % 5000) / 5000) * Math.PI * 2, r - 30, '#ffb84d');
  text(ctx, String(Math.round(alt)), x, y + 22, 17, INK, 'center', 800);
}

function drawGaugeAttitude(ctx, x, y, r, p) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-p.roll);
  const pitchPx = p.pitch * 90;
  ctx.fillStyle = '#3d7ab8';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r * 2);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(-r, pitchPx, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-r, pitchPx - 1, r * 2, 2);
  for (const d of [-20, -10, 10, 20]) {
    const yy = pitchPx - d * 1.6;
    ctx.fillRect(-13, yy, 26, 1.6);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(200,220,235,0.55)';
  ctx.stroke();
  // The fixed aircraft symbol.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x - 30, y);
  ctx.lineTo(x - 9, y);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x + 9, y);
  ctx.lineTo(x + 30, y);
  ctx.stroke();
  text(ctx, 'ATT', x, y + r - 9, 11, DIM, 'center', 700);
}

function bar(ctx, x, y, w, h, frac, colour, label) {
  text(ctx, label, x, y - 5, 13, DIM);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawToast(ctx, world) {
  const w = 430;
  const x = VIEW.width / 2 - w / 2;
  panel(ctx, x, 66, w, 44, 22);
  text(ctx, `★ ACHIEVEMENT — ${world.toast.text}`, VIEW.width / 2, 95, 17, GOLD, 'center', 800);
}

// ——— Screens ———

function drawTitle(ctx, world) {
  const W = VIEW.width;
  ctx.fillStyle = 'rgba(8,12,24,0.34)';
  ctx.fillRect(0, 0, W, VIEW.height);
  text(ctx, 'RING RUNNER', W / 2, 148, 84, '#ffffff', 'center', 900);
  text(ctx, '环 线 飞 行', W / 2, 196, 30, GOLD, 'center', 700);
  text(ctx, 'Thread the rings. Mind the fuel. Land like you mean it.', W / 2, 232, 19, DIM, 'center', 500);
  // Aircraft picker.
  const liv = LIVERIES[world.liveryIndex];
  panel(ctx, W / 2 - 330, 262, 660, 92);
  text(ctx, `‹  ${liv.name} ${liv.cn}  ›`, W / 2, 300, 30, INK, 'center', 800);
  text(ctx, `${liv.blurb}  ·  ${liv.maxSpeed} KT · TURN ×${liv.turnFactor}`, W / 2, 330, 15.5, DIM, 'center', 500);
  // Mission list.
  panel(ctx, W / 2 - 330, 372, 660, 178);
  MISSIONS.forEach((m, i) => {
    const y = 408 + i * 48;
    const open = i < world.unlocked;
    const sel = i === world.missionIndex;
    if (sel) {
      ctx.fillStyle = 'rgba(255,211,77,0.16)';
      ctx.fillRect(W / 2 - 314, y - 26, 628, 38);
    }
    text(ctx, open ? `${sel ? '▶' : ' '} ${i + 1}. ${m.name} ${m.cn} — ${m.ringCount} rings · ${m.crateCount} crates` : `🔒 ${i + 1}. ${m.name} — finish the previous sortie`,
      W / 2 - 296, y, 17.5, open ? INK : 'rgba(238,244,248,0.4)');
  });
  text(ctx, '↑↓ choose sortie · ←→ choose aircraft · ENTER fly · F free flight', W / 2, 592, 17, INK, 'center', 600);
  text(ctx, 'Fly: ←→ bank · ↑↓ pitch · W/S throttle · mouse steers too · wheel = throttle · SPACE brake · P pause', W / 2, 622, 14.5, DIM, 'center', 500);
  const got = ACHIEVEMENTS.filter((a) => world.achievements.has(a.id)).length;
  text(ctx, `Achievements ${got}/${ACHIEVEMENTS.length} · Campaign score ${world.campaignScore}`, W / 2, 656, 14.5, GOLD, 'center', 600);
}

function drawBriefing(ctx, world) {
  const W = VIEW.width;
  const m = world.mission;
  ctx.fillStyle = 'rgba(8,12,24,0.42)';
  ctx.fillRect(0, 0, W, VIEW.height);
  panel(ctx, W / 2 - 400, 168, 800, 380);
  if (world.freeFlight) {
    text(ctx, 'FREE FLIGHT 自由飞行', W / 2, 232, 34, INK, 'center', 800);
    text(ctx, 'An endless chain of rings over the coast. Every ring buys fuel;', W / 2, 286, 18, DIM, 'center', 500);
    text(ctx, 'every miss costs you sky. Land back home when you have had enough.', W / 2, 314, 18, DIM, 'center', 500);
  } else {
    text(ctx, `${m.name} ${m.cn}`, W / 2, 232, 34, INK, 'center', 800);
    text(ctx, m.zone === 'coast' ? 'VERDANT COAST' : m.zone === 'mesa' ? 'RED MESA CANYON' : 'ALPINE DUSK', W / 2, 262, 14, GOLD, 'center', 700);
    wrapText(ctx, m.brief, W / 2, 306, 660, 25, 17.5);
    text(ctx, `${m.ringCount} RINGS · ${m.crateCount} CRATES · PAR ${formatTime(m.parTime)} · FUEL ${m.fuel}%`, W / 2, 428, 17, INK, 'center', 700);
  }
  text(ctx, `Aircraft: ${LIVERIES[world.liveryIndex].name} ${LIVERIES[world.liveryIndex].cn}`, W / 2, 470, 16, DIM, 'center', 600);
  text(ctx, 'ENTER — throttle up and fly · ESC — back', W / 2, 512, 17, GOLD, 'center', 700);
}

function wrapText(ctx, str, cx, y, maxWidth, lineHeight, size) {
  ctx.font = `500 ${size}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (ctx.measureText(line + ' ' + word).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, cx, y + i * lineHeight, size, DIM, 'center', 500));
}

function drawResult(ctx, world, crashed) {
  const W = VIEW.width;
  ctx.fillStyle = crashed ? 'rgba(30,6,6,0.45)' : 'rgba(6,20,10,0.42)';
  ctx.fillRect(0, 0, W, VIEW.height);
  const r = world.result;
  panel(ctx, W / 2 - 360, 190, 720, 330);
  text(ctx, r.title.toUpperCase(), W / 2, 262, 40, crashed ? '#ff8d7d' : GOLD, 'center', 900);
  r.lines.forEach((line, i) => {
    wrapText(ctx, line, W / 2, 316 + i * 34, 620, 26, 17.5);
  });
  text(ctx, `SORTIE SCORE ${world.score}`, W / 2, 316 + r.lines.length * 34 + 16, 22, INK, 'center', 800);
  text(ctx, crashed ? 'R — fly it again · ESC — title' : 'ENTER — next · R — fly again · ESC — title', W / 2, 486, 16.5, DIM, 'center', 600);
}

function drawCampaign(ctx, world) {
  const W = VIEW.width;
  ctx.fillStyle = 'rgba(10,14,30,0.5)';
  ctx.fillRect(0, 0, W, VIEW.height);
  panel(ctx, W / 2 - 380, 150, 760, 430);
  text(ctx, 'CAMPAIGN COMPLETE', W / 2, 222, 42, GOLD, 'center', 900);
  text(ctx, '全 线 贯 通', W / 2, 262, 22, INK, 'center', 700);
  text(ctx, `Final sortie: ${world.result ? world.result.grade : ''} landing · ${world.score} points`, W / 2, 316, 18, DIM, 'center', 600);
  text(ctx, `CAMPAIGN SCORE ${world.campaignScore}`, W / 2, 362, 30, INK, 'center', 900);
  const names = ACHIEVEMENTS.filter((a) => world.achievements.has(a.id)).map((a) => a.name).join(' · ') || '—';
  wrapText(ctx, `Achievements: ${names}`, W / 2, 410, 640, 24, 16);
  text(ctx, 'ENTER — back to title · F — free flight', W / 2, 540, 16.5, DIM, 'center', 600);
}
