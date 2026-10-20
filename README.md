# token-pulse

[中文](README.zh-CN.md) | English

A Claude Code mod that adds a status band above the prompt: context usage with an energy mascot, model output speed, and prompt cache hit rate. It replaces token-weather.

```
(-_-) Tired 67%  134.4k/200k ▃▅█ ▲ +98.4k  │  ⇢ 68 tok/s · 均 72  │  ⟳ 缓存命中 94% · 累计 88%
```

The band's labels are in Chinese: 均 = average, 缓存命中 = cache hit, 累计 = cumulative.

### Desktop app (Code tab)

![token-pulse in the Claude desktop app](docs/images/desktop.png)

### Terminal (CLI)

![token-pulse in the Claude Code terminal](docs/images/cli.png)

## The energy mascot

The fuller the context, the more tired the mascot gets; compacting the context lets it sleep. The desktop app (Code tab) draws it as an SVG; the terminal cannot draw images, so it shows a kaomoji instead.

| Context used | State | Desktop app | Terminal | Color |
|---|---|---|---|---|
| < 25% | Fresh | ![Fresh](docs/images/mascot-fresh.svg) laughing, rosy cheeks | `(^‿^)` | green |
| 25–50% | Focused | ![Focused](docs/images/mascot-focused.svg) round eyes, slight smile | `(•_•)` | teal |
| 50–75% | Tired | ![Tired](docs/images/mascot-tired.svg) slit eyes, yawning | `(-_-)` | orange |
| 75–90% | Drained | ![Drained](docs/images/mascot-drained.svg) drooping eyes, wavy mouth, sweat drop | `(=_=;)` | coral |
| ≥ 90% | Exhausted | ![Exhausted](docs/images/mascot-asleep.svg) asleep, zZ overhead | `(-_-)zZ` | red, compaction is near |

The state word (Fresh, Tired, …) and the trend bar use the same color.

## What each item means

| Item | Meaning |
|---|---|
| 67% | Share of the context window in use |
| 134.4k/200k | Tokens used / window size |
| ▃▅█ | Context usage at the end of each of the last 12 turns |
| ▲ +98.4k | Change in context tokens since the previous turn |
| ⇢ 68 tok/s | Output speed of the latest model request |
| 均 72 | Average output speed over the last 10 valid requests, weighted by tokens |
| ⟳ 缓存命中 94% | Prompt cache hit rate of the latest request: green ≥ 80%, yellow ≥ 50%, red < 50% |
| 累计 88% | Cumulative cache hit rate over all requests in this session |

In a narrow terminal (band under 96 columns) only the mascot, state, usage, speed and hit rate are shown. Narrow mode applies to the terminal only: the desktop app reports its width differently, and the same threshold would hide content there, so the desktop app always shows everything.

## How the numbers are computed

- **Output speed**: output tokens ÷ generation time. Generation time runs from the first streamed chunk to the end of the stream, so queueing and time to first token are excluded. It is measured on your machine and affected by the network; thinking tokens count as output. Requests with fewer than 20 output tokens or under 0.3 s are skipped as noise.
- **Cache hit rate**: cache reads ÷ (uncached input + cache writes + cache reads). It is normally low on a session's first request, right after compaction, or after the cache expires (5 minutes by default).
- Only the main conversation is counted; subagent requests are not. `/clear` resets the cumulative figures.

## Usage

- `/token-pulse` shows or hides the band.
- Nothing is shown before the first model response.
- After the first turn you see usage, token counts, speed and hit rate; the trend bar, the ▲ change and the average need at least two data points and appear from the second turn.

## Install

Requires Claude Code 2.1.287 or later. At the Claude Code prompt:

```
/plugin install token-pulse --marketplace gKev1n/token-pulse
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install token-pulse --marketplace gKev1n/token-pulse
```

In a session that is already running, run `/reload-plugins`.

If token-weather is installed, disable or uninstall it first, or you will see two bands.

To work on the code, clone the repository and add the local folder instead:

```bash
git clone https://github.com/gKev1n/token-pulse.git ~/mods/token-pulse
claude plugin marketplace add ~/mods/token-pulse
claude plugin install token-pulse@token-pulse
```

After that, edits to the folder take effect with `/reload-plugins`; no reinstall needed.

## Privacy and data

- Makes no network requests, sends no data to any service, and reads or writes no files on disk.
- Reads only what Claude Code already provides: per-request token usage (input, cache reads, cache writes, output), context window usage, and the local clock (to time generation). The model's streamed output passes through the `turn.step` hook, which forwards it unchanged and only notes when the first chunk arrives; it neither parses nor keeps the content.
- Figures are kept only in the current session's state (`$.state`), dropped when the session ends, and reset on `/clear`. Nothing is kept across sessions.

What each hook in `hooks/register.tsx` does:

| Hook | What it does |
|---|---|
| `session.start` | Registers the `/token-pulse` command, then passes the event on |
| `command.run` (only `token-pulse`) | Answers the mod's own `/token-pulse` command by toggling the band; other commands never reach it |
| `session.end` | On `/clear`, resets the figures; then passes the event on |
| `turn.step` | Forwards the model's stream unchanged, timing it from the first chunk to the end, and reads the request's token usage. Subagent requests are ignored |
| `turn.complete` | Reads the context window usage at the end of a main-conversation turn |
| `ui.render` (only `AbovePrompt`) | Draws the band; when hidden, before the first response, or while a survey is shown, it leaves the area to Claude Code |

## Known issues

- In Windows terminals with a CJK font, characters such as `•` may render two cells wide and shift the kaomoji slightly.

## Development

```bash
claude plugin validate .
claude plugin test .
```

- Decide the drawing surface with `e.surface !== 'terminal'`. The terminal's element table also has an `Svg` key, so checking `'Svg' in els` alone would draw SVG in the terminal.
- In tests, `ui.render` needs an answer at the bottom of the chain from the test itself (see `engineDraws` in the test file), and the bottom answer for `session.usage` must be wrapped as `{ value: ... }`.
- The five mascot images in this README are exported from `mascotSvg()` in `hooks/icon.ts`. Re-export them after changing the mascot.

## License

[Apache-2.0](LICENSE) © 2026 gKev1n
