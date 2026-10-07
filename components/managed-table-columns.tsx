'use client'

import { useEffect,useMemo,useRef,useState } from 'react'

export function useManagedColumns<K extends string>(storageKey:string,all:readonly K[],locked:readonly K[]=[]){
  const [order,setOrder]=useState<K[]>([...all])
  const [hidden,setHidden]=useState<K[]>([])
  const [open,setOpen]=useState(false)
  const [dragging,setDragging]=useState<K|null>(null)
  const [dragOver,setDragOver]=useState<K|null>(null)
  const ref=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(storageKey)
      if(!raw)return
      const parsed=JSON.parse(raw)
      if(Array.isArray(parsed.order)){
        const valid=parsed.order.filter((x:any)=>all.includes(x))
        const missing=all.filter(x=>!valid.includes(x))
        if(valid.length)setOrder([...valid,...missing])
      }
      if(Array.isArray(parsed.hidden)){
        const valid=parsed.hidden.filter((x:any)=>all.includes(x)&&!locked.includes(x))
        setHidden(valid)
      }
    }catch{}
  },[storageKey])

  useEffect(()=>{
    try{
      const value=JSON.stringify({order,hidden})
      localStorage.setItem(storageKey,value)
      window.dispatchEvent(new CustomEvent('mynh-managed-columns',{detail:{storageKey,value}}))
    }catch{}
  },[storageKey,order,hidden])

  useEffect(()=>{
    const sync=(event:Event)=>{
      const detail=(event as CustomEvent).detail
      if(!detail||detail.storageKey!==storageKey)return
      try{
        const parsed=JSON.parse(detail.value)
        if(Array.isArray(parsed.order))setOrder(parsed.order)
        if(Array.isArray(parsed.hidden))setHidden(parsed.hidden)
      }catch{}
    }
    window.addEventListener('mynh-managed-columns',sync)
    return ()=>window.removeEventListener('mynh-managed-columns',sync)
  },[storageKey])

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

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(storageKey)
      if(!raw)return
      const parsed=JSON.parse(raw)
      if(parsed?.key)setKey(parsed.key)
      if(parsed?.dir==='asc'||parsed?.dir==='desc')setDir(parsed.dir)
    }catch{}
  },[storageKey])

  useEffect(()=>{
    try{localStorage.setItem(storageKey,JSON.stringify({key,dir}))}catch{}
  },[storageKey,key,dir])

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
