/**
 * 客户端束的行为测试。
 *
 * 覆盖：三种被着色状态的标记（等人 / 选中 / 完成未读）、优先级、归档不画、
 * 置顶标题彩虹、订阅触发的重对账、隐藏官方点的开关、配置校验、卸载即净。
 * 不覆盖真实浏览器里的观感（配色与动画靠页面预览定稿）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { installDom, sessionRow, observable, pluginContext } from './dom-stub.mjs'

let captured = null

globalThis.window = {
  __ModuleLoader__: {
    load(options) {
      captured = options
    },
  },
}

await import('../lib/client.js')

/** 每次都取一份新的插件实例（factory 可重复调用）。 */
function loadPlugin() {
  return captured.factory(() => {
    throw new Error('本插件不 require 种子模块')
  })
}

/** 把「父会话 → 子智能体 id 列表」写成官方 sessions.list 的形状。 */
function projectionOf(subagents) {
  return Object.fromEntries(Object.entries(subagents).map(([parentId, children]) => [
    parentId, { values: { subagentCatalog: children.map(id => ({ id })) } },
  ]))
}

/** 组装一次完整的 apply：行 + 官方快照 + 上下文。 */
function setup({ rows, statuses = new Map(), archived = [], pinned = [], selected = [], subagents = {}, config } = {}) {
  installDom(rows)
  const status = observable(statuses)
  const workspaces = observable({ archivedSessionIds: archived, pinnedSessionIds: pinned })
  const sessions = observable({
    byId: Object.fromEntries([...statuses.keys()].map(id => [
      id,
      // 官方「选中」= retainedBy.mainView > 0（WorkspaceBrowser.tsx:661-663）。
      { running: false, retainedBy: selected.includes(id) ? { mainView: 1 } : {} },
    ])),
    projectionsBySession: projectionOf(subagents),
  })
  const ctx = pluginContext({
    uiSession: { sessionStatus: status },
    sessions: { list: sessions },
    workspaces: { list: workspaces },
  })
  const plugin = loadPlugin()
  plugin.apply(ctx, config)
  return { plugin, ctx, status, sessions, workspaces, rows }
}

const statusEntry = (overrides = {}) => ({ running: false, pendingInteraction: undefined, completionUnread: false, ...overrides })

/** 取注入的样式表文本。 */
const cssOf = () => globalThis.document.getElementById('dsh-session-eva-status-style').textContent

test('三种状态各写一个标记，运行中与空闲不写', () => {
  const rows = [sessionRow('a'), sessionRow('b'), sessionRow('c'), sessionRow('d'), sessionRow('e')]
  const statuses = new Map([
    ['a', statusEntry({ pendingInteraction: { kind: 'approval' } })],
    ['b', statusEntry({ completionUnread: true })],
    ['c', statusEntry()],
    ['d', statusEntry({ running: true })],
    ['e', statusEntry()],
  ])
  setup({ rows, statuses, selected: ['c'] })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'pending')
  assert.equal(rows[1].getAttribute('data-eva-state'), 'unread')
  assert.equal(rows[2].getAttribute('data-eva-state'), 'selected')
  assert.equal(rows[3].hasAttribute('data-eva-state'), false, '运行中不画')
  assert.equal(rows[4].hasAttribute('data-eva-state'), false, '空闲不画')
})

test('优先级：等人 > 选中 > 子智能体让位 > 完成未读', () => {
  const rows = [sessionRow('a'), sessionRow('b'), sessionRow('c'), sessionRow('d')]
  const statuses = new Map([
    ['a', statusEntry({ pendingInteraction: { kind: 'question' }, completionUnread: true })],
    ['b', statusEntry({ completionUnread: true })],
    ['c', statusEntry({ completionUnread: true })],
    ['d', statusEntry()],
    ['kid', statusEntry({ running: true })],
  ])
  setup({
    rows,
    statuses,
    subagents: { b: ['kid'], c: ['kid'], d: ['kid'] },
    selected: ['a', 'c', 'd'],
  })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'pending', '等人压过选中，也压过子智能体')
  assert.equal(rows[1].hasAttribute('data-eva-state'), false, '子智能体在跑时让位给官方转圈')
  assert.equal(rows[2].getAttribute('data-eva-state'), 'selected', '选中压过子智能体与未读')
  assert.equal(rows[3].getAttribute('data-eva-state'), 'selected', '选中的空闲会话也画红轨')
})

test('子智能体在跑时不涂紫，也不藏官方点', () => {
  const rows = [sessionRow('a')]
  setup({
    rows,
    statuses: new Map([
      ['a', statusEntry({ completionUnread: true })],
      ['kid', statusEntry({ running: true })],
    ]),
    subagents: { a: ['kid'] },
  })
  assert.equal(rows[0].hasAttribute('data-eva-state'), false, '官方 ongoing 优先，插件不画')
  assert.equal(cssOf().includes('data-eva-state="unread"]>:first-child'), true,
    '隐藏规则本身还在，但没有标记的行落不到它身上')
})

