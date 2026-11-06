'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Period = 'all' | 'today' | 'week' | '7d' | '30d' | 'month' | 'year' | 'custom'

const OPTIONS: ReadonlyArray<{ value: Period; label: string }> = [
  {value:'all',label:'Tất cả'},
  {value:'today',label:'Hôm nay'},
  {value:'week',label:'Tuần này'},
  {value:'7d',label:'7 ngày'},
  {value:'30d',label:'30 ngày'},
  {value:'month',label:'Tháng này'},
  {value:'year',label:'Năm nay'},
]

export function WarehouseReceivedDateFilter({
  period, from, to, state,
}: {
  period: Period
  from: string
  to: string
  state: 'all' | 'pending' | 'ready' | 'done'
}) {
  const router = useRouter()
  const [start, setStart] = useState(from)
  const [end, setEnd] = useState(to)
  useEffect(() => { setStart(from); setEnd(to) }, [from, to])

  const urlFor = (choice: Period, begin = '', finish = '') => {
    const params = new URLSearchParams({state})
    if (choice !== 'all') params.set('received_range', choice)
    if (choice === 'custom') {
      if (begin) params.set('from', begin)
      if (finish) params.set('to', finish)
    }
    return '/warehouse/receive?' + params.toString()
  }
  const chooseDay = (begin: string, finish: string) => {
    // Both fields are independently optional; the server guards invalid dates
    // and applies the range to the confirmed receiving batch timestamp.
    router.replace(urlFor('custom', begin, finish), {scroll:false})
  }

  return <nav className="wh-native-date-filter" aria-label="Lọc theo ngày nhận hàng">
    <span className="wh-native-date-title">Ngày nhận hàng</span>
    <div className="wh-native-date-quick" role="group" aria-label="Khoảng thời gian">
      {OPTIONS.map(item=><Link key={item.value} href={urlFor(item.value)}
        scroll={false} prefetch={false} aria-current={period===item.value?'page':undefined}
        className={'wh-native-date-option' + (period===item.value?' active':'')}>{item.label}</Link>)}
    </div>
    <div className={'wh-native-date-calendar'+(period==='custom'?' active':'')}>
      <label><span>Từ</span><input type="date" value={start} aria-label="Từ ngày nhận"
        onChange={e=>{const next=e.target.value;setStart(next);chooseDay(next,end)}}/></label>
      <span className="wh-native-date-separator" aria-hidden="true">→</span>
      <label><span>Đến</span><input type="date" value={end} aria-label="Đến ngày nhận"
        onChange={e=>{const next=e.target.value;setEnd(next);chooseDay(start,next)}}/></label>
    </div>
  </nav>
}
