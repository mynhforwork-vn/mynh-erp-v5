'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Period = 'all' | 'today' | '7d' | '30d' | 'custom'

export function WarehouseReceivedDateFilter({
  period, from, to,
}: {
  period: Period
  from: string
  to: string
}) {
  const router = useRouter()
  const [start, setStart] = useState(from)
  const [end, setEnd] = useState(to)
  useEffect(() => { setStart(from); setEnd(to) }, [from, to])

  const navigate = (choice: Period, nextFrom = start, nextTo = end) => {
    const params = new URLSearchParams(window.location.search)
    if (choice === 'all') {
      params.delete('received_range')
      params.delete('from')
      params.delete('to')
    } else {
      params.set('received_range', choice)
      if (choice === 'custom') {
        if (nextFrom) params.set('from', nextFrom)
        else params.delete('from')
        if (nextTo) params.set('to', nextTo)
        else params.delete('to')
      } else {
        params.delete('from')
        params.delete('to')
      }
    }
    router.replace('/warehouse/receive?' + params.toString(), { scroll: false })
  }

  return <div className="wh-native-date-filter" aria-label="Bộ lọc thời gian theo ngày nhận hàng">
    <label className="wh-native-date-field">
      <span>Ngày nhận hàng</span>
      <select value={period} aria-label="Khoảng ngày nhận hàng"
        onChange={event => navigate(event.target.value as Period)}>
        <option value="all">Tất cả thời gian</option>
        <option value="today">Hôm nay</option>
        <option value="7d">7 ngày gần nhất</option>
        <option value="30d">30 ngày gần nhất</option>
        <option value="custom">Tùy chọn ngày</option>
      </select>
    </label>
    {period === 'custom' && <>
      <label className="wh-native-date-field">
        <span>Từ ngày nhận</span>
        <input aria-label="Từ ngày nhận" type="date" value={start}
          onChange={event => { const value = event.target.value; setStart(value); navigate('custom', value, end) }}/>
      </label>
      <label className="wh-native-date-field">
        <span>Đến ngày nhận</span>
        <input aria-label="Đến ngày nhận" type="date" value={end}
          onChange={event => { const value = event.target.value; setEnd(value); navigate('custom', start, value) }}/>
      </label>
    </>}
    {period !== 'all' && <button type="button" className="wh-native-date-clear" title="Xóa lọc ngày nhận"
      aria-label="Xóa lọc ngày nhận" onClick={() => { setStart(''); setEnd(''); navigate('all', '', '') }}>
      ×
    </button>}
  </div>
}
