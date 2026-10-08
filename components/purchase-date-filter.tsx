import Link from 'next/link'

export type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
export const RANGE_PRESETS:ReadOnlyArray<readonly [RangeKey,string]>=[
  ['all','Toàn thời gian'],
  ['today','Hôm nay'],
  ['week','Tuần này'],
  ['7d','7 ngày'],
  ['30d','30 ngày'],
  ['month','Tháng này'],
  ['quarter','Quý này'],
  ['year','Năm nay'],
]

export function PurchaseDateFilter({
  activeRange,
  from,
  to,
  label,
  basePath='/purchase',
  showAll=false,
  preserveParams={},
  paramKey='range',
}:{
  activeRange:RangeKey
  from:string
  to:string
  label:string
  basePath?:string
  showAll?:boolean
  preserveParams?:Record<string,string|undefined|null>
  paramKey?:'range'|'period'
}){
  function rangeHref(nextRange:RangeKey){
    const p=new URLSearchParams()
    p.set(paramKey,nextRange)
    for(const [key,value] of Object.entries(preserveParams)){
      if(value===null||value===undefined||value==='')continue
      p.set(key,value)
    }
    return basePath+'?'+p.toString()
  }

  const preservedHidden=Object.entries(preserveParams)
    .filter(([,value])=>value!==null&&value!==undefined&&value!=='')

  return <div className="purchase-date-filter flat">
    <div className="command-range">
      {RANGE_PRESETS.filter(([key])=>showAll||key!=='all').map(([key,text])=>
        <Link key={key} className={activeRange===key?'active':''} href={rangeHref(key)}>{text}</Link>
      )}
    </div>

    <form className="purchase-date-inline-form" action={basePath}>
      <input type="hidden" name={paramKey} value="custom"/>
      {preservedHidden.map(([key,value])=><input key={key} type="hidden" name={key} value={String(value)}/>)}
      <label>
        <span>Từ ngày</span>
        <input aria-label="Từ ngày" type="date" name="from" defaultValue={activeRange==='all'?'':from} required/>
      </label>
      <span className="date-range-arrow">→</span>
      <label>
        <span>Đến ngày</span>
        <input aria-label="Đến ngày" type="date" name="to" defaultValue={activeRange==='all'?'':to} required/>
      </label>
      <button className="button primary" type="submit">Áp dụng</button>
    </form>

    <details className="mobile-date-picker">
      <summary><span>Chọn khoảng ngày</span><b>{label}</b><i>⌄</i></summary>
      <form action={basePath}>
        <input type="hidden" name={paramKey} value="custom"/>
        {preservedHidden.map(([key,value])=><input key={key} type="hidden" name={key} value={String(value)}/>)}
        <label>
          <span>Từ ngày</span>
          <input aria-label="Từ ngày mobile" type="date" name="from" defaultValue={activeRange==='all'?'':from} required/>
        </label>
        <label>
          <span>Đến ngày</span>
          <input aria-label="Đến ngày mobile" type="date" name="to" defaultValue={activeRange==='all'?'':to} required/>
        </label>
        <button className="button primary" type="submit">Áp dụng</button>
      </form>
    </details>

    <div className="range-meta">
      <span>Khoảng đang xem</span>
      <b>{label}</b>
    </div>
  </div>
}
