// Import-free so the audit presentation can be tested without a bundler.
function formatAuditPhone(value:string){
  const digits=value.replace(/\D/g,'')
  if(digits.length===11&&digits.startsWith('84')){
    const local='0'+digits.slice(2)
    return local.slice(0,4)+' '+local.slice(4,7)+' '+local.slice(7)
  }
  if(digits.length===10&&digits.startsWith('0'))
    return digits.slice(0,4)+' '+digits.slice(4,7)+' '+digits.slice(7)
  return value
}

/** Whitelisted audit fields only. Never render passwords, SPC or Vault values. */
export type UserAuditRow={
  action:string
  old_value?:Record<string,unknown>|null
  new_value?:Record<string,unknown>|null
}
const FIELDS:Record<string,{key:string,label:string,phone?:boolean}>={
  UPDATE_USERNAME:{key:'username',label:'Username'},
  UPDATE_PHONE:{key:'phone',label:'Số điện thoại',phone:true},
  UPDATE_EMAIL:{key:'email',label:'Email'},
  UPDATE_DEVICE:{key:'device',label:'Thiết bị'},
  UPDATE_BROWSER:{key:'browser',label:'Trình duyệt'},
  UPDATE_STATUS:{key:'status',label:'Trạng thái'},
}
export function userAuditChange(row:UserAuditRow):{label:string,before:string,after:string}|null{
  const spec=FIELDS[row.action]
  if(!spec)return null
  // Ignore unknown/legacy audit shapes rather than guessing old values.
  if(!row.old_value||!row.new_value
    ||!Object.prototype.hasOwnProperty.call(row.old_value,spec.key)
    ||!Object.prototype.hasOwnProperty.call(row.new_value,spec.key))return null
  const printable=(v:unknown)=>{
    const text=typeof v==='string'?v.trim():''
    return text?(spec.phone?formatAuditPhone(text):text):'Chưa có'
  }
  return {label:spec.label,before:printable(row.old_value[spec.key]),after:printable(row.new_value[spec.key])}
}
