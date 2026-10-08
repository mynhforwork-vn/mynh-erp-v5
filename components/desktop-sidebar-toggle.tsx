'use client'

import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'mynh-erp-desktop-sidebar'

/** Desktop navigation only. Does not change right-hand detail/slide panels. */
export function DesktopSidebarToggle() {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stored: string | null = null
    try { stored = window.localStorage.getItem(STORAGE_KEY) } catch { /* storage may be disabled */ }
    const compactDefault = window.matchMedia('(min-width: 901px) and (max-width: 1180px)').matches
    setCollapsed(stored === 'collapsed' ? true : stored === 'expanded' ? false : compactDefault)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const shell = buttonRef.current?.closest('.brand-shell-v1')
    if (!shell) return
    shell.classList.toggle('desktop-sidebar-collapsed', collapsed)
    shell.classList.toggle('desktop-sidebar-expanded', !collapsed)
    return () => {
      shell.classList.remove('desktop-sidebar-collapsed', 'desktop-sidebar-expanded')
    }
  }, [collapsed, ready])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded') } catch { /* ephemeral preference */ }
  }

  const compact = ready ? collapsed : false
  return <div className="desktop-sidebar-toggle-row">
    <button
      ref={buttonRef}
      type="button"
      className="desktop-sidebar-toggle"
      onClick={toggle}
      aria-label={compact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
      aria-expanded={!compact}
      title={compact ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {compact ? <path d="m13 9 3 3-3 3" /> : <path d="m16 9-3 3 3 3" />}
      </svg>
    </button>
  </div>
}
