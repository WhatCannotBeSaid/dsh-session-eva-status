/**
 * dsh-session-eva-status —— 浏览器半边（侧栏会话行状态着色）。
 *
 * 这份文件是宿主直接送给浏览器的「束」，不是普通 ESM：必须包在
 * window.__ModuleLoader__.load({ id, factory }) 信封里，只能 require 外壳种子里
 * 预置的模块，并导出具名的 name / inject / apply。本插件不渲染任何 React 组件，
 * 所以这里一个种子模块都不 require。
 *
 * 它不拥有任何状态：只读官方已有的事实，给每一行写一个 data 属性，再用一张
 * 注入的样式表给那个属性上色。四种被着色的状态：
 *
 *   pending   有待处理的交互（批准 / 提问 / 计划评审）→ 橙轨 + 橙底 + 呼吸
 *   unread    跑完但没看过（completionUnread）        → 紫轨 + 紫底
 *   failed    上一轮 agent 报错（lastAgentError）     → 红轨 + 右侧红黑斜纹
 *   archived  在归档集合里                            → 整行压暗到 60%
 *
 * 运行中、空闲、置顶三种行不画任何东西：置顶交给官方图钉与置顶排序。
 *
 * 用到的锚点（都在 dsh 0.2.0-rc.2 上核对过）：
 *   - 行：      [data-row-key="session:<id>"]（ui-workspace 的 Rows.tsx 渲染）
 *   - 状态：    ctx.uiSession.sessionStatus（running / pendingInteraction / completionUnread）
 *   - 报错：    ctx.sessions.list 快照里 byId[id].lastAgentError
 *   - 归档：    ctx.workspaces.list 快照里 archivedSessionIds
 *
 * 行自身的 background-color 一律不动，所以官方的 hover 与选中反馈照旧：
 * 底色与斜纹走 background-image 图层，左轨走 inset box-shadow（跟随行圆角）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-eva-status',
  factory: () => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /** 调试/自检入口，卸载时删除。 */
    const GLOBAL_KEY = '__DSH_SESSION_EVA_STATUS__'
    /** 注入样式表的 id 与归属标记（防兄弟插件 HMR 认领后删掉）。 */
    const STYLE_ID = 'dsh-session-eva-status-style'
    const PLUGIN_ID = 'dsh-session-eva-status'
    /** 会话行锚点。 */
    const ROW_SELECTOR = '[data-row-key^="session:"]'
    const ROW_PREFIX = 'session:'
    /** 行上承载状态的属性（React 不管它，重渲染不会冲掉）。 */
    const STATE_ATTR = 'data-eva-state'

    /** 设计定稿的 EVA 调色；不跟随主题品牌色，明暗主题下都读得清。 */
    const DEFAULT_COLORS = {
      pending: '#FF5C1A',
      unread: '#7A4FD6',
      failed: '#FF3B30',
    }
    const DEFAULT_BREATHE_MS = 1600

    /**
     * 校验并补齐配置。配置错就当场抛，不静默降级。
     * @param {unknown} input cordis.patch.yml 里 entry 的 config，或 undefined。
     * @returns {{hideOfficialDot: boolean, failed: boolean, archived: boolean, breatheMs: number, colors: {pending: string, unread: string, failed: string}}}
     */
    function resolveConfig(input) {
      const raw = input === undefined || input === null ? {} : input
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError(`${PLUGIN_ID}: config 必须是对象`)
      }
      const colors = { ...DEFAULT_COLORS, ...(raw.colors === undefined || raw.colors === null ? {} : raw.colors) }
      for (const key of Object.keys(DEFAULT_COLORS)) {
        const value = colors[key]
        if (typeof value !== 'string' || value.trim() === '') {
          throw new TypeError(`${PLUGIN_ID}: colors.${key} 必须是非空 CSS 颜色字符串`)
        }
      }
      const breatheMs = raw.breatheMs === undefined ? DEFAULT_BREATHE_MS : raw.breatheMs
      if (typeof breatheMs !== 'number' || !Number.isFinite(breatheMs) || breatheMs < 200) {
        throw new TypeError(`${PLUGIN_ID}: breatheMs 必须是不小于 200 的数字`)
      }
      return {
        hideOfficialDot: raw.hideOfficialDot !== false,
        failed: raw.failed !== false,
        archived: raw.archived !== false,
        breatheMs,
        colors,
      }
    }

    /** 半透明版本，用于底色与呼吸低点。 */
    const faint = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

    /**
     * 生成整张样式表。所有选择器都带 html 前缀：官方 hover/选中的
     * `background` 简写与本表同权重，靠更高权重与后注入取胜。
     * @param {ReturnType<typeof resolveConfig>} config
     * @returns {string}
     */
    function buildCss(config) {
      const { pending, unread, failed } = config.colors
      const pendingTint = faint(pending, 8)
      const unreadTint = faint(unread, 6)
      const failedTint = faint(failed, 8)
      const pendingFaint = faint(pending, 35)
      const lines = [
        `html ${ROW_SELECTOR}[${STATE_ATTR}="pending"]{`,
        `box-shadow:inset 3px 0 0 ${pending};`,
        `background-image:linear-gradient(${pendingTint},${pendingTint});`,
        `animation:${PLUGIN_ID}-breathe ${config.breatheMs}ms ease-in-out infinite}`,
        `html ${ROW_SELECTOR}[${STATE_ATTR}="unread"]{`,
        `box-shadow:inset 3px 0 0 ${unread};`,
        `background-image:linear-gradient(${unreadTint},${unreadTint})}`,
        `html ${ROW_SELECTOR}[${STATE_ATTR}="failed"]{`,
        `box-shadow:inset 3px 0 0 ${failed};`,
        `background-image:linear-gradient(${failedTint},${failedTint}),repeating-linear-gradient(45deg,${failed} 0 3px,#1A1A1A 3px 6px);`,
        `background-size:100% 100%,7px 100%;background-position:0 0,100% 0;background-repeat:no-repeat,no-repeat}`,
        `html ${ROW_SELECTOR}[${STATE_ATTR}="archived"]{opacity:.6}`,
      ]
      if (config.hideOfficialDot) {
        // 这两行的行首 16px 格里只有官方状态点：leading 席只在 primary status 为
        // idle 时渲染，archived 行整格留空。所以隐藏整格内容等于只隐藏状态点。
        lines.push(
          `html ${ROW_SELECTOR}[${STATE_ATTR}="pending"]>:first-child,`,
          `html ${ROW_SELECTOR}[${STATE_ATTR}="unread"]>:first-child{visibility:hidden}`,
        )
      }
      lines.push(
        `@keyframes ${PLUGIN_ID}-breathe{`,
        `0%,100%{box-shadow:inset 3px 0 0 ${pending}}`,
        `50%{box-shadow:inset 3px 0 0 ${pendingFaint}}}`,
        `@media (prefers-reduced-motion: reduce){`,
        `html ${ROW_SELECTOR}[${STATE_ATTR}="pending"]{animation:none}}`,
      )
      return lines.join('')
    }

    /** 注入样式表；已存在就补归属标记（热替换后自愈）。 */
    function ensureStyle(config) {
      let tag = document.getElementById(STYLE_ID)
      if (tag === null) {
        tag = document.createElement('style')
        tag.id = STYLE_ID
        document.head.appendChild(tag)
      }
      tag.textContent = buildCss(config)
      tag.dataset.plugin = PLUGIN_ID
      tag.dataset.pluginCss = `${PLUGIN_ID}/styles`
      return tag
    }

    /**
     * 取一个必需服务；缺失即报错，不静默跳过。
     * @param {object} ctx 插件上下文
     * @param {string} key 服务名
     */
    function requireService(ctx, key) {
      const service = ctx.get(key)
      if (service === undefined || service === null) {
        throw new Error(`${PLUGIN_ID}: 缺少服务 ${key}`)
      }
      return service
    }

    /**
     * 取一个必需的可观察源；缺失即报错。
     * @param {unknown} source 候选源
     * @param {string} label 报错里用的名字
     */
    function requireObservable(source, label) {
      if (source === undefined || source === null
        || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
        throw new Error(`${PLUGIN_ID}: ${label} 不是可观察源`)
      }
      return source
    }

    const name = PLUGIN_ID
    const inject = ['uiSession', 'sessions', 'workspaces']

    /**
     * 给侧栏会话行按官方状态打标记。
     * @param {object} ctx 插件上下文（已声明 uiSession / sessions / workspaces）
     * @param {unknown} rawConfig entry 的 config
     */
    function apply(ctx, rawConfig) {
      const config = resolveConfig(rawConfig)
      const status = requireObservable(
        requireService(ctx, 'uiSession').sessionStatus, 'uiSession.sessionStatus')
      const sessionList = requireObservable(requireService(ctx, 'sessions').list, 'sessions.list')
      const workspaceList = requireObservable(requireService(ctx, 'workspaces').list, 'workspaces.list')

      ensureStyle(config)

      /**
       * 一个会话当前该有的标记；null 表示这一行不画东西。
       * @param {string} id 会话 id
       * @param {Map<string, {pendingInteraction?: unknown, completionUnread?: boolean}>} statuses 官方状态快照
       * @param {Record<string, {lastAgentError?: string | null}>} byId 会话列表快照
       * @param {Set<string> | null} archived 归档集合（关闭归档开关时为 null）
       * @returns {'pending' | 'unread' | 'failed' | 'archived' | null}
       */
      function stateOf(id, statuses, byId, archived) {
        if (archived !== null && archived.has(id)) return 'archived'
        const entry = statuses.get(id)
        if (entry !== undefined && entry.pendingInteraction !== undefined) return 'pending'
        if (config.failed && byId[id] !== undefined && byId[id].lastAgentError != null) return 'failed'
        if (entry !== undefined && entry.completionUnread === true) return 'unread'
        return null
      }

      /** 全量对账一次：读三份官方快照，逐行写/清 data 属性。 */
      function sync() {
        const rows = document.querySelectorAll(ROW_SELECTOR)
        if (rows.length === 0) return
        const statuses = status.getSnapshot()
        const byId = sessionList.getSnapshot().byId
        const archived = config.archived
          ? new Set(workspaceList.getSnapshot().archivedSessionIds)
          : null
        for (const row of rows) {
          const key = row.getAttribute('data-row-key')
          if (typeof key !== 'string' || !key.startsWith(ROW_PREFIX)) continue
          const next = stateOf(key.slice(ROW_PREFIX.length), statuses, byId, archived)
          if (next === null) {
            if (row.hasAttribute(STATE_ATTR)) row.removeAttribute(STATE_ATTR)
          } else if (row.getAttribute(STATE_ATTR) !== next) {
            row.setAttribute(STATE_ATTR, next)
          }
        }
      }

      let scheduled = false
      /** 把同一轮里的多次触发合并成一个微任务。 */
      function schedule() {
        if (scheduled) return
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
          sync()
        })
      }

      const offs = [
        status.subscribe(schedule),
        sessionList.subscribe(schedule),
        workspaceList.subscribe(schedule),
      ]
      const observer = new MutationObserver(schedule)
      // 只盯行键：React 重渲染整段重写 class，但 data-row-key 只在换行时变。
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['data-row-key'],
      })
      sync()

      /** 卸载即净：订阅、观察器、行属性、样式表、调试入口一起清掉。 */
      function dispose() {
        for (const off of offs.splice(0)) {
          try {
            off()
          } catch { /* 已注销 */ }
        }
        try {
          observer.disconnect()
        } catch { /* 已断开 */ }
        for (const row of document.querySelectorAll(ROW_SELECTOR)) row.removeAttribute(STATE_ATTR)
        const tag = document.getElementById(STYLE_ID)
        if (tag !== null) tag.remove()
        if (window[GLOBAL_KEY] === api) delete window[GLOBAL_KEY]
      }

      const api = { sync, stateOf, dispose, config }
      window[GLOBAL_KEY] = api
      ctx.effect(() => dispose, `${PLUGIN_ID}: dispose`)
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
