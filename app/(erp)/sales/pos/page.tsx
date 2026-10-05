import { requireUser } from '@/lib/supabase/auth'
import { SalesPOSWorkspace } from '@/components/sales-pos-workspace'

export default async function POSPage(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')

  const [{data:warehouses,error:warehouseError},{data:balances,error:balanceError},{data:customers,error:customerError},bankTransferResult,categoriesResult]=await Promise.all([
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active',true)
      .order('code'),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,product_id,product_variant_id,sku,product_name,variant_name,quantity')
      .gt('quantity',0)
      .order('product_name')
      .limit(3000),
    supabase.from('customers')
      .select('id,name,phone,address')
      .order('updated_at',{ascending:false})
      .limit(1000),
    supabase.from('bank_transfer_configs')
      .select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active')
      .eq('config_key','DEFAULT')
      .maybeSingle(),
    supabase.from('sales_product_categories')
      .select('id,name,sort_order,is_active')
      .order('sort_order')
      .order('name'),
  ])

  const variantIds=[...new Set((balances??[]).map((row:any)=>String(row.product_variant_id??'')).filter(Boolean))]
  const productIds=[...new Set((balances??[]).map((row:any)=>String(row.product_id??'')).filter(Boolean))]
  let variants:any[]=[]
  let productMeta:any[]=[]
  if(variantIds.length){
    const {data,error}=await supabase.from('product_variants')
      .select('id,sale_price,barcode')
      .in('id',variantIds)
    if(error)throw new Error(error.message)
    variants=data??[]
  }
  if(productIds.length){
    const {data,error}=await supabase.from('products')
      .select('id,sales_category_id')
      .in('id',productIds)
    if(error)throw new Error(error.message)
    productMeta=data??[]
  }

  const variantMap=new Map(variants.map((row:any)=>[String(row.id),row]))
  const productMap=new Map(productMeta.map((row:any)=>[String(row.id),row]))
  const categoryMap=new Map((categoriesResult.data??[]).map((row:any)=>[String(row.id),row]))

  const products=(balances??[]).map((row:any)=>{
    const variant=variantMap.get(String(row.product_variant_id)) as any
    const product=productMap.get(String(row.product_id)) as any
    const category=product?.sales_category_id?categoryMap.get(String(product.sales_category_id)):null
    return {
      product_id:String(row.product_id??''),
      variant_id:String(row.product_variant_id),
      warehouse_id:String(row.warehouse_id),
      warehouse_code:String(row.warehouse_code??''),
      sku:String(row.sku??''),
      name:String(row.product_name??'Sản phẩm'),
      variant:String(row.variant_name??'Mặc định'),
      quantity:Number(row.quantity??0),
      sale_price:Number(variant?.sale_price??0),
      barcode:String(variant?.barcode??''),
      category_id:category?String(category.id):null,
      category_name:category?String(category.name):'Chưa phân loại',
    }
  })

  const errors=[warehouseError,balanceError,customerError,bankTransferResult.error,categoriesResult.error].filter(Boolean).map((e:any)=>e.message)

  return <SalesPOSWorkspace
    warehouses={(warehouses??[]) as any[]}
    products={products}
    customers={(customers??[]) as any[]}
    categories={(categoriesResult.data??[]) as any[]}
    transferConfig={(bankTransferResult.data??null) as any}
    canSell={['admin','operator'].includes(role)}
    loadError={errors.join(' · ')||null}
  />
}
