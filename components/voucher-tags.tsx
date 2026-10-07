function tagHash(value:string){
  let hash=2166136261
  for(const char of value.trim().toLocaleLowerCase('vi')){
    hash^=char.codePointAt(0)!
    hash=Math.imul(hash,16777619)>>>0
  }
  return hash>>>0
}

function voucherStyle(tag:string){
  const hash=tagHash(tag)
  const hue=(hash%360000)/1000
  const saturation=58+((hash>>>9)%18)
  const textLightness=28+((hash>>>18)%9)

  return {
    borderColor:`hsl(${hue} ${Math.max(42,saturation-10)}% 80%)`,
    backgroundColor:`hsl(${hue} ${Math.max(38,saturation-14)}% 95%)`,
    color:`hsl(${hue} ${saturation}% ${textLightness}%)`,
  }
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
      <span
        className="voucher-tag"
        style={voucherStyle(tag)}
        key={tag+'-'+i}
        data-voucher-tag={tag}
      >{tag}</span>
    )}
    {hidden>0&&<span className="voucher-tag more">+{hidden}</span>}
  </div>
}
