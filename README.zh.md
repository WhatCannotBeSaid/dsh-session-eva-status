# dsh-session-eva-status

[English](README.md) | 中文

按**官方**会话状态给 DSH 侧栏会话行上色，配色是 EVA 风格。插件不拥有任何状态：只读客户端已有的事实，给每行写一个 `data-` 属性，再用一张注入的样式表给这个属性上色。

| 行状态 | 读的官方事实 | 画什么 |
|---|---|---|
| 有待处理交互（批准 / 提问 / 计划评审） | `uiSession.sessionStatus.pendingInteraction` | 蓝整行高左轨 + 1.6 秒呼吸。两档各一支蓝，都取自卡 C「Newtype 封面」：暗档 `#AAC7EF`，亮档 `#3F629C` |
| 选中（主区域正开着这一个会话） | `sessions.list` 快照里 `retainedBy.mainView > 0` | 红整行高左轨，静态。两档各一支红：暗档 `#FF3B30`，亮档覆盖为更红更深的 `#E01B24` |
| 跑完但没看过 | `…sessionStatus.completionUnread` | 紫 `#7A4FD6` 整行高左轨 |
| 置顶 | `workspaces.list` 快照里 `pinnedSessionIds` | 行标题文字变静态六色彩虹（`background-clip: text`），行本身不画轨。两档各一组色标：暗档原六色不动，亮档换成对浅底 ≥4.5:1 的压暗六色 |
| 运行中 / 子智能体在跑 / 空闲 / 已归档 / 空白新会话 | — | 不画；官方的转圈点与归档灰化已经说清楚了 |

官方优先级是 等人 > 运行中 > 子智能体 > 完成未读。跑完但子智能体还在跑时，官方那行显示的是 ongoing 转圈，插件就不画、把转圈让过去，不把这行说成「跑完」。

插件自己的优先级是 等人 > 选中 > 子智能体让位 > 完成未读：要你动手的行压过你正在看的行；选中的行即使子智能体在跑也保留红轨——选中行不隐藏官方转圈，两种读法同时看得见。

配色背后的规则：**形状负责表意，颜色与光效负责风格。** 图钉与置顶优先排序完全留给官方，这里只给置顶行的标题文字换色，图钉本身不改样式、不加装饰。

彩虹按模式分档，因为同一组中明度色标撑不住两种底色：亮档标题脚下的底（真机实测亮度 0.405–0.658）上，原六色只有 1.15–3.63:1，暗档则没问题。所以暗档原六色逐字节不动，亮档换成同色相、同次序、压暗到「每个色标对最暗背景块 ≥4.5:1」的六色。分档读的是官方暗色标记（`body[data-ds-dark-theme]`，见 DSH 的 `theme-presenter.ts`），不依赖任何主题专属钩子。

蓝轨按模式分档是同一个道理。它的蓝取自卡 C（「Newtype 封面」那张参考图），卡 C 有两支蓝：板岩蓝 `#3F629C`（对亮档底 5.84:1，对暗档底只有 2.82:1）与浅蓝 `#AAC7EF`（对暗档底 9.94:1，对亮档底只有 1.66:1）。两支都撑不住两种底色，于是各归其位——亮档 `#3F629C`、暗档 `#AAC7EF`。两档共用同一份 `@keyframes`：轨的颜色走一条自定义属性（`--dsh-session-eva-status-pending`），亮档那条规则只覆盖这一个属性，所以呼吸的周期、缓动与低点比例逐字不变，变的只有颜色。

红轨按模式分档是同一个道理。`#FF3B30` 的 G 通道偏高（59），对亮档底色只有 3.39:1；亮档因此只覆盖颜色，换成更红更深的 `#E01B24`：色相转过纯红（HSL 357.3°），G 从 59 砍到 27，对亮档底色 4.62:1。暗档逐字节不变。这条覆盖只多一条规则，用 `body:not([data-ds-dark-theme])` 限定，且只写 `background` 一个声明——轨的几何、层级与「选中不呼吸」一概不动。

## 安装

从 npm registry 安装：

```sh
dsh plugin --profile <profile> add dsh-session-eva-status
```

或直接从 GitHub 装：

```sh
dsh plugin --profile <profile> add github:WhatCannotBeSaid/dsh-session-eva-status
```

把 `<profile>` 换成目标 profile 名（例如 `web`），然后**重启 DSH**：客户端束只在模块图重新合成时才会更新，单纯刷新页面会命中旧缓存。

想用本地检出？直接指路径安装。本包同样可以作为普通 Profile 依赖写进该 profile 的 `package.json` 与 `dsh.bundles`：

```sh
dsh plugin --profile <profile> add <path-to>/dsh-session-eva-status
```

## 配置

随包 `cordis.patch.yml` 插入 entry 时带上默认值，改那里即可：

| 字段 | 默认 | 含义 |
|---|---|---|
| `hideOfficialDot` | `true` | 在 等人／跑完未读 两种行上隐藏官方状态点（由左轨替代） |
| `breatheMs` | `1600` | 蓝轨的呼吸周期（毫秒，≥ 200） |
| `colors` | EVA 配色 | 覆盖 `pending` / `pendingLight` / `selected` / `selectedLight` / `unread`。`pending` 与 `selected` 是暗档值，`pendingLight` 与 `selectedLight` 是亮档覆盖值 |

