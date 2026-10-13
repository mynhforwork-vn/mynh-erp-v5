/** Biểu đồ trực quan chỉ đọc cho Dashboard nhập hàng.
 * Không gọi API hoặc tracking; nhóm/phân loại đã được tính từ trạng thái hiện tại.
 */
import type {InsightCount} from '@/lib/purchase-dashboard-insights'

type Metric='missing'|'shipping'|'delivered'
type ChartItem={name:string,count:number}
const COUNT=8

export function chartItems(groups:InsightCount[],metric:Metric):ChartItem[]{
  const positive=groups.filter(g=>g[metric]>0)
    .map(g=>({name:g.name,count:g[metric]}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'vi'))
  if(positive.length<=COUNT)return positive
  const keep=positive.slice(0,COUNT)
  const rest=positive.slice(COUNT).reduce((sum,x)=>sum+x.count,0)
  return [...keep,{name:'Nhóm khác',count:rest}]
}

export function chartTotal(groups:InsightCount[],metric:Metric){
  return groups.reduce((sum,g)=>sum+g[metric],0)
}

function BarChart({items,metric,title}:{items:ChartItem[],metric:Metric,title:string}){
  if(!items.length)return <div className="pd-chart-empty">Chưa có đơn ở trạng thái này trong khoảng thời gian đã chọn.</div>
  const max=Math.max(...items.map(x=>x.count),1)
  return <div className={'pd-chart-bars pd-chart-'+metric} role="img"
    aria-label={title+': '+items.map(x=>x.name+' '+x.count+' đơn').join('; ')}>
    {items.map(item=><div className="pd-chart-bar-item" key={item.name}>
      <div className="pd-chart-bar-meta"><span title={item.name}>{item.name}</span><b>{item.count}</b></div>
      <div className="pd-chart-bar-track"><div className="pd-chart-bar-fill" style={{width:(item.count/max*100)+'%'}}/></div>
    </div>)}
  </div>
}
function ColumnChart({items,metric,title}:{items:ChartItem[],metric:Metric,title:string}){
  if(!items.length)return <div className="pd-chart-empty">Chưa có đơn ở trạng thái này trong khoảng thời gian đã chọn.</div>
  const max=Math.max(...items.map(x=>x.count),1)
  return <div className={'pd-chart-columns pd-chart-'+metric} role="img"
    aria-label={title+': '+items.map(x=>x.name+' '+x.count+' đơn').join('; ')}>
    {items.map(item=><div className="pd-chart-column" key={item.name} title={item.name+': '+item.count+' đơn'}>
      <span className="pd-chart-column-count">{item.count}</span>
      <div className="pd-chart-column-space"><div className="pd-chart-column-fill"
        style={{height:Math.max(8,item.count/max*100)+'%'}}/></div>
      <span className="pd-chart-column-label">{item.name}</span>
    </div>)}
  </div>
}
export function PurchaseInsightChart({title,description,groups,metric,variant='bar',geography,accentClass}:{
  title:string,description:string,groups:InsightCount[],metric:Metric,variant?:'bar'|'column',
  geography:'area'|'hub',accentClass?:string
}){
  const items=chartItems(groups,metric)
  const total=chartTotal(groups,metric)
  return <article className={'pd-chart-panel '+(accentClass??'')}>
    <header className="pd-chart-head">
      <div><span className="pd-chart-eyebrow">{geography==='area'?'PHƯỜNG/XÃ · TỈNH/THÀNH':'HUB ĐÍCH'}</span>
        <h3>{title}</h3><p>{description}</p></div>
      <div className="pd-chart-total"><b>{total}</b><span>đơn</span></div>
    </header>
    {variant==='column'
      ?<ColumnChart items={items} metric={metric} title={title}/>
      :<BarChart items={items} metric={metric} title={title}/>}
    {groups.filter(g=>g[metric]>0).length>COUNT&&<footer className="pd-chart-foot">Top {COUNT} nhóm có nhiều đơn nhất; phần còn lại được cộng vào “Nhóm khác”.</footer>}
  </article>
}