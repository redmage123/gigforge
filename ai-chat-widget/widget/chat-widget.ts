/**
 * AI Chat Widget — vanilla TypeScript IIFE
 * Embed with: <script src="/widget.js" data-api-url="https://your-api.com"></script>
 */
;(function () {
  'use strict'

  // ─── Configuration ──────────────────────────────────────────────────────────
  const scripts = document.querySelectorAll('script[data-api-url]')
  const currentScript = scripts[scripts.length - 1] as HTMLScriptElement
  const API_URL = (currentScript?.getAttribute('data-api-url') ?? '').replace(/\/$/, '')
  const TOKEN_KEY = 'cw_token'

  // ─── State ───────────────────────────────────────────────────────────────────
  let isOpen = false
  let isLoading = false
  let authToken: string | null = localStorage.getItem(TOKEN_KEY)

  interface Message {
    role: 'user' | 'assistant' | 'error'
    content: string
    sources?: Array<{ title: string; similarity: number }>
  }

  const messages: Message[] = []

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const styles = `
    #cw-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #2563eb; color: #fff; border: none;
      cursor: pointer; box-shadow: 0 4px 16px rgba(37,99,235,0.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s; font-size: 24px;
    }
    #cw-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(37,99,235,0.5); }
    #cw-panel {
      position: fixed; bottom: 92px; right: 24px; z-index: 99998;
      width: 360px; max-height: 520px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; transition: opacity 0.2s, transform 0.2s;
    }
    #cw-panel.cw-hidden { opacity: 0; transform: translateY(12px); pointer-events: none; }
    #cw-header {
      background: #2563eb; color: #fff; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 600; font-size: 15px;
    }
    #cw-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; }
    #cw-messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f8fafc; min-height: 200px;
    }
    .cw-msg { max-width: 88%; padding: 9px 13px; border-radius: 12px; line-height: 1.5; word-break: break-word; }
    .cw-msg.user { background: #2563eb; color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
    .cw-msg.assistant { background: #fff; color: #1e293b; align-self: flex-start; border: 1px solid #e2e8f0; border-bottom-left-radius: 3px; }
    .cw-msg.error { background: #fef2f2; color: #b91c1c; align-self: flex-start; border: 1px solid #fecaca; border-radius: 12px; }
    .cw-sources { font-size: 11px; color: #64748b; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
    .cw-source-tag { display: inline-block; background: #f1f5f9; border-radius: 4px; padding: 2px 6px; margin: 2px 2px 0 0; }
    #cw-auth { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    #cw-auth input {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px;
      font-size: 14px; outline: none; width: 100%; box-sizing: border-box;
      transition: border-color 0.15s;
    }
    #cw-auth input:focus { border-color: #2563eb; }
    #cw-auth button {
      background: #2563eb; color: #fff; border: none; border-radius: 8px;
      padding: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
    }
    #cw-auth button:hover { background: #1d4ed8; }
    #cw-auth .cw-err { color: #b91c1c; font-size: 12px; text-align: center; }
    #cw-auth .cw-toggle { text-align: center; color: #64748b; font-size: 12px; cursor: pointer; }
    #cw-auth .cw-toggle span { color: #2563eb; text-decoration: underline; cursor: pointer; }
    #cw-footer { padding: 10px 12px; border-top: 1px solid #e2e8f0; background: #fff; }
    #cw-form { display: flex; gap: 8px; align-items: flex-end; }
    #cw-input {
      flex: 1; border: 1px solid #cbd5e1; border-radius: 10px;
      padding: 9px 12px; font-size: 14px; resize: none;
      outline: none; font-family: inherit; line-height: 1.4;
      max-height: 100px; overflow-y: auto; transition: border-color 0.15s;
    }
    #cw-input:focus { border-color: #2563eb; }
    #cw-send {
      background: #2563eb; color: #fff; border: none;
      border-radius: 10px; padding: 9px 14px; cursor: pointer;
      font-size: 16px; transition: background 0.15s; flex-shrink: 0;
    }
    #cw-send:hover { background: #1d4ed8; }
    #cw-send:disabled { background: #93c5fd; cursor: not-allowed; }
    .cw-typing { display: flex; gap: 4px; align-items: center; padding: 6px 2px; }
    .cw-dot { width: 7px; height: 7px; background: #94a3b8; border-radius: 50%; animation: cw-bounce 1.2s infinite; }
    .cw-dot:nth-child(2) { animation-delay: 0.2s; }
    .cw-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cw-bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
    #cw-logout { font-size: 11px; color: #94a3b8; text-align: right; cursor: pointer; padding: 0 0 4px; }
    #cw-logout:hover { color: #64748b; }
  `

  // ─── DOM helpers ─────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = styles
    document.head.appendChild(style)
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (string | Node)[]): HTMLElementTagNameMap[K] {
    const elem = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') elem.className = v
      else elem.setAttribute(k, v)
    })
    children.forEach((c) => {
      if (typeof c === 'string') elem.appendChild(document.createTextNode(c))
      else elem.appendChild(c)
    })
    return elem
  }

  // ─── Widget DOM ──────────────────────────────────────────────────────────────
  let panel: HTMLDivElement
  let messagesEl: HTMLDivElement
  let inputEl: HTMLTextAreaElement
  let sendBtn: HTMLButtonElement
  let chatView: HTMLDivElement
  let authView: HTMLDivElement
  let authErr: HTMLDivElement
  let authMode: 'login' | 'register' = 'login'
  let authEmailEl: HTMLInputElement
  let authPasswordEl: HTMLInputElement
  let authSubmitBtn: HTMLButtonElement
  let authToggleEl: HTMLDivElement

  function buildWidget() {
    // Floating button
    const btn = el('button', { id: 'cw-btn', 'aria-label': 'Open chat' })
    btn.innerHTML = '💬'
    btn.addEventListener('click', togglePanel)

    // Panel
    panel = el('div', { id: 'cw-panel', class: 'cw-hidden', role: 'dialog', 'aria-label': 'Chat' }) as HTMLDivElement

    // Header
    const header = el('div', { id: 'cw-header' })
    const title = el('span', {}, '🤖 AI Assistant')
    const closeBtn = el('button', { id: 'cw-close', 'aria-label': 'Close' })
    closeBtn.innerHTML = '✕'
    closeBtn.addEventListener('click', closePanel)
    header.appendChild(title)
    header.appendChild(closeBtn)

    // Chat view
    chatView = el('div', { style: 'display:flex;flex-direction:column;flex:1;overflow:hidden;' }) as HTMLDivElement
    messagesEl = el('div', { id: 'cw-messages', 'aria-live': 'polite' }) as HTMLDivElement

    const footer = el('div', { id: 'cw-footer' })
    const logoutLink = el('div', { id: 'cw-logout' }, 'Sign out')
    logoutLink.addEventListener('click', doLogout)

    const form = el('div', { id: 'cw-form' })
    inputEl = el('textarea', { id: 'cw-input', placeholder: 'Ask a question…', rows: '1', 'aria-label': 'Message' }) as HTMLTextAreaElement
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        doSend()
      }
    })
    sendBtn = el('button', { id: 'cw-send', 'aria-label': 'Send' }) as HTMLButtonElement
    sendBtn.innerHTML = '➤'
    sendBtn.addEventListener('click', doSend)

    form.appendChild(inputEl)
    form.appendChild(sendBtn)
    footer.appendChild(logoutLink)
    footer.appendChild(form)
    chatView.appendChild(messagesEl)
    chatView.appendChild(footer)

    // Auth view
    authView = el('div', { id: 'cw-auth' }) as HTMLDivElement
    authEmailEl = el('input', { type: 'email', placeholder: 'Email', autocomplete: 'email' }) as HTMLInputElement
    authPasswordEl = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' }) as HTMLInputElement
    authErr = el('div', { class: 'cw-err' }) as HTMLDivElement
    authSubmitBtn = el('button', {}, 'Sign in') as HTMLButtonElement
    authSubmitBtn.addEventListener('click', doAuth)
    authToggleEl = el('div', { class: 'cw-toggle' }) as HTMLDivElement
    setAuthMode('login')

    authView.appendChild(el('div', { style: 'font-weight:600;font-size:15px;text-align:center' }, 'Sign in to chat'))
    authView.appendChild(authEmailEl)
    authView.appendChild(authPasswordEl)
    authView.appendChild(authErr)
    authView.appendChild(authSubmitBtn)
    authView.appendChild(authToggleEl)

    panel.appendChild(header)
    panel.appendChild(authView)
    panel.appendChild(chatView)

    document.body.appendChild(btn)
    document.body.appendChild(panel)

    refreshView()
  }

  function setAuthMode(mode: 'login' | 'register') {
    authMode = mode
    authSubmitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account'
    authToggleEl.innerHTML = mode === 'login'
      ? "Don't have an account? <span>Register</span>"
      : 'Already have an account? <span>Sign in</span>'
    authToggleEl.querySelector('span')!.addEventListener('click', () => {
      setAuthMode(mode === 'login' ? 'register' : 'login')
    })
    authErr.textContent = ''
  }

  function refreshView() {
    if (authToken) {
      authView.style.display = 'none'
      chatView.style.display = 'flex'
    } else {
      authView.style.display = 'flex'
      chatView.style.display = 'none'
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen ? closePanel() : openPanel()
  }

  function openPanel() {
    isOpen = true
    panel.classList.remove('cw-hidden')
    if (authToken) inputEl.focus()
  }

  function closePanel() {
    isOpen = false
    panel.classList.add('cw-hidden')
  }

  async function doAuth() {
    const email = authEmailEl.value.trim()
    const password = authPasswordEl.value
    if (!email || !password) { authErr.textContent = 'Email and password required.'; return }

    authSubmitBtn.disabled = true
    authErr.textContent = ''

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { token?: string; error?: { message: string } }
      if (!res.ok) throw new Error(data.error?.message ?? 'Authentication failed')
      authToken = data.token!
      localStorage.setItem(TOKEN_KEY, authToken)
      refreshView()
    } catch (e: unknown) {
      authErr.textContent = (e as Error).message
    } finally {
      authSubmitBtn.disabled = false
    }
  }

  function doLogout() {
    authToken = null
    localStorage.removeItem(TOKEN_KEY)
    messages.length = 0
    messagesEl.innerHTML = ''
    refreshView()
  }

  async function doSend() {
    const text = inputEl.value.trim()
    if (!text || isLoading) return

    inputEl.value = ''
    addMessage({ role: 'user', content: text })
    const typingEl = addTypingIndicator()
    isLoading = true
    sendBtn.disabled = true

    try {
      const res = await fetch(API_URL + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ query: text }),
      })

      const data = await res.json() as {
        answer?: string
        sources?: Array<{ title: string; similarity: number }>
        error?: { message: string }
      }

      typingEl.remove()

      if (!res.ok) {
        if (res.status === 401) { doLogout(); return }
        throw new Error(data.error?.message ?? 'Request failed')
      }

      addMessage({ role: 'assistant', content: data.answer ?? '', sources: data.sources })
    } catch (e: unknown) {
      typingEl.remove()
      addMessage({ role: 'error', content: (e as Error).message })
    } finally {
      isLoading = false
      sendBtn.disabled = false
      inputEl.focus()
    }
  }

  function addMessage(msg: Message) {
    messages.push(msg)
    const wrapper = el('div', { class: `cw-msg ${msg.role}` })
    const textNode = document.createElement('div')
    textNode.textContent = msg.content
    wrapper.appendChild(textNode)

    if (msg.sources && msg.sources.length > 0) {
      const sources = el('div', { class: 'cw-sources' }, 'Sources: ')
      msg.sources.forEach((s) => {
        const tag = el('span', { class: 'cw-source-tag' }, `${s.title} (${Math.round(s.similarity * 100)}%)`)
        sources.appendChild(tag)
      })
      wrapper.appendChild(sources)
    }

    messagesEl.appendChild(wrapper)
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function addTypingIndicator(): HTMLDivElement {
    const wrapper = el('div', { class: 'cw-msg assistant' }) as HTMLDivElement
    const dots = el('div', { class: 'cw-typing' })
    for (let i = 0; i < 3; i++) dots.appendChild(el('div', { class: 'cw-dot' }))
    wrapper.appendChild(dots)
    messagesEl.appendChild(wrapper)
    messagesEl.scrollTop = messagesEl.scrollHeight
    return wrapper
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles()
    buildWidget()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