配置不合法会当场抛错，不静默降级。

## 原理

- **行锚点**：`[data-row-key="session:<id>"]`，由 `@deepseek-ai/dsh-client-ui-workspace` 渲染。
- **标题锚点**：置顶彩虹加在行内**第 2 个子元素**上。行首那格永远渲染，标题位次因此稳定，不必匹配官方哈希类名。
- **状态源**：客户端自己的 `ctx.uiSession.sessionStatus`（`HostObservable<ReadonlyMap<SessionId, SessionStatus>>`，含 `running` / `pendingInteraction` / `completionUnread`），外加 `ctx.sessions.list` 里的两件事：子智能体目录（判断官方的「子智能体运行中」）与 `retainedBy.mainView > 0`（官方行自己的 `selected` 就是这么算出来的）；置顶集合来自 `ctx.workspaces.list` 的 `pinnedSessionIds`。不轮询、不嗅探事件、不需要宿主半边。
- **行上画什么**：状态只由左轨一条 `::before` 伪元素表达，行自身的背景完全不动：官方 hover 与选中反馈照旧。左轨刻意**不用** `inset box-shadow`：inset 阴影是贴着边框内缘的一条带，会跟着官方行的圆角一路拐弯，两端拐成朝右的大弯钩，看上去像中括号而不是一条直轨；绝对定位的伪元素不受行圆角裁剪，才是整行高、两端直角的一条直轨。
- **React 安全**：标记写成 `data-eva-state` 属性（React 不管它，重渲染冲不掉），观察器只过滤 `data-row-key`，行挂载/卸载/换身份时重新对账。
- **卸载即净**：订阅、观察器、行属性、样式表、调试入口一起清掉。

## 致谢与参考

这里没有任何整段抄来的代码。下面逐条说明每个来源贡献了什么。

**借用的代码手法**

- [enterhalf/dsh-session-colorful-unread-pin-jobs](https://github.com/enterhalf/dsh-session-colorful-unread-pin-jobs) — DSH Web 插件浏览器半边的骨架：`window.__ModuleLoader__.load({ id, factory })` 信封与具名 `apply` / `inject`、用 `[data-row-key^="session:"]` 认会话行、用合并到一个微任务的 `MutationObserver` 在 React 重渲染后补画、以及给注入样式表预打标记（`dataset.plugin` / `dataset.pluginCss`）以免被兄弟插件的热重载认领并删除。它的 2 秒轮询、自建未读存储与标题渐变染色**没有**沿用。
- `dsh-ledger-cn`（本机 `C:\DSH\plugins\dsh-ledger-cn`，未发布）— 本插件的包结构照它来：`private: true`、`main: lib/index.js`、`.` / `./client` 一对导出、插入自己 Loader 行的 `cordis.patch.yml`，以及测试手法（在假 `window.__ModuleLoader__` 与最小 DOM stub 之后加载浏览器束）。
- [Tencent/BrowserSkill — `@wxg-prc-cpg/browser-skill-dsh-plugin`](https://github.com/Tencent/BrowserSkill/tree/main/packages/dsh-plugin-browserskill) — 外部包的 `dsh` 清单参照：`dsh.bundle.patch`、`dsh.client.platform`、`dsh.client.inject` 与 `files` 列表。

**从官方 Harness 读到的契约**（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）

- `packages/client/ui-workspace` — 会话行的 DOM（`data-row-key`、行首 16px 格、标题、时间、图钉）、行自身几何（`Rows.module.css`：高 32px、`border-radius: var(--dsw-radius-md)`）以及行内席位（`SlotMap`）的声明。
- `packages/client/ui-session` — 本插件读的 `ctx.uiSession.sessionStatus`（`HostObservable<ReadonlyMap<SessionId, SessionStatus>>`）。
- `packages/client/ui-primitives` — `StateDot`，它的状态集合定义了官方行点的含义。
- `packages/client/ui-schedule` — 占用 `sidebar.session.row.leading` 与 `sidebar.session.row.hover` 席位的现成例子（尚未使用，留给计划中的 hover 读数）。

本包不含官方包的任何代码、样式或文案：插件只读它们渲染出来的 DOM 与公开的客户端服务。

## 已知限制

- 隐藏官方点用行上的 `> :first-child`：等人／跑完未读 行的这个 16px 格里只有状态点（`sidebar.session.row.leading` 席只在行 idle 时渲染），所以今天不会误伤；若将来官方在该格放别的占用者，会被一起隐藏。
- 归档行不画：官方已经把标题压到 caption 档，而且归档行的行首格本来就不画状态点。
- 选中轨是叠在官方选中高亮（行自身背景）之上的加法，不是替换。
- 置顶彩虹只染文字（`background-clip: text`），不往行里插 DOM；卸载时属性与规则一起消失。
- 配色刻意不跟随主题品牌色，也不给行铺底色。所有颜色都取自同一套调色板；某支色撑不住两种底色时，缺的那一档改用同一套色卡里的兄弟色而不是另找一个颜色——蓝轨（卡 C 两支蓝，各管一种底色）与红轨都是这样，彩虹亮档也是同一套解法（见上）。
- 将来官方若改名 `data-row-key`，插件只是不再上色，不会影响别的功能。
- 没有任何模型可见面：不注册工具、命令、提示词或上下文。

## 测试

```sh
node --test test/client.test.mjs
```

## 许可

MIT
