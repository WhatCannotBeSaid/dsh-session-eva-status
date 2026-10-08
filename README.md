# dsh-session-eva-status

English | [中文](README.zh.md)

Colors DSH sidebar Session rows by their **official** UI status, in an Evangelion-flavored palette. The plugin owns no state: it reads facts the Client already has, writes one `data-` attribute per row, and styles that attribute from a single injected stylesheet.

| Row state | Official fact it reads | Decoration |
|---|---|---|
| Pending interaction (approval / question / plan review) | `uiSession.sessionStatus.pendingInteraction` | blue full-height left rail + 1.6 s breathing. Two blues, one per mode, both from card C ("Newtype" cover): dark `#AAC7EF`, light `#3F629C` |
| Selected — the session open in the main view | `sessions.list` snapshot: `retainedBy.mainView > 0` | red full-height left rail, static. Two reds, one per mode: dark keeps `#FF3B30`, light overrides it with the redder, deeper `#E01B24` |
| Finished but not viewed | `…sessionStatus.completionUnread` | purple `#7A4FD6` full-height left rail |
| Pinned | `workspaces.list` snapshot: `pinnedSessionIds` | the row title becomes a static six-color rainbow (`background-clip: text`); the row itself gets no rail. Two palettes, one per mode: dark keeps the original six, light uses a darker six solved to ≥4.5:1 against the light wall |
| Running / subagents running / idle / archived / blank | — | nothing drawn; the official spinner and archived dimming already say it |

The official priority is pending > running > subagents > completed. When a session has finished but its subagents are still running, the official row shows the ongoing spinner, so this plugin draws nothing and lets that spinner through instead of calling the row "finished".

The plugin's own priority is pending > selected > subagents (yields) > unread. A row that needs you outranks the row you happen to be looking at, and a selected row keeps its red rail while its subagents run — the official spinner is not hidden on selected rows, so both readings stay visible at once.

The design rule behind the palette: **shape carries meaning, color and light carry style.** The pin icon and the pinned-first ordering stay entirely official — only the pinned row's title text is re-colored, so the pin itself is never restyled or decorated.

The rainbow is mode-scoped, because the same mid-luminance stops do not survive both backgrounds: on the light theme's wall (measured luminance 0.405–0.658 under the pinned titles) the original six score only 1.15–3.63:1, while on the dark theme's wall they are fine. Dark therefore keeps the original six colours unchanged, and light uses six darker stops of the same hues in the same order, each clearing 4.5:1 against the darkest patch measured under the title. The split is read from DSH's own dark marker (`body[data-ds-dark-theme]`, `theme-presenter.ts`), not from any theme-specific hook.

The pending rail is mode-scoped for the same reason. Its blue comes from card C (the "Newtype" cover reference), which carries two blues: `#3F629C` (slate blue — 5.84:1 on the light wall but only 2.82:1 on the dark one) and `#AAC7EF` (pale blue — 9.94:1 on the dark wall but only 1.66:1 on the light one). Neither survives both, so each mode takes the one that reads on its own wall: light `#3F629C`, dark `#AAC7EF`. Both tiers share one `@keyframes`: the rail reads its colour through a custom property (`--dsh-session-eva-status-pending`), and the light rule overrides only that property, so the breathing period, easing and low point stay byte-for-byte identical and only the colour changes.

The selected rail is mode-scoped for the same reason. `#FF3B30` keeps a high green channel (59) and scores only 3.39:1 on the light wall; light overrides the colour alone with the redder, deeper `#E01B24` — hue rotated past pure red (HSL 357.3°), green cut from 59 to 27 — which clears 4.62:1. Dark is byte-for-byte unchanged. The override is one extra rule scoped by `body:not([data-ds-dark-theme])` that sets `background` and nothing else, so the rail's geometry, stacking and lack of animation are untouched.

## Install

