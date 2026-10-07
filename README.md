# dsh-session-eva-status

Colors DSH sidebar Session rows by their **official** UI status, in an Evangelion-flavored palette. The plugin owns no state: it reads facts the Client already has, writes one `data-` attribute per row, and styles that attribute from a single injected stylesheet.

| Row state | Official fact it reads | Decoration |
|---|---|---|
| Pending interaction (approval / question / plan review) | `uiSession.sessionStatus.pendingInteraction` | orange `#FF5C1A` left rail + 8% tint + 1.6 s breathing |
| Finished but not viewed | `…sessionStatus.completionUnread` | purple `#7A4FD6` left rail + 6% tint |
| Last agent turn failed | `sessions.list` snapshot `byId[id].lastAgentError` | red `#FF3B30` left rail + right 7 px red/black 45° stripes + 8% tint |
| Archived | `workspaces.list` snapshot `archivedSessionIds` | whole row at 60% opacity |
| Running / idle / pinned | — | nothing drawn; the pin keeps its official look |

The design rule behind the palette: **shape carries meaning, color and light carry style.** Pinned rows are left entirely to the official pin icon and pinned-first ordering, so nothing here competes with it.

## Install

The plugin is a Profile dependency, like the other local plugins in this directory. Add it to `~/.dsh/profiles/web/package.json` and restart DSH, or use the plugin CLI with the package path:

```sh
dsh plugin --profile web add <path-to>/dsh-session-eva-status
```

## Config

The shipped `cordis.patch.yml` inserts the entry with these defaults; edit them there.

| Field | Default | Meaning |
|---|---|---|
| `hideOfficialDot` | `true` | Hide the official status dot on pending and unread rows (their left rail replaces it) |
| `failed` | `true` | Color rows whose last agent turn reported an error |
| `archived` | `true` | Dim archived rows |
| `breatheMs` | `1600` | Breathing period for the pending rail (ms, ≥ 200) |
| `colors` | EVA palette | Override `pending` / `unread` / `failed` |

A malformed config throws at load; nothing is silently skipped.

## How it works

- **Row anchor**: `[data-row-key="session:<id>"]` — rendered by `@deepseek-ai/dsh-client-ui-workspace`.
- **Status source**: `ctx.uiSession.sessionStatus`, the Client's own `HostObservable<ReadonlyMap<SessionId, SessionStatus>>` (`running`, `pendingInteraction`, `completionUnread`). No polling, no event sniffing, no host half.
- **Row paint**: the tint and stripes are `background-image` layers and the rail is an `inset box-shadow`, so the row's own `background-color` — and therefore official hover and selection feedback — is untouched. The rail follows the row's own `border-radius`.
- **React-safe**: the marker is a `data-eva-state` attribute React does not manage, so re-renders cannot wipe it; a `MutationObserver` filtered to `data-row-key` re-reconciles when rows mount, unmount or change identity.
- **Uninstall is clean**: subscriptions, observer, row attributes, stylesheet and the debug handle all go away with the plugin fiber.

## Credits and prior art

Nothing here was copied wholesale. This list states exactly what each source contributed.

**Code techniques borrowed**

