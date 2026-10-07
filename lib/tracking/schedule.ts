/**
 * Fallback/default tracking schedule only.
 *
 * Runtime scheduling is authoritative in Postgres:
 * tracking_runtime_settings + tracking_rule_configs +
 * tracking_interval_minutes()/next_tracking_at().
 * Keep these defaults aligned for non-runtime consumers/tests.
 */
export type TrackingStatus=
  | 'READY_TO_SHIP'
  | 'PICKUP_FAILED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'ARRIVED_TRANSIT_HUB'
  | 'ARRIVED_DESTINATION_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNING'
  | 'RETURNED'
  | 'UNKNOWN'

export function intervalMinutes(status:TrackingStatus):number|null{
  if(['DELIVERED','CANCELLED','RETURNED'].includes(status))return null
  return status==='OUT_FOR_DELIVERY'?60:120
}

export function nextTrackAt(from:Date,status:TrackingStatus):Date|null{
  const mins=intervalMinutes(status)
  if(mins===null)return null

  const candidate=new Date(from.getTime()+mins*60_000)
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23',
  }).formatToParts(candidate)
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value)
  const hour=get('hour')
  if(hour>=2&&hour<6){
    const y=get('year'),m=get('month'),d=get('day')
    return new Date(Date.UTC(y,m-1,d,23,0,0)-24*60*60*1000)
  }
  return candidate
}
