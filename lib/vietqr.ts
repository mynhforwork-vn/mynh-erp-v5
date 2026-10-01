export type BankTransferConfig={
  config_key?:string
  bank_id:string
  bank_name:string
  account_no:string
  account_name:string
  qr_template?:string|null
  transfer_prefix?:string|null
  is_active?:boolean|null
}

function cleanPart(value:string,max:number){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9 ]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max)
}

export function makeTransferReference(prefix='MYNH'){
  const p=cleanPart(prefix,10).replace(/\s+/g,'').toUpperCase()||'MYNH'
  const tail=Date.now().toString().slice(-8)
  const rand=Math.floor(100+Math.random()*900)
  return `${p}${tail}${rand}`.slice(0,25)
}

export function buildTransferDescription(_prefix:string|undefined|null,reference:string){
  return String(reference??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9-]+/g,'')
    .toUpperCase()
    .slice(0,50)
}

export function buildVietQRUrl(
  config:BankTransferConfig,
  amount:number,
  description:string,
  templateOverride?:string,
){
  if(!config?.bank_id||!config?.account_no)return ''
  const bank=encodeURIComponent(String(config.bank_id).trim())
  const account=encodeURIComponent(String(config.account_no).trim())
  const template=encodeURIComponent(String(templateOverride||config.qr_template||'compact2').trim())
  const params=new URLSearchParams()
  const safeAmount=Math.max(0,Math.round(Number(amount)||0))
  if(safeAmount>0)params.set('amount',String(safeAmount))
  const info=cleanPart(description,50)
  if(info)params.set('addInfo',info)
  const name=String(config.account_name||'').trim()
  if(name)params.set('accountName',name)
  return `https://img.vietqr.io/image/${bank}-${account}-${template}.png?${params.toString()}`
}
