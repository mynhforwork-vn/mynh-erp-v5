export type FinancePeriod='all'|'today'|'week'|'7d'|'30d'|'month'|'quarter'|'year'

export function normalizeFinancePeriod(value?:string|null):FinancePeriod{
  if(value==='today'||value==='week'||value==='7d'||value==='30d'||value==='month'||value==='quarter'||value==='year')return value
  return 'all'
}

export function financePeriodStart(period:FinancePeriod,now=new Date()):string|null{
  if(period==='all')return null
  const offset=7*60*60*1000
  const local=new Date(now.getTime()+offset)
  const y=local.getUTCFullYear()
  const m=local.getUTCMonth()
  const d=local.getUTCDate()
  let startLocal:number
  if(period==='month')startLocal=Date.UTC(y,m,1)
  else if(period==='quarter')startLocal=Date.UTC(y,Math.floor(m/3)*3,1)
  else if(period==='year')startLocal=Date.UTC(y,0,1)
  else if(period==='week')startLocal=Date.UTC(y,m,d-(local.getUTCDay()+6)%7)
  else if(period==='7d')startLocal=Date.UTC(y,m,d-6)
  else if(period==='30d')startLocal=Date.UTC(y,m,d-29)
  else startLocal=Date.UTC(y,m,d)
  return new Date(startLocal-offset).toISOString()
}

export function financePeriodLabel(period:FinancePeriod){
  if(period==='today')return 'Hôm nay'
  if(period==='week')return 'Tuần này'
  if(period==='7d')return '7 ngày'
  if(period==='30d')return '30 ngày'
  if(period==='month')return 'Tháng này'
  if(period==='quarter')return 'Quý này'
  if(period==='year')return 'Năm nay'
  return 'Toàn thời gian'
}

export function withinFinancePeriod(value:string|Date|null|undefined,start:string|null){
  if(!start)return true
  if(!value)return false
  return new Date(value).getTime()>=new Date(start).getTime()
}

export function vnDateKey(value:string|Date){
  const date=new Date(value)
  const shifted=new Date(date.getTime()+7*60*60*1000)
  const y=shifted.getUTCFullYear()
  const m=String(shifted.getUTCMonth()+1).padStart(2,'0')
  const d=String(shifted.getUTCDate()).padStart(2,'0')
  return y+'-'+m+'-'+d
}

export function displayVnDateKey(key:string){
  const [y,m,d]=key.split('-')
  return [d,m,y].join('/')
}
