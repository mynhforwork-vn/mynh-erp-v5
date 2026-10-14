'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect,useRef} from 'react'
import type {FormEvent} from 'react'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'

const dashboardRanges:{key:RangeKey,label:string}[]=[
  {key:'all',label:'Tất cả'},
  {key:'today',label:'Hôm nay'},
  {key:'week',label:'Tuần này'},
  {key:'7d',label:'7 ngày'},
  {key:'30d',label:'30 ngày'},
  {key:'month',label:'Tháng này'},
  {key:'year',label:'Năm nay'},
]

/**
 * Một thanh lọc thời gian dùng chung mẫu Dashboard nhập hàng.
 * Giữ nguyên URL, các bộ lọc nghiệp vụ và lịch sử điều hướng; không reload document.
 */
export function PurchaseDateFilter({
  activeRange,from,to,label,basePath='/purchase',showAll=false,preserveParams={},
}:{
  activeRange:RangeKey
  from:string
  to:string
  label:string
  basePath?:string
  showAll?:boolean
  preserveParams?:Record<string,string|undefined|null>
}){
  const router=useRouter()
  const navRef=useRef<HTMLElement>(null)
  // Readiness marker only: allows QA to distinguish pre-hydration fallback
  // document navigation from a regression after interactive JS is ready.
  useEffect(()=>{navRef.current?.setAttribute('data-client-ready','true')},[])
  const preserved=Object.entries(preserveParams)
    .filter(([,value])=>value!==null&&value!==undefined&&value!=='')
  const options=dashboardRanges.filter(item=>showAll||item.key!=='all')
  // Hỗ trợ link Quý này cũ nhưng không thêm nút khác mẫu Dashboard đã chốt.
  if(activeRange==='quarter')options.splice(options.length-1,0,{key:'quarter',label:'Quý này'})
  function paramsFor(nextRange:RangeKey){
    const query=new URLSearchParams()
    query.set('range',nextRange)
    for(const [key,value] of preserved){
      if(key==='range'||key==='from'||key==='to')continue
      query.set(key,String(value))
    }
    return query
  }
  function rangeHref(nextRange:RangeKey){
    return basePath+'?'+paramsFor(nextRange).toString()
  }
  function applyCustom(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=event.currentTarget
    if(!form.reportValidity())return
    const fields=new FormData(form)
    const fromDate=String(fields.get('from')??'')
    const toDate=String(fields.get('to')??'')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate))return
    const query=paramsFor('custom')
    query.set('from',fromDate)
    query.set('to',toDate)
    router.push(basePath+'?'+query.toString(),{scroll:false})
  }
  return <nav ref={navRef} className="pd-time-filter" aria-label={'Lọc theo ngày đặt đơn · '+label}>
    <div className="pd-time-quick" role="group" aria-label="Chọn khoảng thời gian">
      {options.map(option=><Link key={option.key} href={rangeHref(option.key)}
        prefetch={false} scroll={false}
        aria-current={activeRange===option.key?'page':undefined}
        className={'pd-time-option'+(activeRange===option.key?' is-selected':'')}>{option.label}</Link>)}
    </div>
    <form className="pd-time-calendar" action={basePath} method="GET"
      aria-label="Lọc khoảng ngày tùy chỉnh" onSubmit={applyCustom}>
      <input type="hidden" name="range" value="custom"/>
      {preserved.filter(([key])=>!['range','from','to'].includes(key))
        .map(([key,value])=><input key={key} type="hidden" name={key} value={String(value)}/>)}
      <label><span>Từ</span><input aria-label="Từ ngày" type="date" name="from"
        defaultValue={activeRange==='all'?'':from} required/></label>
      <span className="pd-date-separator" aria-hidden="true">→</span>
      <label><span>Đến</span><input aria-label="Đến ngày" type="date" name="to"
        defaultValue={activeRange==='all'?'':to} required/></label>
      <button type="submit" className="button primary">Áp dụng</button>
    </form>
  </nav>
}
