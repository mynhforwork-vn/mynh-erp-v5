'use client'

import {useEffect,useId,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {readAccountFilterValues,writeAccountFilterValues} from '@/lib/account-heading-filter-values'

export type AccountHeadingFilterKind='text'|'choices'|'numeric'|'date'
export type AccountHeadingOption={value:string,label:string}

function FilterIcon(){
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z"/>
  </svg>
}

/** Tìm trong các giá trị hiện có; tick chọn nhiều và áp dụng tức thì qua Router. */
export function AccountHeadingFilter({
  name,label,kind='choices',value='',options=[],baseQuery='',secondary,from='',to='',
  navigationRef,
}:{
  name:string,label:string,kind?:AccountHeadingFilterKind,value?:string,
  options?:AccountHeadingOption[],baseQuery?:string,from?:string,to?:string,
  secondary?:{name:string,label:string,value:string,options:AccountHeadingOption[]},
  navigationRef?:{current:string},
}){
  const router=useRouter()
  const id=useId()
  const [opened,setOpened]=useState(false)
  const [lookup,setLookup]=useState('')
  const fromLegacy=kind==='date'&&!value&&from&&from===to?from:''
  const current=value||fromLegacy
  const [selected,setSelected]=useState<string[]>(()=>readAccountFilterValues(current))
  const [secondarySelected,setSecondarySelected]=useState<string[]>(
    ()=>readAccountFilterValues(secondary?.value))
  const pending=useRef('')
  useEffect(()=>{
    setSelected(readAccountFilterValues(current))
    setSecondarySelected(readAccountFilterValues(secondary?.value))
    pending.current=''
  },[current,secondary?.value])
  const active=selected.length>0||secondarySelected.length>0
    ||Boolean(kind==='date'&&(from||to))
  const query=lookup.trim().toLocaleLowerCase('vi')
  const displayed=opened?options.filter(opt=>
    !query||opt.label.toLocaleLowerCase('vi').includes(query)
    ||opt.value.toLocaleLowerCase('vi').includes(query)
  ):[]

  function navigate(next:string[],nextSecondary:string[]=secondarySelected){
    const q=new URLSearchParams(navigationRef?.current||pending.current||(
      typeof window!=='undefined'?window.location.search:baseQuery
    ))
    const encoded=writeAccountFilterValues(next)
    if(encoded)q.set(name,encoded)
    else q.delete(name)
    if(kind==='date'){
      // New multi-day selection supersedes legacy single-range query keys.
      q.delete('cf_createdAt_from')
      q.delete('cf_createdAt_to')
    }
    if(secondary){
      const extra=writeAccountFilterValues(nextSecondary)
      if(extra)q.set(secondary.name,extra)
      else q.delete(secondary.name)
    }
    pending.current=q.toString()
    if(navigationRef)navigationRef.current=pending.current
    router.push('/purchase/accounts'+(pending.current?'?'+pending.current:''),{scroll:false})
  }
  function toggle(val:string,isSecondary=false){
    if(isSecondary){
      const next=secondarySelected.includes(val)
        ?secondarySelected.filter(x=>x!==val):[...secondarySelected,val]
      setSecondarySelected(next)
      navigate(selected,next)
    }else{
      const next=selected.includes(val)
        ?selected.filter(x=>x!==val):[...selected,val]
      setSelected(next)
      navigate(next)
    }
  }
  function clear(){
    setSelected([])
    setSecondarySelected([])
    setLookup('')
    navigate([],[])
  }
  function place(button:HTMLButtonElement){
    const popup=document.getElementById(id)
    if(!popup)return
    const rect=button.getBoundingClientRect()
    const width=Math.min(258,window.innerWidth-16)
    popup.style.setProperty('--account-head-filter-x',
      Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px')
    popup.style.setProperty('--account-head-filter-y',
      Math.max(8,Math.min(rect.bottom+4,window.innerHeight-292))+'px')
  }
  return <>
    <button type="button" className={'account-heading-filter-trigger'+(active?' is-active':'')}
      popoverTarget={id} aria-controls={id} aria-haspopup="dialog"
      aria-label={'Lọc cột '+label+(active?' (đang lọc)':'')}
      title={'Lọc '+label} onClick={e=>{
        setOpened(true)
        place(e.currentTarget)
      }}>
      <FilterIcon/>
    </button>
    <div id={id} popover="auto" role="dialog"
      className="account-heading-filter-menu" aria-label={'Bộ lọc cột '+label}
      onToggle={event=>{
        if(!event.currentTarget.matches(':popover-open')){
          setOpened(false)
          setLookup('')
        }
      }}
      onKeyDown={event=>{
        if(event.key==='Escape'){
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.hidePopover()
        }
      }}>
      <div className="account-heading-filter-title">
        <span>{label}</span>
        {selected.length>0&&<span className="account-heading-filter-selected">
          {selected.length} đã chọn
        </span>}
      </div>
      <div className="account-heading-filter-form">
        <input type="search" className="account-heading-filter-search"
          value={lookup} onChange={e=>setLookup(e.target.value)}
          placeholder="Nhập để tìm trong dữ liệu"
          aria-label={'Tìm trong danh sách '+label} autoComplete="off"/>
        <div className="account-heading-filter-options" role="group"
          aria-label={'Chọn các giá trị '+label}>
          {displayed.map(opt=><label key={opt.value} className="account-heading-filter-option">
            <input type="checkbox" checked={selected.includes(opt.value)}
              onChange={()=>toggle(opt.value)}/>
            <span title={opt.label}>{opt.label}</span>
          </label>)}
          {opened&&displayed.length===0&&<span className="account-heading-filter-empty">
            {options.length?'Không tìm thấy giá trị phù hợp':'Chưa có dữ liệu'}
          </span>}
        </div>
        {secondary&&<>
          <div className="account-heading-filter-subtitle">{secondary.label}</div>
          <div className="account-heading-filter-options account-heading-filter-secondary"
            role="group" aria-label={'Chọn '+secondary.label}>
            {secondary.options.map(opt=><label key={opt.value} className="account-heading-filter-option">
              <input type="checkbox" checked={secondarySelected.includes(opt.value)}
                onChange={()=>toggle(opt.value,true)}/>
              <span title={opt.label}>{opt.label}</span>
            </label>)}
          </div>
        </>}
        <div className="account-heading-filter-actions">
          <button type="button" onClick={clear}>Xóa lọc</button>
        </div>
      </div>
    </div>
  </>
}