test('子智能体停下后，未读标记回来', async () => {
  const rows = [sessionRow('a')]
  const { sessions } = setup({
    rows,
    statuses: new Map([
      ['a', statusEntry({ completionUnread: true })],
      ['kid', statusEntry({ running: true })],
    ]),
    subagents: { a: ['kid'] },
  })
  assert.equal(rows[0].hasAttribute('data-eva-state'), false)
  sessions.set({
    byId: { a: { running: false }, kid: { running: false } },
    projectionsBySession: { a: { values: { subagentCatalog: [] } } },
  })
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
})

test('归档行不画，也不再叠一层透明度', () => {
  const rows = [sessionRow('a')]
  setup({ rows, statuses: new Map([['a', statusEntry({ completionUnread: true })]]), archived: ['a'] })
  assert.equal(rows[0].hasAttribute('data-eva-state'), false, '官方归档行不画点，插件也不画')
  const css = cssOf()
  assert.equal(css.includes('archived'), false, '样式表里没有归档规则')
  assert.equal(css.includes('opacity'), false, '不再压整行透明度')
})

test('选中会话画红轨：颜色取 EVA 红，静态不呼吸', () => {
  const rows = [sessionRow('a')]
  setup({ rows, statuses: new Map([['a', statusEntry()]]), selected: ['a'] })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'selected')
  const css = cssOf()
  assert.equal(css.includes('data-eva-state="selected"]::before'), true, '选中也有左轨')
  assert.equal(/data-eva-state="selected"\]::before\{[^}]*#FF3B30/.test(css), true, '轨用 EVA 红')
  assert.equal(/data-eva-state="selected"\]::before\{[^}]*animation/.test(css), false, '选中不呼吸')
})

test('置顶行的标题走静态彩虹字，行本身不画轨', () => {
  const rows = [sessionRow('a')]
  setup({ rows, statuses: new Map([['a', statusEntry()]]), pinned: ['a'] })
  assert.equal(rows[0].getAttribute('data-eva-pinned'), 'true', '置顶标记写在行上')
  assert.equal(rows[0].hasAttribute('data-eva-state'), false, '置顶本身不是状态轨')
  const css = cssOf()
  assert.equal(css.includes('data-eva-pinned="true"]>:nth-child(2)'), true, '只染标题（行内第 2 个子元素）')
  assert.equal(css.includes('background-clip:text'), true, '彩虹靠背景裁到文字上')
  assert.equal(css.includes('color:transparent'), true)
  for (const hex of ['#E5484D', '#F76B15', '#C99700', '#2E9E5B', '#0E8AA8', '#6E56CF']) {
    assert.equal(css.includes(hex), true, `彩虹里有 ${hex}`)
  }
})

test('归档的置顶行不染彩虹（官方归档行本来也不显示图钉）', () => {
  const rows = [sessionRow('a')]
  setup({ rows, statuses: new Map([['a', statusEntry()]]), pinned: ['a'], archived: ['a'] })
  assert.equal(rows[0].hasAttribute('data-eva-pinned'), false, '归档行不写置顶标记')
})

test('置顶与选中变化经订阅重对账', async () => {
  const rows = [sessionRow('a')]
  const { workspaces, sessions } = setup({ rows, statuses: new Map([['a', statusEntry()]]) })
  assert.equal(rows[0].hasAttribute('data-eva-pinned'), false)
  workspaces.set({ archivedSessionIds: [], pinnedSessionIds: ['a'] })
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].getAttribute('data-eva-pinned'), 'true', '置顶后补上彩虹标记')
  sessions.set({ byId: { a: { running: false, retainedBy: { mainView: 1 } } }, projectionsBySession: {} })
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].getAttribute('data-eva-state'), 'selected', '打开会话后红轨跟上')
})

test('左轨是整行高的 ::before，不是会被行圆角裁短的 inset box-shadow', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry({ completionUnread: true })]]) })
  const css = cssOf()
  assert.equal(css.includes('[data-eva-state="unread"]::before'), true, '轨挂在伪元素上')
  assert.equal(css.includes('top:0;bottom:0'), true, '轨要撑满整行高')
  assert.equal(css.includes('position:relative'), true, '行要当定位上下文')
  assert.equal(css.includes('box-shadow'), false, '不再用 inset box-shadow')
  assert.equal(css.includes('#7A4FD6'), true)
})

test('不铺底色：状态只由左轨表达，行上没有背景染色', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry({ pendingInteraction: { kind: 'approval' } })]]) })
  const css = cssOf()
  const backgrounds = css.match(/background-image:[^;}]*/g) ?? []
  assert.equal(backgrounds.length, 1, '全表只有一处渐变，属于置顶标题')
  assert.equal(backgrounds[0].includes('linear-gradient(90deg,'), true)
  assert.equal(css.includes('[data-eva-state="pending"]::before'), true, '只留左轨')
  assert.equal(css.includes('color-mix(in srgb, #FF5C1A 35%, transparent)'), true, '呼吸低点照旧')
})

