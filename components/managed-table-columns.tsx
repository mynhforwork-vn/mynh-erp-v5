'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
import { normalizeTableColumnPreferences } from '@/lib/table-column-preferences'

export function useManagedColumns<K extends string>(storageKey:string,all:readonly K[],locked:readonly K[]=[],insertNewAfter:Partial<Record<K,K>>={}){
  const [order,setOrder]=useState<K[]>([...all])
  const [hidden,setHidden]=useState<K[]>([])
  const [open,setOpen]=useState(false)
  const [dragging,setDragging]=useState<K|null>(null)
  const [dragOver,setDragOver]=useState<K|null>(null)
  const [readyKey,setReadyKey]=useState<string|null>(null)
  const ref=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(storageKey)
      if(raw){
        const next=normalizeTableColumnPreferences<K>(JSON.parse(raw),all,locked,insertNewAfter)
        setOrder(next.order)
        setHidden(next.hidden)
      }
    }catch{/* Keep safe defaults when preferences are unavailable or corrupt. */}
    // Never write defaults before existing preferences have been restored.
    setReadyKey(storageKey)
  },[storageKey])

  useEffect(()=>{
    if(readyKey!==storageKey)return
    try{
      const value=JSON.stringify({order,hidden})
      if(localStorage.getItem(storageKey)!==value){
        localStorage.setItem(storageKey,value)
        window.dispatchEvent(new CustomEvent('mynh-managed-columns',{detail:{storageKey,value}}))
      }
    }catch{}
  },[storageKey,order,hidden,readyKey])

  useEffect(()=>{
    const sync=(event:Event)=>{
      const detail=(event as CustomEvent).detail
      if(!detail||detail.storageKey!==storageKey)return
      const current=JSON.stringify({order,hidden})
      if(detail.value===current)return
      try{
        const next=normalizeTableColumnPreferences<K>(JSON.parse(detail.value),all,locked,insertNewAfter)
        setOrder(next.order)
        setHidden(next.hidden)
      }catch{}
    }
    window.addEventListener('mynh-managed-columns',sync)
    return ()=>window.removeEventListener('mynh-managed-columns',sync)
  },[storageKey,order,hidden])

  useEffect(()=>{
    const close=(event:MouseEvent)=>{
      const target=event.target as Node|null
      if(open&&target&&!ref.current?.contains(target))setOpen(false)
    }
    const esc=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('mousedown',close)
    document.addEventListener('keydown',esc)
    return ()=>{
      document.removeEventListener('mousedown',close)
      document.removeEventListener('keydown',esc)
    }
  },[open])

  function toggle(key:K){
    if(locked.includes(key))return
    setHidden(prev=>{
      if(prev.includes(key))return prev.filter(x=>x!==key)
      const visible=order.filter(x=>!prev.includes(x))
      return visible.length<=1?prev:[...prev,key]
    })
  }
  function move(source:K,target:K){
    if(source===target)return
    setOrder(prev=>{
      const next=prev.filter(x=>x!==source)
      const at=next.indexOf(target)
      next.splice(at<0?next.length:at,0,source)
      return next
    })
  }
  function reset(){setOrder([...all]);setHidden([])}
  const visible=useMemo(()=>order.filter(x=>!hidden.includes(x)),[order,hidden])
  return {order,hidden,visible,open,setOpen,dragging,setDragging,dragOver,setDragOver,ref,toggle,move,reset}
}

export function ManagedColumnsMenu<K extends string>({
  labels,manager,buttonLabel='Cột',
}:{
  labels:Record<K,string>
  manager:ReturnType<typeof useManagedColumns<K>>
  buttonLabel?:string
}){
  return <div className="managed-column-wrap" ref={manager.ref}>
    <button type="button" className={'button small managed-column-button '+(manager.open?'active':'')} onClick={()=>manager.setOpen(!manager.open)}>☷ {buttonLabel}</button>
    {manager.open&&<div className="managed-column-menu" onClick={e=>e.stopPropagation()}>
      <div className="managed-column-head"><div><b>Hiển thị & thứ tự cột</b><span>Kéo ⋮⋮ để sắp xếp</span></div><button type="button" onClick={manager.reset}>Đặt lại</button></div>
      <div className="managed-column-list">
        {manager.order.map(key=>{
          const hidden=manager.hidden.includes(key)
          return <div
            className={'managed-column-row '+(hidden?'hidden ':'')+(manager.dragging===key?'dragging ':'')+(manager.dragOver===key&&manager.dragging!==key?'drop-target':'')}
            key={key}
            onDragOver={e=>{e.preventDefault();manager.setDragOver(key)}}
            onDragLeave={()=>{if(manager.dragOver===key)manager.setDragOver(null)}}
            onDrop={e=>{
              e.preventDefault()
              const source=(e.dataTransfer.getData('text/plain')||manager.dragging) as K|null
              if(source)manager.move(source,key)
              manager.setDragging(null);manager.setDragOver(null)
            }}
          >
            <span
              className="managed-column-drag"
              draggable
              onDragStart={e=>{manager.setDragging(key);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key)}}
              onDragEnd={()=>{manager.setDragging(null);manager.setDragOver(null)}}
              aria-label={'Kéo cột '+labels[key]}
            >⋮⋮</span>
            <label><input type="checkbox" checked={!hidden} onChange={()=>manager.toggle(key)}/><span>{labels[key]}</span></label>
          </div>
        })}
      </div>
    </div>}
  </div>
}


export function useManagedSort<K extends string>(storageKey:string,defaultKey:K,defaultDir:'asc'|'desc'='asc'){
  const [key,setKey]=useState<K>(defaultKey)
  const [dir,setDir]=useState<'asc'|'desc'>(defaultDir)
  const [sortReadyKey,setSortReadyKey]=useState<string|null>(null)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(storageKey)
      if(raw){
        const parsed=JSON.parse(raw)
        if(parsed?.key)setKey(parsed.key)
        if(parsed?.dir==='asc'||parsed?.dir==='desc')setDir(parsed.dir)
      }
    }catch{}
    setSortReadyKey(storageKey)
  },[storageKey])

  useEffect(()=>{
    if(sortReadyKey!==storageKey)return
    try{
      const next=JSON.stringify({key,dir})
      if(localStorage.getItem(storageKey)!==next)localStorage.setItem(storageKey,next)
    }catch{}
  },[storageKey,key,dir,sortReadyKey])

  function toggle(next:K){
    if(next===key)setDir(value=>value==='asc'?'desc':'asc')
    else{setKey(next);setDir('asc')}
  }
  return {key,dir,toggle,setKey,setDir}
}

export function SortableHeader<K extends string>({
  column,label,sort,onSort,
}:{
  column:K
  label:string
  sort:{key:K,dir:'asc'|'desc'}
  onSort:(column:K)=>void
}){
  const active=sort.key===column
  return <button className="managed-sort-head" type="button" onClick={()=>onSort(column)}>
    <span>{label}</span><i>{active?(sort.dir==='asc'?'↑':'↓'):'↕'}</i>
  </button>
}
