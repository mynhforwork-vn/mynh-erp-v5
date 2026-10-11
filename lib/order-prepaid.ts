/** Metadata for purchases paid before delivery (not carrier COD or a ledger posting). */
export const PREPAID_SOURCE_OPTIONS=[
  {value:'BANK_ACCOUNT',label:'Tài khoản ngân hàng'},
  {value:'DEBIT_CARD',label:'Thẻ ghi nợ'},
  {value:'CREDIT_CARD',label:'Thẻ tín dụng'},
  {value:'SPAYLATER',label:'SPayLater / trả sau'},
  {value:'OTHER',label:'Khác'},
] as const

export function prepaidSourceLabel(value:unknown):string{
  return PREPAID_SOURCE_OPTIONS.find(option=>option.value===value)?.label??'—'
}

export type PrepaidMetadata={
  prepaid_amount:number|null
  prepaid_source_type:string|null
  prepaid_source_label:string|null
}

/** Validate before calling create/update RPC so errors never create half an order. */
export function parsePrepaidMetadata(input:{
  paymentStatus:string
  amount:unknown
  sourceType:unknown
  sourceLabel:unknown
  isCreate:boolean
}):PrepaidMetadata{
  const status=input.paymentStatus.toUpperCase()
  if(!['PAID','PARTIAL'].includes(status))
    return {prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null}

  const amountText=String(input.amount??'').trim()
  const sourceType=String(input.sourceType??'').trim()
  const label=String(input.sourceLabel??'').trim()
  if(label.length>120)throw new Error('Tên tài khoản/thẻ tối đa 120 ký tự')
  // No full payment card numbers in plaintext application records.
  if(/\d(?:[\s-]?\d){11,18}/.test(label))
    throw new Error('Không lưu số thẻ đầy đủ; chỉ ghi tên và tối đa 4 số cuối')
  if(sourceType&&!PREPAID_SOURCE_OPTIONS.some(option=>option.value===sourceType))
    throw new Error('Loại tài khoản/thẻ không hợp lệ')
  if(amountText&&!/^[0-9]+$/.test(amountText))
    throw new Error('Số tiền đã thanh toán phải là số nguyên VND không âm')
  const amount=amountText?Number(amountText):null
  if(amount!==null&&(!Number.isSafeInteger(amount)||amount<=0||amount>=100_000_000_000_000))
    throw new Error('Số tiền đã thanh toán phải lớn hơn 0 và hợp lệ')
  if(input.isCreate&&['PAID','PARTIAL'].includes(status)&&(!amount||!sourceType))
    throw new Error('Đơn đã thanh toán cần có số tiền và loại tài khoản/thẻ')
  if((amount!==null||sourceType||label)&&(!amount||!sourceType))
    throw new Error('Vui lòng nhập đồng thời số tiền và loại tài khoản/thẻ thanh toán')
  return {
    prepaid_amount:amount,
    prepaid_source_type:sourceType||null,
    prepaid_source_label:label||null,
  }
}

/** Carrier COD: paid orders always collect zero; every other state needs an explicit value. */
export function resolveOrderCod(paymentStatus:string,rawAmount:unknown):number{
  if(paymentStatus.trim().toUpperCase()==='PAID')return 0
  const raw=String(rawAmount??'').trim()
  if(!raw)throw new Error('Vui lòng nhập COD cho đơn chưa thanh toán đủ')
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))
    throw new Error('COD phải là số tiền không âm, tối đa 2 chữ số thập phân')
  const amount=Number(raw)
  if(!Number.isFinite(amount)||amount>999_999_999_999)
    throw new Error('COD không hợp lệ')
  return amount
}