test('失败态已整体删除：标记与样式表里都不留', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry()]]) })
  const css = cssOf()
  assert.equal(css.includes('failed'), false, '样式表里没有失败规则')
  assert.equal(css.includes('repeating-linear-gradient'), false, '斜纹一并删掉')
  assert.equal(css.includes('#FF3B30'), true, '同一支红改作选中轨，不再是失败色')
  const { plugin } = setup({ rows: [sessionRow('b')], statuses: new Map([['b', statusEntry()]]) })
  assert.deepEqual(plugin.inject, ['uiSession', 'sessions', 'workspaces'], '为算子智能体重新依赖 sessions')
})

test('样式表结构完整：花括号配平、规则不粘连', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry({ completionUnread: true })]]) })
  const css = cssOf()
  const open = (css.match(/\{/g) ?? []).length
  const close = (css.match(/\}/g) ?? []).length
  assert.equal(open, close, '每条规则都要有收尾的右花括号')
  assert.equal(css.includes('}html'), true, '规则之间必须有右花括号分隔')
  assert.equal(/infinite\s*html/.test(css), false, '动画值不能把下一条选择器吞进去')
})

test('状态变化经订阅重对账，标记会跟着改', async () => {
  const rows = [sessionRow('a')]
  const { status } = setup({ rows, statuses: new Map([['a', statusEntry()]]) })
  assert.equal(rows[0].hasAttribute('data-eva-state'), false)
  status.set(new Map([['a', statusEntry({ completionUnread: true })]]))
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
  status.set(new Map([['a', statusEntry()]]))
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].hasAttribute('data-eva-state'), false, '回到空闲要清掉标记')
})

test('DOM 变动触发重对账（新行补标记）', async () => {
  const rows = []
  const { status } = setup({ rows, statuses: new Map([['late', statusEntry({ completionUnread: true })]]) })
  rows.push(sessionRow('late'))
  globalThis.MutationObserver.instances.at(-1).trigger()
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
})

test('隐藏官方点的开关：关掉后不写隐藏规则', () => {
  const rows = [sessionRow('a')]
  const { ctx } = setup({
    rows,
    statuses: new Map([['a', statusEntry({ completionUnread: true })]]),
    config: { hideOfficialDot: false },
  })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
  assert.equal(cssOf().includes('visibility:hidden'), false, '关掉开关后不写隐藏规则')
  assert.equal(ctx.effects.length, 1)
})

test('隐藏官方点的规则默认存在，且只作用于 pending 与 unread', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry()]]) })
  const css = cssOf()
  assert.equal(css.includes('data-eva-state="pending"]>:first-child'), true)
  assert.equal(css.includes('data-eva-state="unread"]>:first-child'), true)
  assert.equal(css.includes('archived'), false)
})

test('卸载即净：标记、样式表、订阅、观察器一起清掉', () => {
  const rows = [sessionRow('a')]
  const { ctx, status, sessions } = setup({
    rows,
    statuses: new Map([['a', statusEntry({ completionUnread: true })]]),
    pinned: ['a'],
  })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
  assert.equal(rows[0].getAttribute('data-eva-pinned'), 'true')
  assert.notEqual(globalThis.document.getElementById('dsh-session-eva-status-style'), null)
  const dispose = ctx.effects[0]()
  dispose()
  assert.equal(rows[0].hasAttribute('data-eva-state'), false)
  assert.equal(rows[0].hasAttribute('data-eva-pinned'), false, '置顶标记也一起清')
  assert.equal(globalThis.document.getElementById('dsh-session-eva-status-style'), null)
  assert.equal(status.listenerCount, 0)
  assert.equal(sessions.listenerCount, 0)
  assert.equal(globalThis.window.__DSH_SESSION_EVA_STATUS__, undefined)
})

test('配置错当场抛，不静默降级', () => {
  installDom([sessionRow('a')])
  const plugin = loadPlugin()
  const ctx = pluginContext({
    uiSession: { sessionStatus: observable(new Map()) },
    sessions: { list: observable({ byId: {}, projectionsBySession: {} }) },
    workspaces: { list: observable({ archivedSessionIds: [] }) },
  })
  assert.throws(() => plugin.apply(ctx, { colors: { pending: '' } }), /colors\.pending/)
  assert.throws(() => plugin.apply(ctx, { breatheMs: 10 }), /breatheMs/)
  assert.throws(() => plugin.apply(ctx, 'nope'), /config/)
})

test('缺服务当场抛', () => {
  installDom([sessionRow('a')])
  const plugin = loadPlugin()
  const ctx = pluginContext({})
  assert.throws(() => plugin.apply(ctx, {}), /缺少服务 uiSession/)
})

test('插件对外只导出 name / inject / apply', () => {
  const plugin = loadPlugin()
  assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject', 'name'])
  assert.equal(plugin.name, 'dsh-session-eva-status')
  assert.deepEqual(plugin.inject, ['uiSession', 'sessions', 'workspaces'])
})
