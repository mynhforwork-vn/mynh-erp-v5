'use client'

import { useState } from 'react'
import Link from 'next/link'

type RangeKey='today'|'7d'|'30d'|'month'|'quarter'|'year'|'custom'

const PRESETS:{key:Exclude<RangeKey,'custom'>,label:string}[]=[
  {key:'today',label:'Hôm nay'},
  {key:'7d',label:'7 ngày'},
  {key:'30d',label:'30 ngày'},
  {key:'month',label:'Tháng này'},
  {key:'quarter',label:'Quý này'},
  {key:'year',label:'Năm nay'},
]

export function PurchaseDateFilter({
  activeRange,
  from,
  to,
  label,
}:{
  activeRange:RangeKey
  from:string
  to:string
  label:string
}){
  const [open,setOpen]=useState(activeRange==='custom')

  return <div className={'purchase-date-filter '+(open?'custom-open':'')}>
    <div className="purchase-date-filter-top">
      <div className="command-range">
        {PRESETS.map(item=>
          <Link
            key={item.key}
            className={activeRange===item.key?'active':''}
            href={'/purchase?range='+item.key}
          >{item.label}</Link>
        )}
        <button
          type="button"
          className={activeRange==='custom'?'active':''}
          onClick={()=>setOpen(v=>!v)}
          aria-expanded={open}
        >
          Tùy chọn
          <span className="filter-caret">{open?'▴':'▾'}</span>
        </button>
      </div>

      <div className="range-meta">
        <span>Khoảng đang xem</span>
        <b>{label}</b>
      </div>
    </div>

    {open&&
      <form className="purchase-custom-range" action="/purchase">
        <input type="hidden" name="range" value="custom"/>
        <label>
          <span>Từ ngày</span>
          <input aria-label="Từ ngày" type="date" name="from" defaultValue={from} required/>
        </label>
        <span className="date-range-arrow">→</span>
        <label>
          <span>Đến ngày</span>
          <input aria-label="Đến ngày" type="date" name="to" defaultValue={to} required/>
        </label>
        <div className="purchase-custom-range-actions">
          <button className="button primary" type="submit">Áp dụng</button>
          <button className="button" type="button" onClick={()=>setOpen(false)}>Hủy</button>
        </div>
      </form>
    }
  </div>
}
