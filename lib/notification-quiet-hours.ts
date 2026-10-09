// The notification UI follows the same Asia/Bangkok clock as the Tracking dispatcher.
// A bad/unknown quiet-hour setting fails closed and does not send notification requests.
export const NOTIFICATION_POLL_MS=5*60*1000
export const DEFAULT_QUIET_START='02:00'
export const DEFAULT_QUIET_END='06:00'

function timeMinutes(raw:string):number|null{
  const match=/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw.trim())
  return match?Number(match[1])*60+Number(match[2]):null
}

function localMinute(at:Date):number{
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(at)
  const hour=Number(parts.find(p=>p.type==='hour')?.value)
  const minute=Number(parts.find(p=>p.type==='minute')?.value)
  return hour*60+minute
}

export function isTrackingQuietNow(at:Date,quietStart:string,quietEnd:string):boolean{
  const start=timeMinutes(quietStart)
  const end=timeMinutes(quietEnd)
  if(start===null||end===null)return true
  if(start===end)return false
  const local=localMinute(at)
  return start<end?local>=start&&local<end:local>=start||local<end
}

export function msToQuietBoundary(at:Date,boundary:'start'|'end',quietStart:string,quietEnd:string):number{
  const target=timeMinutes(boundary==='start'?quietStart:quietEnd)
  if(target===null)return NOTIFICATION_POLL_MS
  const minutes=(target-localMinute(at)+1440)%1440
  const minutesAhead=minutes===0?1440:minutes
  const elapsed=at.getUTCSeconds()*1000+at.getUTCMilliseconds()
  return Math.max(1000,minutesAhead*60*1000-elapsed)
}
