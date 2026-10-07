const VOUCHER_COLORS=['blue','teal','green','orange','purple','rose'] as const

function voucherColor(tag:string){
  const t=tag.trim().toLocaleLowerCase('vi')
  if(t.includes('free')||t.includes('freeship')||t.includes('vận chuyển'))return 'blue'
  if(t.includes('giảm')||t.includes('shopee')||t==='shsp')return 'orange'
  if(t.includes('hoàn')||t.includes('xu')||t.includes('cashback'))return 'green'
  if(t.includes('vip'))return 'purple'

  // Stable color for custom tags: same text => same color on every render.
  let hash=0
  for(const char of t){
    hash=(hash*31+char.codePointAt(0)!)>>>0
  }
  return VOUCHER_COLORS[hash%VOUCHER_COLORS.length]
}

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
    {visible.map((tag,i)=>
      <span className={'voucher-tag '+voucherColor(tag)} key={tag+'-'+i}>{tag}</span>
    )}
    {hidden>0&&<span className="voucher-tag more">+{hidden}</span>}
  </div>
}
