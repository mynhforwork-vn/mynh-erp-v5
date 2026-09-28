export function VoucherTags({
  value,
  compact=false,
  maxVisible,
}:{
  value?:string|null
  compact?:boolean
  maxVisible?:number
}){
  const raw=String(value??'').trim()
  const normalized=raw.toLowerCase()
  if(!raw||normalized==='chưa có voucher'||normalized==='không có voucher'||normalized==='không voucher'){
    return <span className="voucher-tag neutral">Không có</span>
  }

  const tags=[...new Set(raw.split(/[·,;|]+/).map(x=>x.trim()).filter(Boolean))]
  const limit=maxVisible??(compact?2:tags.length)
  const visible=tags.slice(0,limit)
  const hidden=Math.max(0,tags.length-visible.length)

  return <div className={'voucher-tags '+(compact?'compact':'')}>
    {visible.map((tag,i)=>{
      const t=tag.toLowerCase()
      let cls='neutral'
      if(t.includes('free')||t.includes('freeship')||t.includes('vận chuyển'))cls='blue'
      else if(t.includes('giảm'))cls='orange'
      else if(t.includes('hoàn')||t.includes('xu'))cls='green'
      else if(t.includes('vip'))cls='purple'
      return <span className={'voucher-tag '+cls} key={tag+'-'+i}>{tag}</span>
    })}
    {hidden>0&&<span className="voucher-tag more">+{hidden}</span>}
  </div>
}
