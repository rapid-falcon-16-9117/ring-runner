# ring-runner

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/rapid-falcon-16-9117/ring-runner/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/rapid-falcon-16-9117/ring-runner/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Ring Runner 环线飞行 — an original chase-view flight game in pure static files (no build step, no network, keyboard and mouse). Fly a 3-mission campaign across 3 zones — Verdant Coast, Red Mesa Canyon and Alpine Dusk — plus an endless free-flight mode. Choose from 3 aircraft with genuinely different handling (Comet, Gull, Hawk), thread 30 mission rings, pick up 12 supply crates, dodge 5 bird flocks and 4 storm cells, and put it down on the far strip for a graded landing (Perfect / Good / Hard). 6 achievements to earn, a full instrument cluster (airspeed, attitude and altimeter gauges, compass strip, course minimap, throttle / fuel / hull bars, altitude-speed-heading readout), stall, wind, damage and fuel that turn every sortie into decisions, and a WebAudio engine that follows the throttle. The game's own source is 12 ES modules under game/src/, one clear job each: flight model, world rules, terrain, renderer, HUD, input, audio and deterministic screenshot staging among them.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in a desktop browser. Fly with the arrow keys (or WASD) and the mouse, the wheel works the throttle, Space brakes and P pauses.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9fhtyn8n&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
