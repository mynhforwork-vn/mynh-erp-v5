export type ErpRangeKey='all'|'today'|'week'|'7d'|'30d'|'month'|'quarter'|'year'|'custom'
export type ErpRangeInput={range?:string;from?:string;to?:string}

const DAY=24*60*60*1000
function ymd(date:Date){return date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0')}
function vnTodayDate(now:Date){const d=new Date(now.getTime()+7*60*60*1000);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))}
function shift(base:Date,n:number){return new Date(base.getTime()+n*DAY)}
function isDate(s?:string){if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00+07:00');return !Number.isNaN(d.getTime())&&ymd(new Date(d.getTime()+7*60*60*1000))===s}

export function resolveErpRange(input:ErpRangeInput,now=new Date()){
  const allowed:ErpRangeKey[]=['all','today','week','7d','30d','month','quarter','year','custom']
  const key=allowed.includes(input.range as ErpRangeKey)?input.range as ErpRangeKey:'all'
  const local=vnTodayDate(now),today=ymd(local),month=local.getUTCMonth()
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){from=ymd(shift(local,-(local.getUTCDay()+6)%7));label='Tuần này'}
  if(key==='7d'){from=ymd(shift(local,-6));label='7 ngày'}
  if(key==='30d'){from=ymd(shift(local,-29));label='30 ngày'}
  if(key==='month'){from=ymd(new Date(Date.UTC(local.getUTCFullYear(),month,1)));label='Tháng này'}
  if(key==='quarter'){from=ymd(new Date(Date.UTC(local.getUTCFullYear(),Math.floor(month/3)*3,1)));label='Quý này'}
  if(key==='year'){from=ymd(new Date(Date.UTC(local.getUTCFullYear(),0,1)));label='Năm nay'}
  if(key==='all'){from='1970-01-01';to='9999-12-31';label='Toàn thời gian'}
  if(key==='custom'){
    from=isDate(input.from)?String(input.from):today
    to=isDate(input.to)?String(input.to):today
    if(from>to)[from,to]=[to,from]
    label=from.split('-').reverse().join('/')+' → '+to.split('-').reverse().join('/')
  }
  return {key,from,to,label,start:new Date(from+'T00:00:00+07:00').toISOString(),end:new Date(to+'T23:59:59.999+07:00').toISOString()}
}
