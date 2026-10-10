'use client'

import {useEffect,useId,useRef,useState} from 'react'

export type AccountFilterOption={value:string;label:string}
export function AccountFilterDropdown({
  name,value,options,label
}:{name:string;value:string;options:AccountFilterOption[];label:string}){
  const [open,setOpen]=useState(false)
  const [current,setCurrent]=useState(value)
  const [focused,setFocused]=useState(0)
  const ref=useRef<HTMLDivElement|null>(null)
  const listId=useId()

  useEffect(()=>{setCurrent(value);setOpen(false)},[value])
  useEffect(()=>{
    if(!open)return
    const closeOutside=(event:PointerEvent)=>{
      if(!ref.current?.contains(event.target as Node))setOpen(false)
    }
    const closeEsc=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('pointerdown',closeOutside)
    document.addEventListener('keydown',closeEsc)
    return()=>{
      document.removeEventListener('pointerdown',closeOutside)
      document.removeEventListener('keydown',closeEsc)
    }
  },[open])
  const active=options.find(o=>o.value===current)??options[0]
  const choose=(index:number)=>{
    const option=options[index]
    if(!option)return
    setCurrent(option.value)
    setOpen(false)
    ref.current?.querySelector<HTMLButtonElement>('.p1-filter-trigger')?.focus()
  }
  return <div className={'p1-filter-dropdown'+(open?' is-open':'')} ref={ref}>
    <input type="hidden" name={name} value={current}/>
    <button type="button" className="p1-filter-trigger"
      aria-label={label+': '+(active?.label??'Tất cả')}
      aria-haspopup="listbox" aria-controls={listId} aria-expanded={open}
      onClick={()=>{setFocused(Math.max(0,options.findIndex(o=>o.value===current)));setOpen(p=>!p)}}
      onKeyDown={e=>{
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){
          e.preventDefault()
          if(!open){setOpen(true);setFocused(Math.max(0,options.findIndex(o=>o.value===current)))}
          else setFocused(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length)
        }else if(e.key==='Enter'&&open){e.preventDefault();choose(focused)}
      }}>
      <span title={active?.label}>{active?.label??'Tất cả'}</span>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>
    {open&&<div className="p1-filter-menu" id={listId} role="listbox" aria-label={label}>
      {options.map((opt,i)=><button key={opt.value} type="button" role="option"
        aria-selected={current===opt.value}
        className={'p1-filter-option'+(current===opt.value?' selected':'')+(focused===i?' focused':'')}
        onMouseEnter={()=>setFocused(i)}
        onClick={()=>choose(i)}>
        <span className="p1-filter-check" aria-hidden="true">{current===opt.value?'✓':''}</span>
        <span>{opt.label}</span>
      </button>)}
    </div>}
  </div>
}
