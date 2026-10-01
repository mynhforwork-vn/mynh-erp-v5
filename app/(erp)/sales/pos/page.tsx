import { requireUser } from '@/lib/supabase/auth'
import { SalesPOSWorkspace } from '@/components/sales-pos-workspace'

export default async function POSPage(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')

  const [{data:warehouses,error:warehouseError},{data:balances,error:balanceError},{data:customers,error:customerError}]=await Promise.all([
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active',true)
      .order('code'),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,product_variant_id,sku,product_name,variant_name,quantity')
      .gt('quantity',0)
      .order('product_name')
      .limit(3000),
    supabase.from('customers')
      .select('id,name,phone,address')
      .order('updated_at',{ascending:false})
      .limit(1000),
  ])

  const variantIds=[...new Set((balances??[]).map((row:any)=>String(row.product_variant_id??'')).filter(Boolean))]
  let variants:any[]=[]
  if(variantIds.length){
    const {data,error}=await supabase.from('product_variants')
      .select('id,sale_price,barcode')
      .in('id',variantIds)
    if(error)throw new Error(error.message)
    variants=data??[]
  }
  const variantMap=new Map(variants.map((row:any)=>[String(row.id),row]))

  const products=(balances??[]).map((row:any)=>{
    const variant=variantMap.get(String(row.product_variant_id)) as any
    return {
      variant_id:String(row.product_variant_id),
      warehouse_id:String(row.warehouse_id),
      warehouse_code:String(row.warehouse_code??''),
      sku:String(row.sku??''),
      name:String(row.product_name??'Sản phẩm'),
      variant:String(row.variant_name??'Mặc định'),
      quantity:Number(row.quantity??0),
      sale_price:Number(variant?.sale_price??0),
      barcode:String(variant?.barcode??''),
    }
  })

  const errors=[warehouseError,balanceError,customerError].filter(Boolean).map((e:any)=>e.message)

  return <SalesPOSWorkspace
    warehouses={(warehouses??[]) as any[]}
    products={products}
    customers={(customers??[]) as any[]}
    canSell={['admin','operator'].includes(role)}
    loadError={errors.join(' · ')||null}
  />
}
