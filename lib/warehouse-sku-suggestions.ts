// Read-only SKU suggestions from persisted prior order-item mappings.
// Suggestions never create/save a product, decide IN/SKIP or change inventory.
export type HistoricSkuMapping={
  id:string
  order_id:string
  sku?:string|null
  product_name?:string|null
  variant?:string|null
  product_variant_id?:string|null
  inventory_multiplier?:number|string|null
  created_at?:string|null
  product_variants?:{
    id:string
    variant_name?:string|null
    products?:{sku?:string|null;name?:string|null}|null
  }|null
}

export type HistoricalSuggestion={
  variant_id:string
  sku:string|null
  product_name:string|null
  variant_name:string|null
  multiplier:number
  history_count:number
  match_kind:'exact'|'sku_variant'|'name_variant'
}

type PurchaseItem={id:string;order_id:string;sku?:string|null;product_name?:string|null;variant?:string|null}
type IndexedHistory={
  bySkuVariant:Map<string,HistoricSkuMapping[]>
  byNameVariant:Map<string,HistoricSkuMapping[]>
}

const clean=(value:string|null|undefined)=>
  String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi')
const sourceSku=(item:HistoricSkuMapping)=>clean(item.sku)
const sourceName=(item:HistoricSkuMapping)=>clean(item.product_name)
const sourceVariant=(item:HistoricSkuMapping)=>clean(item.variant)
const combine=(left:string,right:string)=>left+String.fromCharCode(0)+right

export function indexHistoricalSkuMappings(rows:HistoricSkuMapping[]):IndexedHistory{
  const bySkuVariant=new Map<string,HistoricSkuMapping[]>()
  const byNameVariant=new Map<string,HistoricSkuMapping[]>()
  for(const row of rows){
    if(!row?.id||!row.order_id||!row.product_variant_id||
      row.product_variants?.id!==row.product_variant_id)continue
    const sku=sourceSku(row),name=sourceName(row),variant=sourceVariant(row)
    if(sku){
      const key=combine(sku,variant)
      bySkuVariant.set(key,[...(bySkuVariant.get(key)??[]),row])
    }
    if(name){
      const key=combine(name,variant)
      byNameVariant.set(key,[...(byNameVariant.get(key)??[]),row])
    }
  }
  return {bySkuVariant,byNameVariant}
}

export function suggestSkusFromHistory(
  target:PurchaseItem,index:IndexedHistory,limit=3
):HistoricalSuggestion[]{
  const sku=clean(target.sku),name=clean(target.product_name),variant=clean(target.variant)
  if(!sku&&!name)return[]
  const evidence=new Map<string,{row:HistoricSkuMapping;rank:number}>()
  function consider(row:HistoricSkuMapping,rank:number){
    // Never suggest from another line of the same order; this is prior-order history.
    if(row.id===target.id||row.order_id===target.order_id)return
    const previous=evidence.get(row.id)
    if(!previous||previous.rank<rank)evidence.set(row.id,{row,rank})
  }
  if(sku){
    for(const row of index.bySkuVariant.get(combine(sku,variant))??[]){
      consider(row,name&&name===sourceName(row)?3:2)
    }
  }
  if(name){
    for(const row of index.byNameVariant.get(combine(name,variant))??[]){
      const previousSku=sourceSku(row)
      // Two different nonempty purchase SKUs must never be treated as identical.
      if(sku&&previousSku&&sku!==previousSku)continue
      consider(row,sku&&sku===previousSku?3:1)
    }
  }
  const groups=new Map<string,{
    variant:NonNullable<HistoricSkuMapping['product_variants']>
    rank:number
    orderIds:Set<string>
    multipliers:Map<number,{count:number;latest:number}>
    latest:number
  }>()
  for(const {row,rank} of evidence.values()){
    const id=row.product_variant_id!
    const record=row.product_variants!
    const previous=groups.get(id)??{
      variant:record,rank:0,orderIds:new Set<string>(),
      multipliers:new Map<number,{count:number;latest:number}>(),latest:0
    }
    const time=Date.parse(row.created_at??'')||0
    previous.rank=Math.max(previous.rank,rank)
    previous.latest=Math.max(previous.latest,time)
    previous.orderIds.add(row.order_id)
    const number=Number(row.inventory_multiplier??1)
    if(Number.isInteger(number)&&number>0){
      const entry=previous.multipliers.get(number)??{count:0,latest:0}
      previous.multipliers.set(number,{count:entry.count+1,latest:Math.max(entry.latest,time)})
    }
    groups.set(id,previous)
  }
  const ranked=[...groups.entries()].map(([variantId,entry])=>{
    const multiplier=[...entry.multipliers.entries()]
      .sort((a,b)=>b[1].count-a[1].count||b[1].latest-a[1].latest||a[0]-b[0])[0]?.[0]??1
    return {
      variant_id:variantId,
      sku:entry.variant.products?.sku??null,
      product_name:entry.variant.products?.name??null,
      variant_name:entry.variant.variant_name??null,
      multiplier,
      history_count:entry.orderIds.size,
      match_kind:(entry.rank===3?'exact':entry.rank===2?'sku_variant':'name_variant') as
        HistoricalSuggestion['match_kind'],
      _rank:entry.rank,_latest:entry.latest,
    }
  })
  ranked.sort((a,b)=>b._rank-a._rank||b.history_count-a.history_count||
    b._latest-a._latest||a.variant_id.localeCompare(b.variant_id))
  return ranked.slice(0,Math.max(0,Math.min(limit,5))).map(
    ({_rank:_rank,_latest:_latest,...candidate})=>candidate)
}