- [enterhalf/dsh-session-colorful-unread-pin-jobs](https://github.com/enterhalf/dsh-session-colorful-unread-pin-jobs) — the browser-half shape for a DSH Web plugin: the `window.__ModuleLoader__.load({ id, factory })` envelope with named `apply` / `inject`, decorating Session rows through `[data-row-key^="session:"]`, re-applying after React re-renders with a `MutationObserver` coalesced into one microtask, and pre-tagging the injected stylesheet (`dataset.plugin` / `dataset.pluginCss`) so a sibling plugin's hot reload cannot claim and delete it. Its 2-second polling, its own unread store and its title-gradient painting were deliberately **not** reused.
- `dsh-ledger-cn` (the local plugin package in `C:\DSH\plugins\dsh-ledger-cn`, unpublished) — the package layout this plugin follows: `private: true`, `main: lib/index.js`, the `.` / `./client` export pair, a `cordis.patch.yml` that inserts its own Loader row, and the test style of loading the browser bundle behind a fake `window.__ModuleLoader__` with a minimal DOM stub.
- [Tencent/BrowserSkill — `@wxg-prc-cpg/browser-skill-dsh-plugin`](https://github.com/Tencent/BrowserSkill/tree/main/packages/dsh-plugin-browserskill) — the reference for an external package's `dsh` manifest: `dsh.bundle.patch`, `dsh.client.platform`, `dsh.client.inject`, and the `files` list.

**Contracts read from the official Harness** ([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness))

- `packages/client/ui-workspace` — the Session row DOM (`data-row-key`, the leading 16 px cell, title, time, pin) and the `SlotMap` declaration of the row seats.
- `packages/client/ui-session` — `ctx.uiSession.sessionStatus`, the `HostObservable<ReadonlyMap<SessionId, SessionStatus>>` this plugin reads.
- `packages/client/ui-primitives` — `StateDot`, whose states define what the official row dot means.
- `packages/client/ui-schedule` — the worked example of occupying `sidebar.session.row.leading` and `sidebar.session.row.hover` (not used yet; kept for a planned hover readout).

No code, stylesheet or copy from the official packages is bundled here: the plugin reads their rendered DOM and their public Client services only.

## Known limitations

- Hiding the official dot uses `> :first-child` on the row. In a pending or unread row that 16 px cell holds only the status dot (the `sidebar.session.row.leading` seat renders only while the row is idle), so nothing else is affected today — a future DSH that puts another occupant there would have it hidden too.
- `lastAgentError` clears on the next prompt, not on view. A failed row therefore stays red until that Session runs again.
- Archived rows are already grayed by the official UI; this plugin adds a further 60% opacity on top.
- The palette is deliberately theme-independent (EVA colors, not theme brand colors). On very light themes the 6–8% tints are subtle.
- If a future DSH renames `data-row-key`, the plugin stops decorating rows and nothing else breaks.
- No model-visible surface: the plugin registers no tool, command, prompt or context.

## Test

```sh
node --test test/client.test.mjs
```

---

# dsh-session-eva-status（中文）

按**官方**会话状态给 DSH 侧栏会话行上色，配色是 EVA 风格。插件不拥有任何状态：只读客户端已有的事实，给每行写一个 `data-` 属性，再用一张注入的样式表给这个属性上色。

| 行状态 | 读的官方事实 | 画什么 |
|---|---|---|
| 有待处理交互（批准 / 提问 / 计划评审） | `uiSession.sessionStatus.pendingInteraction` | 橙 `#FF5C1A` 左轨 + 8% 底色 + 1.6 秒呼吸 |
| 跑完但没看过 | `…sessionStatus.completionUnread` | 紫 `#7A4FD6` 左轨 + 6% 底色 |
| 上一轮 agent 报错 | `sessions.list` 快照 `byId[id].lastAgentError` | 红 `#FF3B30` 左轨 + 右侧 7px 红黑 45° 斜纹 + 8% 底色 |
| 已归档 | `workspaces.list` 快照 `archivedSessionIds` | 整行压暗到 60% |
| 运行中 / 空闲 / 置顶 | — | 不画；置顶完全交给官方图钉 |

配色背后的规则：**形状负责表意，颜色与光效负责风格。** 置顶行完全留给官方图钉与置顶优先排序，这里不做任何与之竞争的东西。

## 安装

与同目录其他本地插件一样，作为 Profile 依赖：把包加进 `~/.dsh/profiles/web/package.json` 后重启 DSH，或用插件 CLI 指路径安装。

## 配置

随包 `cordis.patch.yml` 插入 entry 时带上默认值，改那里即可：`hideOfficialDot`、`failed`、`archived`、`breatheMs`、`colors`。配置不合法会当场抛错，不静默降级。

## 原理

- 行锚点 `[data-row-key="session:<id>"]`；状态源是客户端自己的 `ctx.uiSession.sessionStatus`，不轮询、不嗅探事件、不需要宿主半边。
- 底色与斜纹走 `background-image` 图层，左轨走 `inset box-shadow`：行自身的 `background-color` 不动，官方 hover 与选中反馈照旧，轨道还跟随行圆角。
- 标记写成 `data-eva-state` 属性（React 不管它，重渲染冲不掉），观察器只过滤 `data-row-key`，行挂载/卸载/换身份时重新对账。
- 卸载即净：订阅、观察器、行属性、样式表、调试入口一起清掉。

## 已知限制

- 隐藏官方点用行上的 `> :first-child`：pending/unread 行的这个 16px 格里只有状态点，所以今天不会误伤；若将来官方在该格放别的占用者，会被一起隐藏。
- `lastAgentError` 在下次提问时才清，不是看过就清，所以失败行会一直红到该会话再跑一次。
- 归档行官方本来就灰化，本插件在其上再叠 60% 透明度。
- 配色刻意不跟随主题品牌色；很浅的主题下 6–8% 底色会比较淡。
- 将来官方若改名 `data-row-key`，插件只是不再上色，不会影响别的功能。
- 没有任何模型可见面：不注册工具、命令、提示词或上下文。
