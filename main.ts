// Ring Runner 环线飞行 — the hand-in program for make.fun's
// best-flight-game-20261126-0057 bounty.
//
// The game is a static site living in game/ next to this file: no build
// step, no network, just index.html and its ES modules. This program's one
// job is to deliver that site to the grader exactly as the bounty asks:
//
//   1. Inspect game/ and screenshots/ and stop early, with a plain reason,
//      if anything sits outside the limits the gate enforces — so a bad
//      entry fails here, on the maker's machine, instead of in the sealed
//      scorer where the fix would cost a submission.
//   2. Copy both folders into the output directory.
//   3. Ask the vendored library (vendor/makefun-game.ts, the kit's own
//      copy, untouched) to summarise the copied folders as dossier.json,
//      and write that file last.
//
// In the grader the output directory is /output; everywhere else the
// MAKEFUN_OUTPUT_DIR environment variable names it instead:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Node 22, standard library only.

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's limits for this bounty, named once and used by both the
// pre-flight inspection below and the dossier build at the end.
const LIMITS = {
  gameEntries: 993, // files and directories under game/, together
  gameBytes: 48 * 1024 * 1024, // 48 MiB of game files in all
  gamePathBytes: 1000, // any one path under game/, in UTF-8 bytes
  shotsLeast: 3,
  shotsMost: 4,
  shotBytes: 256 * 1024, // 256 KiB a screenshot
  dossierTextBytes: 160 * 1024, // 160 KiB of source text in the dossier
};

/** Stop the hand-in with a reason the maker can act on. */
function bail(reason) {
  console.error(`ring-runner hand-in stopped: ${reason}`);
  process.exit(1);
}

/**
 * Count a folder tree: how many entries it holds, how many bytes its files
 * weigh, and whether every path stays under the gate's path cap. Paths are
 * measured relative to the tree's own root, the way the gate measures them.
 */
function measureTree(dir, prefix) {
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if (Buffer.byteLength(rel, 'utf8') > LIMITS.gamePathBytes) {
      bail(`game/${rel} runs past the ${LIMITS.gamePathBytes}-byte path limit`);
    }
    const info = lstatSync(join(dir, name));
    if (info.isSymbolicLink()) {
      // The gate takes plain files and directories only; a link could
      // point outside game/ and smuggle in bytes nobody reviewed.
      bail(`game/${rel} is a symbolic link — the gate takes plain files only`);
    }
    entries += 1;
    if (info.isDirectory()) {
      const inner = measureTree(join(dir, name), rel);
      entries += inner.entries;
      bytes += inner.bytes;
    } else if (info.isFile()) {
      bytes += info.size;
    }
  }
  return { entries, bytes };
}

// --- Inspect the game -------------------------------------------------
const gameDir = join(root, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  bail('game/index.html is missing — there is no game to hand in');
}
const gameSize = measureTree(gameDir, '');
if (gameSize.entries > LIMITS.gameEntries) {
  bail(`game/ holds ${gameSize.entries} entries, over the ${LIMITS.gameEntries} limit`);
}
if (gameSize.bytes > LIMITS.gameBytes) {
  bail(`game/ weighs ${gameSize.bytes} bytes, over the ${LIMITS.gameBytes}-byte limit`);
}

// --- Inspect the screenshots -------------------------------------------
const shotsDir = join(root, 'screenshots');
const IMAGE_NAME = /\.(?:png|jpe?g)$/i;
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir)
      .filter((name) => IMAGE_NAME.test(name) && !name.startsWith('.'))
      .sort()
  : [];
if (shotNames.length < LIMITS.shotsLeast || shotNames.length > LIMITS.shotsMost) {
  bail(
    `screenshots/ holds ${shotNames.length} image(s); the gate takes ` +
      `${LIMITS.shotsLeast} or ${LIMITS.shotsMost}`,
  );
}
for (const name of shotNames) {
  const file = join(shotsDir, name);
  const size = statSync(file).size;
  if (size > LIMITS.shotBytes) {
    bail(`screenshots/${name} is ${size} bytes, over the ${LIMITS.shotBytes}-byte limit`);
  }
  // A screenshot must be a whole PNG or JPEG, never a renamed anything:
  // check the magic bytes the format itself starts with.
  const head = readFileSync(file).subarray(0, 4);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isPng =
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (!isJpeg && !isPng) {
    bail(`screenshots/${name} starts with neither JPEG nor PNG magic bytes`);
  }
}

// --- Deliver ------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: LIMITS.dossierTextBytes,
  screenshots: { max: LIMITS.shotsMost, max_bytes: LIMITS.shotBytes },
  game_max_files: LIMITS.gameEntries,
  game_max_bytes: LIMITS.gameBytes,
  game_path_max_bytes: LIMITS.gamePathBytes,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(
  `ring-runner: delivered ${gameSize.entries} game entries (${gameSize.bytes} bytes), ` +
    `${shotNames.length} screenshots and a ${dossier.length}-byte dossier.json to ${outDir}`,
);
