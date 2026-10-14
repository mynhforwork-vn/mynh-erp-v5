'use client'

import {useEffect,useId,useState,type FormEvent} from 'react'
import {useRouter} from 'next/navigation'

export type AccountHeadingFilterKind='text'|'choices'|'numeric'|'date'
export type AccountHeadingOption={value:string,label:string}

function filterIcon(){
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"><path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z"/></svg>
}

/** Menu lọc nằm trong top layer, không bị overflow của bảng hoặc slidebar cắt. */
export function AccountHeadingFilter({
  name,label,kind='choices',value='',options=[],baseQuery='',
  secondary,from='',to='',
}:{
  name:string,label:string,kind?:AccountHeadingFilterKind,value?:string,
  options?:AccountHeadingOption[],baseQuery?:string,from?:string,to?:string,
  secondary?:{name:string,label:string,value:string,options:AccountHeadingOption[]},
}){
  const router=useRouter()
  const id=useId()
  const [draft,setDraft]=useState(value)
  const [draftSecondary,setDraftSecondary]=useState(secondary?.value??'all')
  const [draftFrom,setDraftFrom]=useState(from)
  const [draftTo,setDraftTo]=useState(to)
  const [search,setSearch]=useState('')
  useEffect(()=>{
    setDraft(value)
    setDraftSecondary(secondary?.value??'all')
    setDraftFrom(from)
    setDraftTo(to)
  },[value,secondary?.value,from,to])
  const active=Boolean(value&&value!=='all')||Boolean(secondary?.value&&secondary.value!=='all')
    ||Boolean(from||to)
  const filtered=options.filter(option=>!search.trim()
    ||option.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
  const normalizedValue=(v:string)=>v==='all'||!v.trim()?null:v.trim()

  function goto(nextValue:string|null,extra?:{secondary?:string|null,from?:string,to?:string}){
    const query=new URLSearchParams(baseQuery)
    if(kind==='date'){
      if(extra?.from)query.set('cf_createdAt_from',extra.from)
      else query.delete('cf_createdAt_from')
      if(extra?.to)query.set('cf_createdAt_to',extra.to)
      else query.delete('cf_createdAt_to')
    }else if(nextValue===null){query.delete(name)}
    else query.set(name,nextValue)
    if(secondary&&extra&&'secondary' in extra){
      if(extra.secondary===null)query.delete(secondary.name)
      else if(extra.secondary!==undefined)query.set(secondary.name,extra.secondary)
    }
    const qs=query.toString()
    router.push('/purchase/accounts'+(qs?'?'+qs:''),{scroll:false})
    const popup=document.getElementById(id)
    if(popup instanceof HTMLElement&&popup.matches(':popover-open'))popup.hidePopover()
  }

  function apply(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(kind==='date'){
      if(draftFrom&&draftTo&&draftFrom>draftTo)return
      goto(null,{from:draftFrom,to:draftTo})
      return
    }
    goto(normalizedValue(draft),secondary?{
      secondary:normalizedValue(draftSecondary),
    }:undefined)
  }

  function place(button:HTMLButtonElement){
    const popup=document.getElementById(id)
    if(!popup)return
    const r=button.getBoundingClientRect()
    const width=Math.min(272,window.innerWidth-16)
    popup.style.setProperty('--account-head-filter-x',
      Math.max(8,Math.min(r.left,window.innerWidth-width-8))+'px')
    popup.style.setProperty('--account-head-filter-y',
      Math.max(8,Math.min(r.bottom+5,window.innerHeight-300))+'px')
  }
  return <>
    <button type="button" className={'account-heading-filter-trigger'+(active?' is-active':'')}
      popoverTarget={id} aria-controls={id} aria-haspopup="dialog"
      aria-label={'Lọc cột '+label+(active?' (đang lọc)':'')}
      title={'Lọc '+label} onClick={e=>place(e.currentTarget)}>
      {filterIcon()}
    </button>
    <div id={id} popover="auto" role="dialog"
      className="account-heading-filter-menu" aria-label={'Bộ lọc cột '+label}
      onToggle={event=>{
        if(!event.currentTarget.matches(':popover-open'))setSearch('')
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
        {kind==='text'&&<>
          <label htmlFor={id+'-text'}>Nội dung chứa</label>
          <input id={id+'-text'} type="search" value={draft}
            onChange={e=>setDraft(e.target.value)}
            placeholder={'Nhập '+label.toLocaleLowerCase('vi')}
            autoComplete="off" list={options.length?id+'-suggestions':undefined}/>
          {options.length>0&&<datalist id={id+'-suggestions'}>
            {options.map(x=><option value={x.value} key={x.value}/>)}
          </datalist>}
        </>}
        {kind==='numeric'&&<>
          <label htmlFor={id+'-number'}>Số lượng bằng</label>
          <input id={id+'-number'} type="number" min="0" step="1"
            value={draft} onChange={e=>setDraft(e.target.value)}
            placeholder="Nhập số" list={options.length?id+'-numbers':undefined}/>
          {options.length>0&&<datalist id={id+'-numbers'}>
            {options.map(x=><option value={x.value} key={x.value}/>)}
          </datalist>}
        </>}
        {kind==='date'&&<>
          <label htmlFor={id+'-from'}>Từ ngày</label>
          <input id={id+'-from'} type="date" value={draftFrom}
            max={draftTo||undefined} onChange={e=>setDraftFrom(e.target.value)}/>
          <label htmlFor={id+'-to'}>Đến ngày</label>
          <input id={id+'-to'} type="date" value={draftTo}
            min={draftFrom||undefined} onChange={e=>setDraftTo(e.target.value)}/>
        </>}
        {kind==='choices'&&<>
          {options.length>8&&<input type="search" value={search}
            className="account-heading-filter-search" placeholder="Tìm trong danh sách"
            aria-label={'Tìm giá trị '+label} onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}/>}
          <div className="account-heading-filter-options" role="group" aria-label={'Giá trị '+label}>
            <label className="account-heading-filter-option">
              <input type="radio" name={id+'-options'} checked={!draft||draft==='all'}
                onChange={()=>setDraft('all')}/>
              <span>Tất cả</span>
            </label>
            {filtered.map(option=><label key={option.value} className="account-heading-filter-option">
              <input type="radio" name={id+'-options'} checked={draft===option.value}
                onChange={()=>setDraft(option.value)}/>
              <span title={option.label}>{option.label}</span>
            </label>)}
            {filtered.length===0&&<span className="account-heading-filter-empty">
              Không có lựa chọn phù hợp
            </span>}
          </div>
        </>}
        {secondary&&<>
          <label htmlFor={id+'-secondary'}>{secondary.label}</label>
          <select id={id+'-secondary'} value={draftSecondary||'all'}
            onChange={e=>setDraftSecondary(e.target.value)}>
            <option value="all">Tất cả</option>
            {secondary.options.map(option=><option value={option.value} key={option.value}>
              {option.label}
            </option>)}
          </select>
        </>}
        <div className="account-heading-filter-actions">
          <button type="button" onClick={()=>{
            setDraft('all')
            setDraftSecondary('all')
            setDraftFrom('')
            setDraftTo('')
            goto(null,{secondary:null,from:'',to:''})
          }}>Xóa lọc</button>
          <button type="submit" className="button primary small">Áp dụng</button>
        </div>
      </form>
    </div>
  </>
}