The plugin is a Profile dependency, like the other local plugins in this directory. Add it to `~/.dsh/profiles/<profile>/package.json` (and to that profile's `dsh.bundles` list) and restart DSH, or use the plugin CLI with the package path:

```sh
dsh plugin --profile <profile> add <path-to>/dsh-session-eva-status
```

## Config

The shipped `cordis.patch.yml` inserts the entry with these defaults; edit them there.

| Field | Default | Meaning |
|---|---|---|
| `hideOfficialDot` | `true` | Hide the official status dot on pending and unread rows (their left rail replaces it) |
| `breatheMs` | `1600` | Breathing period for the pending rail (ms, ≥ 200) |
| `colors` | EVA palette | Override `pending` / `pendingLight` / `selected` / `selectedLight` / `unread`. `pending` and `selected` are the dark-mode values; `pendingLight` and `selectedLight` are the light-mode overrides |

A malformed config throws at load; nothing is silently skipped.

## How it works

- **Row anchor**: `[data-row-key="session:<id>"]` — rendered by `@deepseek-ai/dsh-client-ui-workspace`.
- **Title anchor**: the pinned rainbow is applied to the row's **second child**. The leading 16 px cell is always rendered, so the title's position in the row is stable and no hashed CSS-module class name has to be matched.
- **Status source**: `ctx.uiSession.sessionStatus`, the Client's own `HostObservable<ReadonlyMap<SessionId, SessionStatus>>` (`running`, `pendingInteraction`, `completionUnread`), plus `ctx.sessions.list` for two more official facts: the subagent catalog that decides the official "subagents running" state, and `retainedBy.mainView > 0` — the same fact the official row's own `selected` flag is computed from. The pinned set comes from `ctx.workspaces.list` (`pinnedSessionIds`). No polling, no event sniffing, no host half.
- **Row paint**: the state is carried by a single `::before` pseudo-element rail, and the row's own background is left completely alone — so official hover and selection feedback is untouched. The rail is deliberately **not** an `inset box-shadow`: an inset shadow is a band hugging the border's inner edge, so it follows the row's own `border-radius` all the way around and curls into a right-facing hook at each end — it reads as a bracket, not a rail. An absolutely positioned pseudo-element is not clipped by the row's radius, so the rail is one straight, square-ended bar spanning the full row height.
- **React-safe**: the marker is a `data-eva-state` attribute React does not manage, so re-renders cannot wipe it; a `MutationObserver` filtered to `data-row-key` re-reconciles when rows mount, unmount or change identity.
- **Uninstall is clean**: subscriptions, observer, row attributes, stylesheet and the debug handle all go away with the plugin fiber.

## Credits and prior art

Nothing here was copied wholesale. This list states exactly what each source contributed.

**Code techniques borrowed**

- [enterhalf/dsh-session-colorful-unread-pin-jobs](https://github.com/enterhalf/dsh-session-colorful-unread-pin-jobs) — the browser-half shape for a DSH Web plugin: the `window.__ModuleLoader__.load({ id, factory })` envelope with named `apply` / `inject`, decorating Session rows through `[data-row-key^="session:"]`, re-applying after React re-renders with a `MutationObserver` coalesced into one microtask, and pre-tagging the injected stylesheet (`dataset.plugin` / `dataset.pluginCss`) so a sibling plugin's hot reload cannot claim and delete it. Its 2-second polling, its own unread store and its title-gradient painting were deliberately **not** reused.
- `dsh-ledger-cn` (the local plugin package in `C:\DSH\plugins\dsh-ledger-cn`, unpublished) — the package layout this plugin follows: `private: true`, `main: lib/index.js`, the `.` / `./client` export pair, a `cordis.patch.yml` that inserts its own Loader row, and the test style of loading the browser bundle behind a fake `window.__ModuleLoader__` with a minimal DOM stub.
- [Tencent/BrowserSkill — `@wxg-prc-cpg/browser-skill-dsh-plugin`](https://github.com/Tencent/BrowserSkill/tree/main/packages/dsh-plugin-browserskill) — the reference for an external package's `dsh` manifest: `dsh.bundle.patch`, `dsh.client.platform`, `dsh.client.inject`, and the `files` list.

**Contracts read from the official Harness** ([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness))

- `packages/client/ui-workspace` — the Session row DOM (`data-row-key`, the leading 16 px cell, title, time, pin), the row's own geometry (`Rows.module.css`: 32 px tall, `border-radius: var(--dsw-radius-md)`) and the `SlotMap` declaration of the row seats.
- `packages/client/ui-session` — `ctx.uiSession.sessionStatus`, the `HostObservable<ReadonlyMap<SessionId, SessionStatus>>` this plugin reads.
- `packages/client/ui-primitives` — `StateDot`, whose states define what the official row dot means.
- `packages/client/ui-schedule` — the worked example of occupying `sidebar.session.row.leading` and `sidebar.session.row.hover` (not used yet; kept for a planned hover readout).

No code, stylesheet or copy from the official packages is bundled here: the plugin reads their rendered DOM and their public Client services only.

## Known limitations

- Hiding the official dot uses `> :first-child` on the row. In a pending or unread row that 16 px cell holds only the status dot (the `sidebar.session.row.leading` seat renders only while the row is idle), so nothing else is affected today — a future DSH that puts another occupant there would have it hidden too.
- Archived rows are left alone: the official UI already dims their title, and an archived row shows no status dot there anyway.
- The selected rail is an addition **on top of** the official selection highlight (the row's own background), not a replacement for it.
- The pinned rainbow is text-only (`background-clip: text`), so it needs no extra DOM: nothing is inserted into the row, and uninstalling removes the attribute and the rule together.
- The palette is deliberately theme-independent (EVA colors, not theme brand colors) and no row background is tinted. Every colour comes from that one palette; where a single value cannot clear both walls, the mode that needs it takes the sibling stop instead — that is the case for the pending blue (two card C blues, one per wall) and the selected red (a redder, deeper light-tier red), and the rainbow's light tier is solved the same way (see above).
- If a future DSH renames `data-row-key`, the plugin stops decorating rows and nothing else breaks.
- No model-visible surface: the plugin registers no tool, command, prompt or context.

## Test

```sh
node --test test/client.test.mjs
```

## License

MIT
