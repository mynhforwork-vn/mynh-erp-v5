'use client'

import { useEffect } from 'react'

/**
 * Desktop-only non-destructive enhancer for legacy and managed ERP tables.
 * Adds a grip to each data header without changing React's order, sort, action handlers
 * or the table's existing data. Widths are saved by route + table identity + header.
 */
export function DesktopTableColumnResize() {
  useEffect(() => {
    const shell = document.querySelector('.brand-shell-v1')
    const main = shell?.querySelector(':scope > .main')
    if (!main) return

    const mq = window.matchMedia('(min-width: 901px)')
    const clamp = (v:number) => Math.max(76, Math.min(680, Math.round(v)))
    const headerName = (th:HTMLTableCellElement) => {
      const clone = th.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.mynh-column-resize-grip').forEach(x => x.remove())
      return clone.textContent?.replace(/[↑↓↕⇅]/g, '').replace(/\s+/g, ' ').trim() || 'blank'
    }
    const headerCells = (table:HTMLTableElement) =>
      Array.from(table.querySelectorAll(':scope > thead > tr:first-child > th')) as HTMLTableCellElement[]
    const tableId = (table:HTMLTableElement) => {
      const custom = table.dataset.tableResizeKey
      const names = [...table.classList].filter(x => x !== 'table' && x !== 'active' && x !== 'striped' && x !== 'mynh-resizable-table').sort()
      const parent = table.closest('.table-card, .managed-table-shell, .tracking-hub-table-wrap, .whx-table-wrap')
      const parentClass = parent ? [...parent.classList].filter(x => x !== 'card').sort().join('.') : ''
      return 'mynh-col-widths-v1:' + location.pathname + ':' + (custom || names.join('.') || parentClass || 'table')
    }
    const readSaved = (table:HTMLTableElement):Record<string,number> => {
      try {
        const raw = window.localStorage.getItem(tableId(table))
        const obj = raw ? JSON.parse(raw) : null
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
        return Object.fromEntries(Object.entries(obj).filter(([k,v]) =>
          k.length < 160 && typeof v === 'number' && Number.isFinite(v) && v >= 76 && v <= 680
        )) as Record<string,number>
      } catch { return {} }
    }
    const save = (table:HTMLTableElement, values:Record<string,number>) => {
      try { window.localStorage.setItem(tableId(table), JSON.stringify(values)) } catch { /* storage disabled */ }
    }
    // Only take control of fixed widths once a user has customized this table.
    const freezeWidths = (table:HTMLTableElement, overrides:Record<string,number>) => {
      const ths = headerCells(table)
      if (!ths.length) return
      const visibleWidths = ths.map(th => clamp(th.getBoundingClientRect().width))
      const assigned = ths.map((th,i) => overrides[headerName(th)] || visibleWidths[i])
      let total = 0
      ths.forEach((th,i) => {
        const width = clamp(assigned[i])
        total += width
        th.style.setProperty('width', width+'px', 'important')
        th.style.setProperty('min-width', width+'px', 'important')
        th.style.setProperty('max-width', width+'px', 'important')
      })
      table.style.setProperty('table-layout', 'fixed', 'important')
      table.style.setProperty('width', total+'px', 'important')
      table.style.setProperty('min-width', total+'px', 'important')
      table.classList.add('mynh-resizable-table')
    }

    const enhance = (table:HTMLTableElement) => {
      if (table.closest('.system-slidebar-v1, .system-slidebar, .context-panel, .side-panel, .finance-panel, .receive-confirm-modal, .mobile-entity-list')) return
      const ths = headerCells(table)
      if (ths.length < 2) return
      const saved = readSaved(table)
      if (Object.keys(saved).length) freezeWidths(table,saved)
      ths.forEach(th => {
        if (th.querySelector(':scope > .mynh-column-resize-grip')) return
        if (th.matches('.bulk-select-col, .select-col, .row-actions-head, .checkbox-col')) return
        const label = headerName(th)
        if (label === 'blank') return
        th.classList.add('mynh-column-resize-head')
        const grip = document.createElement('span')
        grip.className = 'mynh-column-resize-grip'
        grip.tabIndex = 0
        grip.setAttribute('role','separator')
        grip.setAttribute('aria-orientation','vertical')
        grip.setAttribute('aria-label','Điều chỉnh độ rộng cột '+label)
        grip.setAttribute('title','Kéo để chỉnh độ rộng cột · Nhấp đúp để đặt lại')
        th.appendChild(grip)
        grip.addEventListener('click', e => {e.preventDefault();e.stopPropagation()})
        grip.addEventListener('pointerdown', e => {
          if (e.button !== 0 || !mq.matches) return
          e.preventDefault()
          e.stopPropagation()
          const table = th.closest('table') as HTMLTableElement | null
          if (!table) return
          const startX = e.clientX
          const initial = th.getBoundingClientRect().width
          freezeWidths(table,{})
          const baseline = headerCells(table).map(h => clamp(h.getBoundingClientRect().width))
          const idx = headerCells(table).indexOf(th)
          if (idx < 0) return
          const before = baseline[idx] || initial
          const originalSelection = document.body.style.userSelect
          document.body.style.userSelect='none'
          grip.classList.add('resizing')
          const move = (event:PointerEvent) => {
            const colWidth = clamp(before+event.clientX-startX)
            const ths = headerCells(table)
            const old = baseline.reduce((sum,x) => sum+x,0)
            table.style.setProperty('width', (old-before+colWidth)+'px','important')
            table.style.setProperty('min-width', (old-before+colWidth)+'px','important')
            th.style.setProperty('width',colWidth+'px','important')
            th.style.setProperty('min-width',colWidth+'px','important')
            th.style.setProperty('max-width',colWidth+'px','important')
          }
          const finish = (event:PointerEvent) => {
            window.removeEventListener('pointermove',move,true)
            window.removeEventListener('pointerup',finish,true)
            window.removeEventListener('pointercancel',finish,true)
            grip.classList.remove('resizing')
            document.body.style.userSelect=originalSelection
            const next=clamp(before+event.clientX-startX)
            const widths=readSaved(table)
            widths[label]=next
            save(table,widths)
            freezeWidths(table,widths)
          }
          window.addEventListener('pointermove',move,true)
          window.addEventListener('pointerup',finish,true)
          window.addEventListener('pointercancel',finish,true)
        })
        grip.addEventListener('dblclick',e=>{
          e.preventDefault();e.stopPropagation()
          const table=th.closest('table') as HTMLTableElement | null
          if(!table)return
          const widths=readSaved(table)
          delete widths[label]
          if(!Object.keys(widths).length){
            save(table,{})
            table.style.removeProperty('table-layout')
            table.style.removeProperty('width')
            table.style.removeProperty('min-width')
            table.classList.remove('mynh-resizable-table')
            headerCells(table).forEach(h=>{
              h.style.removeProperty('width');h.style.removeProperty('min-width');h.style.removeProperty('max-width')
            })
          }else{save(table,widths);freezeWidths(table,widths)}
        })
        grip.addEventListener('keydown',e=>{
          if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return
          e.preventDefault();e.stopPropagation()
          const table=th.closest('table') as HTMLTableElement | null
          if(!table)return
          const current=clamp(th.getBoundingClientRect().width)
          const widths=readSaved(table)
          widths[label]=clamp(current+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?24:12))
          save(table,widths);freezeWidths(table,widths)
        })
      })
    }
    let scheduled = 0
    const scan=()=>{
      scheduled=0
      if(!mq.matches)return
      main.querySelectorAll('table.table').forEach(t=>enhance(t as HTMLTableElement))
    }
    const queue=()=>{
      if(!scheduled)scheduled=window.requestAnimationFrame(scan)
    }
    const observer=new MutationObserver(records=>{
      if(records.some(rec=>Array.from(rec.addedNodes).some(node=>{
        if(node.nodeType!==Node.ELEMENT_NODE)return false
        const el=node as Element
        return el.matches('table,thead,tr,th')||Boolean(el.querySelector('table,thead,tr,th'))
      })))queue()
    })
    observer.observe(main,{childList:true,subtree:true})
    const onChange=()=>{if(mq.matches)queue()}
    mq.addEventListener('change',onChange)
    queue()
    return ()=>{
      observer.disconnect()
      mq.removeEventListener('change',onChange)
      if(scheduled)window.cancelAnimationFrame(scheduled)
    }
  },[])
  return null
}
