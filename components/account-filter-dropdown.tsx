'use client'
import {useId,useState} from 'react'
export type AccountFilterOption={value:string;label:string}

/** Native top-layer menu: real GET links, accessible without hydration,
 * never intercepted by sticky table cells. */
export function AccountFilterDropdown({name,value,options,label,baseHref}:{
  name:string;value:string;options:AccountFilterOption[];label:string;baseHref:string
}){
  const id=useId()
  const [search,setSearch]=useState('')
  const active=options.find(o=>o.value===value)
  const q=search.trim().toLocaleLowerCase('vi')
  const visible=options.filter(o=>!q||o.label.toLocaleLowerCase('vi').includes(q))
  function href(next:string){
    const [,query='']=baseHref.split('?')
    const p=new URLSearchParams(query)
    if(next==='all')p.delete(name);else p.set(name,next)
    const qs=p.toString()
    return '/purchase/accounts'+(qs?'?'+qs:'')
  }
  function place(button:HTMLButtonElement){
    const menu=document.getElementById(id)
    if(!menu)return
    const r=button.getBoundingClientRect()
    const width=Math.min(245,window.innerWidth-16)
    menu.style.setProperty('--account-filter-x',Math.max(8,Math.min(r.left,window.innerWidth-width-8))+'px')
    menu.style.setProperty('--account-filter-y',Math.max(8,Math.min(r.bottom+5,window.innerHeight-260))+'px')
  }
  return <div className="p1-filter-dropdown p1-filter-popover-control">
    <button type="button" className="p1-filter-trigger"
      popoverTarget={id} aria-haspopup="dialog" aria-controls={id}
      aria-label={label+': '+(active?.label??'Tất cả')}
      onClick={e=>place(e.currentTarget)}>
      <span title={active?.label}>{active?.label??label+': Tất cả'}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>
    <input type="hidden" name={name} value={value}/>
    <div id={id} popover="auto" className="p1-filter-menu p1-filter-top-layer"
      role="dialog" aria-label={'Danh sách '+label}
      onToggle={e=>{if(!e.currentTarget.matches(':popover-open'))setSearch('')}}
      onKeyDown={e=>{
        // Search fields can consume Escape to clear text without closing the
        // native popover. One Escape should always dismiss the filter.
        if(e.key==='Escape'){
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.hidePopover()
        }
      }}>
      {options.length>8&&<input type="search" className="p1-filter-search" value={search}
        aria-label={'Tìm '+label} placeholder="Tìm trong danh sách" autoComplete="off"
        onChange={e=>setSearch(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}/>}
      <div className="p1-filter-options">
        {visible.length===0?<div className="p1-filter-empty">Không có lựa chọn phù hợp</div>
          :visible.map(o=><a key={o.value} href={href(o.value)} data-value={o.value}
            aria-current={value===o.value?'true':undefined}
            className={'p1-filter-option'+(value===o.value?' selected':'')}>
            <span className="p1-filter-check" aria-hidden="true">{value===o.value
              ?<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4 4L19 6"/></svg>:null}</span>
            <span>{o.label}</span>
          </a>)}
      </div>
    </div>
  </div>
}
