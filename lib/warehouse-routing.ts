export type ReceivingWarehouseOption={
  id:string
  code?:string|null
  name?:string|null
  address?:string|null
}

function normalizeVietnamese(value?:string|null){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim()
}

export function suggestedWarehouseCode(address?:string|null){
  const value=normalizeVietnamese(address)
  if(!value)return null

  if(
    value.includes('bac giang') ||
    value.includes('bac ninh')
  )return 'BG'

  if(
    value.includes('ha noi') ||
    value.includes('thanh pho ha noi')
  )return 'HN'

  return null
}

export function suggestReceivingWarehouseId(
  address:string|null|undefined,
  warehouses:ReceivingWarehouseOption[],
){
  const code=suggestedWarehouseCode(address)
  if(!code)return null
  return warehouses.find(
    warehouse=>String(warehouse.code??'').trim().toUpperCase()===code
  )?.id??null
}

export function suggestReceivingWarehouseForAddresses(
  addresses:Array<string|null|undefined>,
  warehouses:ReceivingWarehouseOption[],
){
  const ids=[...new Set(
    addresses
      .map(address=>suggestReceivingWarehouseId(address,warehouses))
      .filter((id):id is string=>Boolean(id))
  )]

  const recognized=addresses.filter(address=>Boolean(suggestedWarehouseCode(address))).length
  if(recognized!==addresses.length)return null
  return ids.length===1?ids[0]:null
}
