/**
 * 客户端束的行为测试。
 *
 * 覆盖：四种状态的标记、订阅触发的重对账、两个开关、配置校验、卸载即净。
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

/** 组装一次完整的 apply：行 + 三份官方快照 + 上下文。 */
function setup({ rows, statuses = new Map(), byId = {}, archived = [], config } = {}) {
  installDom(rows)
  const status = observable(statuses)
  const sessions = observable({ byId })
  const workspaces = observable({ archivedSessionIds: archived })
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

test('四种状态各写一个标记，运行中与空闲不写', () => {
  const rows = [sessionRow('a'), sessionRow('b'), sessionRow('c'), sessionRow('d'), sessionRow('e'), sessionRow('f')]
  const statuses = new Map([
    ['a', statusEntry({ pendingInteraction: { kind: 'approval' } })],
    ['b', statusEntry({ completionUnread: true })],
    ['d', statusEntry({ completionUnread: true })],
    ['e', statusEntry({ running: true })],
    ['f', statusEntry()],
  ])
  setup({
    rows,
    statuses,
    byId: { c: { lastAgentError: 'boom' } },
    archived: ['d'],
  })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'pending')
  assert.equal(rows[1].getAttribute('data-eva-state'), 'unread')
  assert.equal(rows[2].getAttribute('data-eva-state'), 'failed')
  assert.equal(rows[3].getAttribute('data-eva-state'), 'archived')
  assert.equal(rows[4].hasAttribute('data-eva-state'), false, '运行中不画')
  assert.equal(rows[5].hasAttribute('data-eva-state'), false, '空闲不画')
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

test('两个开关：关掉失败态、关掉隐藏官方点', () => {
  const rows = [sessionRow('a')]
  const { ctx } = setup({
    rows,
    byId: { a: { lastAgentError: 'boom' } },
    config: { failed: false, hideOfficialDot: false },
  })
  assert.equal(rows[0].hasAttribute('data-eva-state'), false, '关掉失败态后不标记')
  const css = globalThis.document.getElementById('dsh-session-eva-status-style').textContent
  assert.equal(css.includes('visibility:hidden'), false, '关掉开关后不写隐藏规则')
  assert.equal(ctx.effects.length, 1)
})

test('隐藏官方点的规则默认存在，且只作用于 pending 与 unread', () => {
  setup({ rows: [sessionRow('a')], statuses: new Map([['a', statusEntry()]]) })
  const css = globalThis.document.getElementById('dsh-session-eva-status-style').textContent
  assert.equal(css.includes('data-eva-state="pending"]>:first-child'), true)
  assert.equal(css.includes('data-eva-state="unread"]>:first-child'), true)
  assert.equal(css.includes('data-eva-state="failed"]>:first-child'), false)
})

test('卸载即净：标记、样式表、订阅、观察器一起清掉', () => {
  const rows = [sessionRow('a')]
  const { ctx, status } = setup({ rows, statuses: new Map([['a', statusEntry({ completionUnread: true })]]) })
  assert.equal(rows[0].getAttribute('data-eva-state'), 'unread')
  assert.notEqual(globalThis.document.getElementById('dsh-session-eva-status-style'), null)
  const dispose = ctx.effects[0]()
  dispose()
  assert.equal(rows[0].hasAttribute('data-eva-state'), false)
  assert.equal(globalThis.document.getElementById('dsh-session-eva-status-style'), null)
  assert.equal(status.listenerCount, 0)
  assert.equal(globalThis.window.__DSH_SESSION_EVA_STATUS__, undefined)
})

test('配置错当场抛，不静默降级', () => {
  installDom([sessionRow('a')])
  const plugin = loadPlugin()
  const ctx = pluginContext({
    uiSession: { sessionStatus: observable(new Map()) },
    sessions: { list: observable({ byId: {} }) },
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
