import Link from 'next/link'
import {requireUser} from '@/lib/supabase/auth'
import {WarehouseSkuCatalog,type CatalogSku} from '@/components/warehouse-sku-catalog'
import '@/app/styles/warehouse-sku-catalog.css'

export default async function WarehouseSkuCatalogPage(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  // Never enable writes just because a Preview is deployed. Migration
  // 0078 + isolated QA + an explicit release gate are required.
  const enabled=process.env.ERP_SKU_CATALOG_LIVE==='true'
  const canEdit=enabled&&['admin','operator'].includes(role)
  const canMerge=enabled&&role==='admin'

  const [productsResult,variantsResult,balancesResult]=await Promise.all([
    supabase.from('products')
      .select('id,sku,name').order('sku').limit(3000),
    enabled?
      supabase.from('product_variants')
        .select('id,product_id,variant_name,sale_price,is_active,merged_into_variant_id')
        .order('variant_name').limit(5000):
      supabase.from('product_variants')
        .select('id,product_id,variant_name,sale_price')
        .order('variant_name').limit(5000),
    supabase.from('inventory_balances')
      .select('product_variant_id,warehouse_id,warehouse_code,quantity')
      .limit(10000)
  ])
  const productById=new Map((productsResult.data??[]).map((p:any)=>[String(p.id),p]))
  const balanceByVariant=new Map<string,Array<{warehouseId:string,warehouse:string,quantity:number}>>()
  for(const b of (balancesResult.data??[]) as any[]){
    const key=String(b.product_variant_id)
    const list=balanceByVariant.get(key)??[]
    list.push({warehouseId:String(b.warehouse_id),warehouse:String(b.warehouse_code),
      quantity:Number(b.quantity??0)})
    balanceByVariant.set(key,list)
  }
  const rows:CatalogSku[]=(variantsResult.data??[]).map((v:any)=>{
    const product=productById.get(String(v.product_id)) as any
    return {
      id:String(v.id),productId:String(v.product_id),
      sku:String(product?.sku??'—'),productName:String(product?.name??'—'),
      variantName:String(v.variant_name),salePrice:Number(v.sale_price??0),
      isActive:v.is_active!==false,
      mergedInto:v.merged_into_variant_id?String(v.merged_into_variant_id):null,
      balances:balanceByVariant.get(String(v.id))??[]
    }
  })
  const loadError=[productsResult.error,variantsResult.error,balancesResult.error]
    .filter(Boolean).map(e=>e?.message).join(' · ')||null
  return <div className="whx-page sku-catalog-page">
    <header className="page-head whx-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Danh mục SKU</h1>
        <p>Tìm theo ABC, sửa SKU, thêm phân loại và đối soát trước khi gộp.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/warehouse/inventory">Tồn kho</Link>
        <Link className="button" href="/warehouse/receive">Bóc tách nhập kho</Link>
      </div>
    </header>
    <WarehouseSkuCatalog rows={rows} canEdit={canEdit} canMerge={canMerge}
      loadError={loadError}/>
  </div>
}
