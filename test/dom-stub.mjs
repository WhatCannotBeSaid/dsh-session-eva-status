/**
 * 极简 DOM 替身：只覆盖 lib/client.js 真正用到的几个口子。
 *
 * 为什么要自己搭：客户端束里的 ReferenceError 在 DSH 之外不会被发现，一旦漏了，
 * 浏览器里整个插件静默失效。这里用最小替身把束跑一遍，至少保证加载路径干净。
 */

class FakeElement {
  constructor(tag) {
    this.tagName = tag
    this.children = []
    this.dataset = {}
    this.attributes = new Map()
    this.textContent = ''
    this.id = ''
    this.parent = null
  }

  appendChild(child) {
    this.children.push(child)
    child.parent = this
    return child
  }

  remove() {
    if (this.parent !== null) {
      this.parent.children = this.parent.children.filter(item => item !== this)
      this.parent = null
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }
}

/** 建一行会话行替身：只要 data-row-key 就够。 */
export function sessionRow(id) {
  const row = new FakeElement('div')
  row.setAttribute('data-row-key', `session:${id}`)
  return row
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback
    FakeMutationObserver.instances.push(this)
  }

  observe() {}

  disconnect() {
    this.disconnected = true
  }

  /** 手动触发一次，模拟 DOM 变动。 */
  trigger() {
    this.callback()
  }
}
FakeMutationObserver.instances = []

/**
 * 安装全局替身并返回句柄。
 * @param {FakeElement[]} rows 初始会话行
 */
export function installDom(rows) {
  const head = new FakeElement('head')
  const body = new FakeElement('body')
  const document = {
    head,
    body,
    createElement: tag => new FakeElement(tag),
    getElementById: id => head.children.find(child => child.id === id) ?? null,
    querySelectorAll: (selector) => {
      if (selector !== '[data-row-key^="session:"]') throw new Error(`替身不认这个选择器: ${selector}`)
      return rows
    },
  }
  globalThis.document = document
  globalThis.MutationObserver = FakeMutationObserver
  return { document, head, body, rows }
}

/** 一个可观察源替身：set() 会通知订阅者。 */
export function observable(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

/** 插件上下文替身：记录 ctx.effect 注册的清理函数。 */
export function pluginContext(services) {
  const effects = []
  return {
    get: key => services[key],
    effect(fn) {
      effects.push(fn)
      return () => {}
    },
    effects,
  }
}
