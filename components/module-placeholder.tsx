import Link from 'next/link'

export function ModulePlaceholder({
  group,title,description,bullets=[],backHref,
}:{
  group:string
  title:string
  description:string
  bullets?:string[]
  backHref?:string
}){
  return <>
    <header className="page-head">
      <div><span className="module-eyebrow">{group}</span><h1>{title}</h1><p>{description}</p></div>
      {backHref&&<div className="head-actions"><Link className="button" href={backHref}>Về tổng quan nhóm</Link></div>}
    </header>
    <section className="card module-placeholder">
      <div className="module-placeholder-mark">MYNH</div>
      <div>
        <h2>Khung chức năng đã được tạo</h2>
        <p>Route và vị trí trên sidebar đã được khóa theo Navigation Freeze. Nghiệp vụ chi tiết sẽ được triển khai theo checklist của module.</p>
        {!!bullets.length&&<div className="module-scope">{bullets.map(x=><span key={x}>✓ {x}</span>)}</div>}
      </div>
    </section>
  </>
}
