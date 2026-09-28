export function VoucherTags({value}:{value?:string|null}){
  const raw=String(value??'').trim()
  if(!raw)return <span className="voucher-tag neutral">Không có</span>
  const tags=raw.split(/[·,;|]+/).map(x=>x.trim()).filter(Boolean)
  return <div className="voucher-tags">
    {tags.map((tag,i)=>{
      const t=tag.toLowerCase()
      let cls='neutral'
      if(t.includes('free')||t.includes('freeship')||t.includes('vận chuyển'))cls='blue'
      else if(t.includes('giảm'))cls='orange'
      else if(t.includes('hoàn')||t.includes('xu'))cls='green'
      else if(t.includes('vip'))cls='purple'
      return <span className={'voucher-tag '+cls} key={tag+'-'+i}>{tag}</span>
    })}
  </div>
}
