import Link from 'next/link'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'

export function PurchaseDateFilter({
  activeRange,
  from,
  to,
  label,
  basePath='/purchase',
  showAll=false,
  preserveParams={},
}:{
  activeRange:RangeKey
  from:string
  to:string
  label:string
  basePath?:string
  showAll?:boolean
  preserveParams?:Record<string,string|undefined|null>
}){
  function rangeHref(nextRange:RangeKey){
    const p=new URLSearchParams()
    p.set('range',nextRange)
    for(const [key,value] of Object.entries(preserveParams)){
      if(value===null||value===undefined||value==='')continue
      p.set(key,value)
    }
    return basePath+'?'+p.toString()
  }

  const preservedHidden=Object.entries(preserveParams)
    .filter(([,value])=>value!==null&&value!==undefined&&value!=='')

  return <div className="purchase-date-filter flat">
    <nav className="command-range" aria-label="Bộ lọc thời gian">
      {showAll&&<Link className={activeRange==='all'?'active':''} href={rangeHref('all')}>Toàn thời gian</Link>}
      <Link className={activeRange==='today'?'active':''} href={rangeHref('today')}>Hôm nay</Link>
      <Link className={activeRange==='week'?'active':''} href={rangeHref('week')}>Tuần này</Link>
      <Link className={activeRange==='month'?'active':''} href={rangeHref('month')}>Tháng này</Link>
      <Link className={'desktop-period-extra '+(activeRange==='7d'?'active':'')} href={rangeHref('7d')}>7 ngày</Link>
      <Link className={'desktop-period-extra '+(activeRange==='30d'?'active':'')} href={rangeHref('30d')}>30 ngày</Link>
      <Link className={'desktop-period-extra '+(activeRange==='quarter'?'active':'')} href={rangeHref('quarter')}>Quý này</Link>
      <Link className={'desktop-period-extra '+(activeRange==='year'?'active':'')} href={rangeHref('year')}>Năm nay</Link>
    </nav>

    <form className="purchase-date-inline-form" action={basePath}>
      <input type="hidden" name="range" value="custom"/>
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
        <input type="hidden" name="range" value="custom"/>
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
