'use client'

import {useEffect,useRef,useState} from 'react'

export type AccountFilterOption={value:string;label:string}

/** Data-driven, branded disclosure menu; works before React hydration.
 * Each option has a real GET link, so filters never depend on an onClick
 * handler being hydrated. Search and outside/Escape close are enhancements.
 */
export function AccountFilterDropdown({
  name,value,options,label,baseHref,
}:{
  name:string;value:string;options:AccountFilterOption[];label:string;baseHref:string
}){
  const ref=useRef<HTMLDetailsElement|null>(null)
  const [search,setSearch]=useState('')
  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>{
      if(ref.current?.open&&event.target instanceof Node&&!ref.current.contains(event.target))
        ref.current.open=false
    }
    const closeEscape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&ref.current?.open){
        event.preventDefault()
        ref.current.open=false
        ref.current.querySelector<HTMLElement>('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown',closeOutside)
    document.addEventListener('keydown',closeEscape)
    return ()=>{
      document.removeEventListener('pointerdown',closeOutside)
      document.removeEventListener('keydown',closeEscape)
    }
  },[])
  const active=options.find(option=>option.value===value)
  const menu=options.filter(option=>option.value==='all'
    ||option.label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))
  function optionHref(nextValue:string){
    const [,query='']=baseHref.split('?')
    const params=new URLSearchParams(query)
    if(nextValue==='all')params.delete(name)
    else params.set(name,nextValue)
    const qs=params.toString()
    return '/purchase/accounts'+(qs?'?'+qs:'')
  }
  return <details className="p1-filter-dropdown p1-filter-details" ref={ref} onToggle={e=>{
    if(!e.currentTarget.open)setSearch('')
  }}>
    <summary className="p1-filter-trigger" aria-label={label+': '+(active?.label??'Tất cả')}>
      <span title={active?.label}>{active?.label??label+': Tất cả'}</span>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </summary>
    <div className="p1-filter-menu" role="group" aria-label={'Danh sách '+label}>
      {options.length>8&&<input type="search" aria-label={'Tìm '+label} className="p1-filter-search"
        placeholder="Tìm trong danh sách" value={search} onChange={e=>setSearch(e.target.value)}
        autoComplete="off"/>}
      <div className="p1-filter-options">
        {menu.length===0
          ?<div className="p1-filter-empty">Không có lựa chọn phù hợp</div>
          :menu.map(option=><a key={option.value} href={optionHref(option.value)}
            className={'p1-filter-option'+(value===option.value?' selected':'')}
            aria-current={value===option.value?'true':undefined}
            data-value={option.value}>
            <span className="p1-filter-check" aria-hidden="true">{value===option.value?'✓':''}</span>
            <span>{option.label}</span>
          </a>)}
      </div>
    </div>
  </details>
}
