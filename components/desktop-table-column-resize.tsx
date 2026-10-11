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
    const clampForHeader = (th:HTMLTableCellElement,v:number) =>
      th.closest('table.tracking-hub-table-v2')
        ? Math.max(76,Math.min(2400,Math.round(v)))
        : clamp(v)
    const compactCol = (th:HTMLTableCellElement) =>
      th.matches('.bulk-select-col, .select-col, .row-actions-head, .checkbox-col')
    const headerWidth = (th:HTMLTableCellElement) =>
      th.classList.contains('tracking-action-head') ? 44 :
      compactCol(th)
        ? Math.max(24, Math.min(140, Math.round(th.getBoundingClientRect().width)))
        : clampForHeader(th,th.getBoundingClientRect().width)
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
        const ceiling=table.classList.contains('tracking-hub-table-v2')?2400:680
        return Object.fromEntries(Object.entries(obj).filter(([k,v]) =>
          k.length < 160 && typeof v === 'number' && Number.isFinite(v) && v >= 76 && v <= ceiling
        )) as Record<string,number>
      } catch { return {} }
    }
    const save = (table:HTMLTableElement, values:Record<string,number>) => {
      try { window.localStorage.setItem(tableId(table), JSON.stringify(values)) } catch { /* storage disabled */ }
      // The source is already fitted. Other HUB tables mirror its exact widths
      // instead of independently redistributing columns at mouse release.
      window.dispatchEvent(new CustomEvent('mynh-table-column-width-changed',{detail:{key:tableId(table),source:table}}))
    }
    const clearInlineWidths = (table:HTMLTableElement) => {
      table.style.removeProperty('table-layout')
      table.style.removeProperty('width')
      table.style.removeProperty('min-width')
      table.classList.remove('mynh-resizable-table')
      if(table.matches('.mynh-p1-semantic-table.order-table')){
        table.querySelectorAll('colgroup col').forEach(col=>{
          ;(col as HTMLElement).style.removeProperty('width')
          ;(col as HTMLElement).style.removeProperty('min-width')
          ;(col as HTMLElement).style.removeProperty('max-width')
        })
      }
      headerCells(table).forEach(th=>{
        th.style.removeProperty('width')
        th.style.removeProperty('min-width')
        th.style.removeProperty('max-width')
      })
    }
    // Tracking panes need responsive widths even when manual widths were saved.
    // Saved preferences remain untouched: panel-fit widths are presentation only.
    const fitTrackingPanel = (
      table:HTMLTableElement,ths:HTMLTableCellElement[],
      preferred:number[],overrides:Record<string,number>
    ) => {
      const lane=table.closest('.tracking-hub-table-wrap-v2') as HTMLElement|null
      if(!lane)return preferred
      const withPanel=Boolean(table.closest('.tracking-content-workspace.with-panel'))
      // Fit to the actual lane. Only narrower-than-readable lanes scroll locally.
      // This is presentation-only: saved user column widths remain unmodified.
      const target=Math.max(withPanel?760:900,Math.floor(lane.clientWidth)-2)
      const columnIndex=(key:string)=>ths.findIndex(th=>th.classList.contains('tracking-col-'+key))
      // Older per-user saved widths can predate the detail column. Protect the
      // status/detail headers even when those legacy preferences are restored.
      const fitted=preferred.map((value,i)=>ths[i].classList.contains('tracking-col-status')
        ? Math.max(withPanel?132:150,value)
        : ths[i].classList.contains('tracking-col-detail')
          ? Math.max(withPanel?155:174,value)
          : value)
      let excess=fitted.reduce((sum,v)=>sum+v,0)-target
      if(excess>0){
        const minByColumn:Record<string,number>=withPanel
          ? {product:92,recipient:110,status:132,detail:155,order:120,cod:70}
          : {product:114,recipient:148,status:150,detail:174,order:135,cod:78}
        // Compress uncustomized cells first; only shrink a custom width as needed.
        const priority=['product','recipient','detail','status','order','cod']
        for(const custom of [false,true]){
          for(const name of priority){
            if(excess<=0)break
            const index=columnIndex(name)
            if(index<0)continue
            const saved=Boolean(overrides[headerName(ths[index])])
            if(saved!==custom)continue
            const reduction=Math.min(excess,Math.max(0,fitted[index]-minByColumn[name]))
            fitted[index]-=reduction
            excess-=reduction
          }
        }
      }else if(excess<0){
        let remainder=-excess
        const flex=['product','recipient'].map(columnIndex).filter(i=>i>=0)
        const uncustomized=flex.filter(i=>!overrides[headerName(ths[i])])
        // At typical laptop widths a hand-resized column stays exact.
        // Ultra-wide spare space is shared to avoid a single giant column.
        if(uncustomized.length && remainder<=300){
          const each=Math.floor(remainder/uncustomized.length)
          uncustomized.forEach((index,i)=>{
            const addition=i===uncustomized.length-1?remainder-each*i:each
            fitted[index]+=addition
          })
        }else if(flex.length){
          const each=Math.floor(remainder/flex.length)
          flex.forEach((index,i)=>{
            fitted[index]+=i===flex.length-1?remainder-each*i:each
          })
        }else{
          // Column visibility can hide both flexible fields: fill the largest
          // remaining information column, never Selection or Xử lý.
          const available=['order','detail','status','cod'].map(columnIndex).find(i=>i>=0)
          if(available!==undefined)fitted[available]+=remainder
        }
      }
      return fitted
    }
    // P1 drawer presentation is fitted to the real lane even when a user
    // previously dragged columns wider. Preferences are never overwritten:
    // leaving the slidebar restores the manually saved full-table widths.
    const purchasePanelWeights={
      account:{number:22,username:102,platform:53,phone:90,email:98,
        status:72,mobile:81,browser:72,voucher:65,orders:40,createdAt:106,note:76},
      order:{number:20,order:108,username:73,device:118,time:103,product:121,
        cod:60,tracking:145,voucher:57,status:91},
    }
    const purchasePanelContext=(table:HTMLTableElement)=>{
      if(window.innerWidth<1100)return null
      if(!table.closest('.account-workspace.with-panel,.order-workspace.with-panel'))return null
      if(!table.matches('.mynh-p1-semantic-table.user-table,.mynh-p1-semantic-table.order-table'))return null
      return table.closest('.account-table-card,.order-table-card') as HTMLElement|null
    }
    const fitPurchasePanel=(table:HTMLTableElement,ths:HTMLTableCellElement[])=>{
      const pane=purchasePanelContext(table)
      if(!pane)return null
      const weights=table.classList.contains('user-table')
        ?purchasePanelWeights.account:purchasePanelWeights.order
      const list=ths.map(th=>{
        if(th.matches('.bulk-select-col'))return 24
        const key=th.dataset.accountCol??th.dataset.orderCol??''
        return (weights as Record<string,number>)[key]??70
      })
      const totalWeight=list.reduce((sum,w)=>sum+w,0)
      const target=Math.max(100,Math.floor(pane.clientWidth)-2)
      const result=list.map(w=>Math.max(16,Math.floor(target*w/totalWeight)))
      const left=target-result.reduce((sum,w)=>sum+w,0)
      if(result.length)result[result.length-1]+=left
      return result
    }

    // Orders own their semantic colgroup. Fit *both* colgroup and headers to
    // the real table lane, including user-resized columns and reordered columns.
    // A narrow lane scrolls inside the card only when readable minimums cannot fit.
    const orderFit=(table:HTMLTableElement,ths:HTMLTableCellElement[],saved:Record<string,number>)=>{
      const pane=table.closest('.order-table-card') as HTMLElement|null
      const panel=Boolean(table.closest('.order-workspace.with-panel'))
      const min:Record<string,number>=panel
        ?{select:26,number:24,order:109,username:82,device:109,time:105,product:117,cod:63,tracking:143,voucher:60,status:91}
        :{select:28,number:26,order:130,username:106,device:124,time:118,product:145,cod:67,tracking:159,voucher:65,status:101}
      const base:Record<string,number>=panel
        ?{select:28,number:26,order:124,username:94,device:132,time:112,product:138,cod:66,tracking:166,voucher:65,status:98}
        :{select:28,number:28,order:155,username:128,device:151,time:134,product:203,cod:78,tracking:193,voucher:72,status:119}
      const max:Record<string,number>={select:32,number:38,order:240,username:235,device:174,time:163,product:480,cod:110,tracking:330,voucher:105,status:168}
      const keys=ths.map(th=>th.classList.contains('bulk-select-col')?'select':th.dataset.orderCol??'')
      const result=keys.map((key,i)=>{
        const previous=saved[headerName(ths[i])]??(key==='tracking'?saved['Mã vận đơn']:undefined)
        return Math.max(min[key]??70,Math.min(max[key]??300,previous??base[key]??90))
      })
      const minimum=keys.reduce((sum,key)=>sum+(min[key]??70),0)
      const available=Math.floor(pane?.clientWidth??table.parentElement?.clientWidth??0)-2
      const target=Math.max(minimum,available)
      let spare=target-result.reduce((sum,v)=>sum+v,0)
      if(spare<0){
        // Uncustomized flexible columns yield first, then stored preferences,
        // but never below readable per-column minimums.
        for(const customized of [false,true]){
          for(const key of ['product','tracking','order','username','device','time','status','voucher','cod']){
            const i=keys.indexOf(key)
            if(i<0||spare>=0)continue
            const hasSaved=Boolean(saved[headerName(ths[i])])
            if(hasSaved!==customized)continue
            const reduce=Math.min(-spare,Math.max(0,result[i]-(min[key]??70)))
            result[i]-=reduce;spare+=reduce
          }
        }
      }else if(spare>0){
        for(const key of ['product','tracking','order','username','time','status','device','cod','voucher']){
          const i=keys.indexOf(key)
          if(i<0||spare<=0)continue
          // Don't expand a deliberately set width until free columns are filled.
          if(saved[headerName(ths[i])]!==undefined)continue
          const gain=Math.min(spare,Math.max(0,(max[key]??300)-result[i]))
          result[i]+=gain;spare-=gain
        }
        // Ultra-wide lanes use proportionate allocation, without a giant device column.
        for(const key of ['product','tracking','order','username']){
          const i=keys.indexOf(key)
          if(i<0||spare<=0)continue
          const gain=Math.min(spare,Math.max(0,(max[key]??300)-result[i]))
          result[i]+=gain;spare-=gain
        }
      }
      return result
    }

    const trackingDefaults:Record<string,number>={
      'tracking-col-order':166,'tracking-col-product':250,
      'tracking-col-cod':94,'tracking-col-recipient':245,
      'tracking-col-status':150,'tracking-col-detail':180,'tracking-col-actions':44,
    }
    const trackingLayout=new WeakMap<HTMLTableElement,string>()
    // Only take control of fixed widths once a user has customized this table.
    const freezeWidths = (table:HTMLTableElement, overrides:Record<string,number>) => {
      const ths = headerCells(table)
      if (!ths.length) return
      const visibleWidths = ths.map(headerWidth)
      const isTracking=table.classList.contains('tracking-hub-table-v2')
      const isOrder=table.matches('.mynh-p1-semantic-table.order-table')
      // Beginning a drag passes empty overrides. In that case freeze what is
      // actually on screen (not the default contract), preventing a width jump.
      const fromStoredPreferences=Object.keys(overrides).length>0
      const preferred = ths.map((th,i) => overrides[headerName(th)]
        || (isTracking&&fromStoredPreferences
          ? Object.entries(trackingDefaults).find(([name])=>th.classList.contains(name))?.[1]
          : undefined)
        || visibleWidths[i])
      const panelWidths=fitPurchasePanel(table,ths)
      const assigned = isOrder?orderFit(table,ths,overrides)
        :isTracking ? fitTrackingPanel(table,ths,preferred,overrides) : panelWidths??preferred
      let total = 0
      ths.forEach((th,i) => {
        // The account sequence number, order count and voucher tags are
        // compact by business contract. Old stored widths must not resurrect
        // oversized cells whenever a User detail slidebar is toggled.
        const accountCompact:Record<string,number>={number:33,orders:58,voucher:96}
        const accountWidth=table.classList.contains('user-table')
          ?accountCompact[th.dataset.accountCol??'']:undefined
        const width = isOrder?assigned[i]:panelWidths ? assigned[i] : accountWidth??(th.classList.contains('tracking-action-head') ? 44 :
          compactCol(th) ? Math.max(24, Math.min(140, assigned[i])) : clampForHeader(th,assigned[i]))
        total += width
        th.style.setProperty('width', width+'px', 'important')
        th.style.setProperty('min-width', width+'px', 'important')
        th.style.setProperty('max-width', width+'px', 'important')
      })
      if(isOrder){
        const cols=Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[]
        cols.forEach((col,i)=>{
          const width=assigned[i]
          if(width===undefined)return
          col.style.setProperty('width',width+'px','important')
          col.style.setProperty('min-width',width+'px','important')
          col.style.setProperty('max-width',width+'px','important')
        })
      }
      table.style.setProperty('table-layout', 'fixed', 'important')
      table.style.setProperty('width', total+'px', 'important')
      table.style.setProperty('min-width', total+'px', 'important')
      table.classList.add('mynh-resizable-table')
    }

    // Synchronize all currently rendered HUB tables in the SAME route/tab.
    // Semantic column IDs make this safe even if users reorder the columns.
    // Collapsed HUB tables remount with the same persisted tableId on reopen.
    const trackingColumnId=(th:HTMLTableCellElement) =>
      [...th.classList].find(name=>name.startsWith('tracking-col-'))
      ?? (th.classList.contains('select-col')?'select-col':headerName(th))
    const mirrorTrackingWidths=(source:HTMLTableElement)=>{
      if(!source.isConnected||!source.classList.contains('tracking-hub-table-v2'))return
      const sourceColumns=headerCells(source)
      if(!sourceColumns.length)return
      const widths=new Map(sourceColumns.map(th=>[trackingColumnId(th),Math.round(th.getBoundingClientRect().width)]))
      const total=Math.round(source.getBoundingClientRect().width)
      main.querySelectorAll<HTMLTableElement>('table.tracking-hub-table-v2').forEach(peer=>{
        if(peer===source||tableId(peer)!==tableId(source))return
        const headers=headerCells(peer)
        if(headers.length!==sourceColumns.length||headers.some(th=>!widths.has(trackingColumnId(th))))return
        headers.forEach(th=>{
          const width=widths.get(trackingColumnId(th))!
          th.style.setProperty('width',width+'px','important')
          th.style.setProperty('min-width',width+'px','important')
          th.style.setProperty('max-width',width+'px','important')
        })
        peer.style.setProperty('table-layout','fixed','important')
        peer.style.setProperty('width',total+'px','important')
        peer.style.setProperty('min-width',total+'px','important')
        peer.classList.add('mynh-resizable-table')
      })
    }

    const enhance = (table:HTMLTableElement) => {
      if (table.closest('.system-slidebar-v1, .system-slidebar, .context-panel, .side-panel, .finance-panel, .receive-confirm-modal')) return
      const ths = headerCells(table)
      if (ths.length < 2) return
      const saved = readSaved(table)
      const tracking=table.classList.contains('tracking-hub-table-v2')
      const pane=table.closest('.tracking-hub-table-wrap-v2') as HTMLElement|null
      const purchase=table.matches('.mynh-p1-semantic-table.user-table,.mynh-p1-semantic-table.order-table')
      const purchasePane=table.closest('.account-table-card,.order-table-card') as HTMLElement|null
      const token=tracking
        ? (table.closest('.tracking-content-workspace.with-panel')?'panel:':'full:')+Math.round(pane?.clientWidth??0)
        : purchase ? (table.closest('.order-workspace.with-panel,.account-workspace.with-panel')?'panel:':'full:')
          +Math.round(purchasePane?.clientWidth??0)+':'
          +ths.map(th=>th.dataset.orderCol??th.dataset.accountCol??(th.classList.contains('bulk-select-col')?'select':'')).join(',')
        : 'general'
      if ((table.matches('.mynh-p1-semantic-table.order-table')||Object.keys(saved).length)
          &&trackingLayout.get(table)!==token) {
        clearInlineWidths(table)
        freezeWidths(table,saved)
      }
      trackingLayout.set(table,token)
      ths.forEach(th => {
        if (th.querySelector(':scope > .mynh-column-resize-grip')) return
        if (th.matches('.bulk-select-col, .select-col, .row-actions-head, .checkbox-col')) return
        if (table.classList.contains('user-table')
          &&['number','orders','voucher'].includes(th.dataset.accountCol??''))return
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
          let previewFrame=0
          const previewPeers=()=>{
            if(!table.classList.contains('tracking-hub-table-v2')||previewFrame)return
            previewFrame=window.requestAnimationFrame(()=>{
              previewFrame=0
              mirrorTrackingWidths(table)
            })
          }
          const initial = th.getBoundingClientRect().width
          freezeWidths(table,{})
          const baseline = headerCells(table).map(headerWidth)
          const idx = headerCells(table).indexOf(th)
          if (idx < 0) return
          const before = baseline[idx] || initial
          const orderTable=table.matches('.mynh-p1-semantic-table.order-table')
          const priorSaved=readSaved(table)
          const originalSelection = document.body.style.userSelect
          document.body.style.userSelect='none'
          grip.classList.add('resizing')
          const move = (event:PointerEvent) => {
            const colWidth = clampForHeader(th,before+event.clientX-startX)
            if(orderTable){
              freezeWidths(table,{...priorSaved,[label]:colWidth})
              return
            }
            const ths = headerCells(table)
            const old = baseline.reduce((sum,x) => sum+x,0)
            table.style.setProperty('width', (old-before+colWidth)+'px','important')
            table.style.setProperty('min-width', (old-before+colWidth)+'px','important')
            th.style.setProperty('width',colWidth+'px','important')
            th.style.setProperty('min-width',colWidth+'px','important')
            th.style.setProperty('max-width',colWidth+'px','important')
            previewPeers()
          }
          const finish = (event:PointerEvent) => {
            window.removeEventListener('pointermove',move,true)
            window.removeEventListener('pointerup',finish,true)
            window.removeEventListener('pointercancel',finish,true)
            grip.classList.remove('resizing')
            if(previewFrame)window.cancelAnimationFrame(previewFrame)
            document.body.style.userSelect=originalSelection
            const next=clampForHeader(th,before+event.clientX-startX)
            const widths=readSaved(table)
            widths[label]=next
            freezeWidths(table,widths)
            save(table,widths)
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
          // Measure the natural width again before re-applying any other custom widths.
          clearInlineWidths(table)
          if(Object.keys(widths).length||table.matches('.mynh-p1-semantic-table.order-table'))freezeWidths(table,widths)
          save(table,widths)
        })
        grip.addEventListener('keydown',e=>{
          if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return
          e.preventDefault();e.stopPropagation()
          const table=th.closest('table') as HTMLTableElement | null
          if(!table)return
          const current=clampForHeader(th,th.getBoundingClientRect().width)
          const widths=readSaved(table)
          widths[label]=clampForHeader(th,current+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?24:12))
          freezeWidths(table,widths);save(table,widths)
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
      if(records.some(rec=>{
        if(rec.type==='attributes')
          return (rec.target as Element).matches('.tracking-content-workspace,.account-workspace,.order-workspace')
        return Array.from(rec.addedNodes).some(node=>{
          if(node.nodeType!==Node.ELEMENT_NODE)return false
          const el=node as Element
          return el.matches('table,thead,tr,th')||Boolean(el.querySelector('table,thead,tr,th'))
        })
      }))queue()
    })
    observer.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})
    const onChange=()=>{if(mq.matches)queue()}
    const paneResize=new ResizeObserver(()=>queue())
    main.querySelectorAll('.order-table-card').forEach(el=>paneResize.observe(el))
    window.addEventListener('resize',queue)
    mq.addEventListener('change',onChange)
    const sync=(event:Event)=>{
      const detail=(event as CustomEvent<{key?:string,source?:HTMLTableElement}>).detail
      if(!detail?.key||!mq.matches)return
      const source=detail.source
      if(source?.isConnected&&source.classList.contains('tracking-hub-table-v2')){
        const widths=readSaved(source)
        if(Object.keys(widths).length){
          mirrorTrackingWidths(source)
          return
        }
      }
      main.querySelectorAll('table.table').forEach(el=>{
        const table=el as HTMLTableElement
        if(tableId(table)!==detail.key)return
        if(table===source)return
        const widths=readSaved(table)
        clearInlineWidths(table)
        if(Object.keys(widths).length)freezeWidths(table,widths)
      })
    }
    window.addEventListener('mynh-table-column-width-changed',sync)
    // Left sidebar collapse/expand changes available table space without a React remount.
    window.addEventListener('mynh-sidebar-resized',queue)
    queue()
    return ()=>{
      observer.disconnect()
      paneResize.disconnect()
      window.removeEventListener('resize',queue)
      window.removeEventListener('mynh-table-column-width-changed',sync)
      window.removeEventListener('mynh-sidebar-resized',queue)
      mq.removeEventListener('change',onChange)
      if(scheduled)window.cancelAnimationFrame(scheduled)
    }
  },[])
  return null
}
