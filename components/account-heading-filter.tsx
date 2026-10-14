'use client'

import {useEffect,useId,useState,type FormEvent} from 'react'
import {useRouter} from 'next/navigation'

export type AccountHeadingFilterKind='text'|'choices'|'numeric'|'date'
export type AccountHeadingOption={value:string,label:string}

function FilterIcon(){
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z"/>
  </svg>
}

/** Tất cả điều kiện lấy từ dữ liệu thực, chỉ tick chọn; không nhập giá trị. */
export function AccountHeadingFilter({
  name,label,kind='choices',value='',options=[],baseQuery='',secondary,from='',to='',
}:{
  name:string,label:string,kind?:AccountHeadingFilterKind,value?:string,
  options?:AccountHeadingOption[],baseQuery?:string,from?:string,to?:string,
  secondary?:{name:string,label:string,value:string,options:AccountHeadingOption[]},
}){
  const router=useRouter()
  const id=useId()
  const [opened,setOpened]=useState(false)
  const current=kind==='date'?(from&&from===to?from:'all'):(value||'all')
  const [selected,setSelected]=useState(current)
  const [selectedSecondary,setSelectedSecondary]=useState(secondary?.value||'all')
  useEffect(()=>{
    setSelected(current)
    setSelectedSecondary(secondary?.value||'all')
  },[current,secondary?.value])
  const active=(kind==='date'?Boolean(from||to):Boolean(value&&value!=='all'))
    ||Boolean(secondary?.value&&secondary.value!=='all')

  function submit(next:string,other=selectedSecondary){
    const q=new URLSearchParams(baseQuery)
    if(kind==='date'){
      if(!next||next==='all'){
        q.delete('cf_createdAt_from')
        q.delete('cf_createdAt_to')
      }else{
        q.set('cf_createdAt_from',next)
        q.set('cf_createdAt_to',next)
      }
    }else if(!next||next==='all')q.delete(name)
    else q.set(name,next)
    if(secondary){
      if(!other||other==='all')q.delete(secondary.name)
      else q.set(secondary.name,other)
    }
    const qs=q.toString()
    router.push('/purchase/accounts'+(qs?'?'+qs:''),{scroll:false})
    const popup=document.getElementById(id)
    if(popup?.matches(':popover-open'))(popup as HTMLElement).hidePopover()
  }
  function apply(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    submit(selected)
  }
  function place(button:HTMLButtonElement){
    const popup=document.getElementById(id)
    if(!popup)return
    const rect=button.getBoundingClientRect()
    const width=Math.min(270,window.innerWidth-16)
    popup.style.setProperty('--account-head-filter-x',
      Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px')
    popup.style.setProperty('--account-head-filter-y',
      Math.max(8,Math.min(rect.bottom+5,window.innerHeight-290))+'px')
  }
  return <>
    <button type="button" className={'account-heading-filter-trigger'+(active?' is-active':'')}
      popoverTarget={id} aria-controls={id} aria-haspopup="dialog"
      aria-label={'Lọc cột '+label+(active?' (đang lọc)':'')}
      title={'Lọc '+label} onClick={e=>{
        // Native popover can open before React emits onToggle (especially
        // immediately after RSC hydration). Mount the real data choices on
        // the actual click, never leave only the 'Tất cả' fallback visible.
        setOpened(true)
        place(e.currentTarget)
      }}>
      <FilterIcon/>
    </button>
    <div id={id} popover="auto" role="dialog"
      className="account-heading-filter-menu" aria-label={'Bộ lọc cột '+label}
      onToggle={event=>{
        if(!event.currentTarget.matches(':popover-open'))setOpened(false)
      }}
      onKeyDown={event=>{
        if(event.key==='Escape'){
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.hidePopover()
        }
      }}>
      <div className="account-heading-filter-title">Lọc theo {label}</div>
      <form onSubmit={apply} className="account-heading-filter-form">
        <div className="account-heading-filter-options" role="radiogroup"
          aria-label={'Chọn giá trị '+label}>
          <label className="account-heading-filter-option">
            <input type="radio" name={id+'-value'} checked={!selected||selected==='all'}
              onChange={()=>setSelected('all')}/>
            <span>Tất cả</span>
          </label>
          {opened&&options.map(option=><label key={option.value}
            className="account-heading-filter-option">
            <input type="radio" name={id+'-value'} checked={selected===option.value}
              onChange={()=>setSelected(option.value)}/>
            <span title={option.label}>{option.label}</span>
          </label>)}
          {opened&&options.length===0&&<span className="account-heading-filter-empty">
            Chưa có dữ liệu để lọc
          </span>}
        </div>
        {secondary&&<>
          <label htmlFor={id+'-secondary'}>{secondary.label}</label>
          <select id={id+'-secondary'} value={selectedSecondary}
            onChange={e=>setSelectedSecondary(e.target.value)}>
            <option value="all">Tất cả</option>
            {secondary.options.map(o=><option value={o.value} key={o.value}>
              {o.label}
            </option>)}
          </select>
        </>}
        <div className="account-heading-filter-actions">
          <button type="button" onClick={()=>submit('all','all')}>Xóa lọc</button>
          <button type="submit" className="button primary small">Áp dụng</button>
        </div>
      </form>
    </div>
  </>
}
