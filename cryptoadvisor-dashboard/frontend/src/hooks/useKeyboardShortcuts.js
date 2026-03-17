import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    let buffer = ''
    let timer = null

    const handleKeyDown = (e) => {
      // Don't capture when typing in inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

      // Escape closes modals/chat
      if (e.key === 'Escape') {
        document.querySelector('.chat-close-btn')?.click()
        document.querySelector('.ai-modal-close')?.click()
        return
      }

      // / to focus search (if exists)
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const search = document.querySelector('[data-shortcut-search]')
        if (search) { e.preventDefault(); search.focus() }
        return
      }

      // g + key navigation (vim-style)
      clearTimeout(timer)
      buffer += e.key.toLowerCase()
      timer = setTimeout(() => { buffer = '' }, 500)

      const shortcuts = {
        'gd': '/',
        'gt': '/technical',
        'gw': '/wallet',
        'gp': '/portfolio',
        'ga': '/alerts',
        'gb': '/ai-briefing',
        'gs': '/settings',
        'gr': '/ai-risk',
        'ge': '/exchanges',
      }

      if (shortcuts[buffer]) {
        navigate(shortcuts[buffer])
        buffer = ''
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])
}
