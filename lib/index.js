/**
 * dsh-session-eva-status —— DSH 宿主侧入口。
 *
 * 这个插件只在浏览器里干活：着色靠客户端半边（lib/client.js）读官方状态并给
 * 会话行打一个 data 属性。宿主侧因此没有任何注册，只保留一个空 apply，
 * 让 profile 里那条 entry 有东西可装载（与官方 ui-schedule 的空 node 半边同理）。
 */

export const name = 'dsh-session-eva-status'
export const inject = []

/** 宿主侧无事可做：所有行为都在浏览器半边。 */
export function apply() {}
