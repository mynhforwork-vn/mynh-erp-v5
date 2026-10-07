'use client'

import { useEffect,useMemo,useRef,useState,useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { assignProductSalesCategory,checkoutPOS,createPOSCustomer,createSalesProductCategory,reservePOSInvoiceCode,updateSalesProductCategory } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'
import { DEFAULT_SALE_PRINT_CONFIG,normalizeDocumentPrintConfig,type DocumentPrintConfig } from '@/lib/print-config'

type Warehouse={id:string,code:string,name:string,address?:string|null}
type Product={
  product_id:string
  variant_id:string
  warehouse_id:string
  warehouse_code:string
  sku:string
  name:string
  variant:string
  quantity:number
  sale_price:number
  barcode?:string
  category_id?:string|null
  category_name?:string|null
}
type ProductCategory={id:string,name:string,sort_order:number,is_active:boolean}
type Customer={id:string,name:string,phone?:string|null,address?:string|null}
type CartLine=Product&{cart_qty:number,unit_price:number}
type HeldOrder={
  id:string
  created_at:string
  warehouse_id:string
  customer_id:string
  cart:CartLine[]
  discount_mode:'amount'|'percent'
  discount_value:number
  other_fee:number
  note:string
}
type Receipt={
  sale_id:string
  invoice_code:string
  subtotal:number
  discount_amount:number
  other_fee:number
  total_amount:number
  paid_amount:number
  debt_amount:number
  payment_status:string
  cash_received:number
  change_amount:number
  print_items?:CartLine[]
  print_customer?:Customer|null
  print_warehouse?:Warehouse|null
  print_payment_mode?:'cash'|'transfer'|'debt'|'combined'
  print_transfer_qr?:string
  print_transfer_description?:string
  print_note?:string
}

const HOLD_KEY='mynh-pos-held-orders-v1'
const WAREHOUSE_KEY='mynh-pos-last-warehouse-v1'

function money(value:number){
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(value))+'đ'
}
function num(value:any){
  const n=Number(value)
  return Number.isFinite(n)?n:0
}
function id(){return 'hold-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)}

export function SalesPOSWorkspace({
  warehouses,
  products,
  customers,
  categories,
  transferConfig,
  printConfig,
  canSell,
  loadError,
}:{
  warehouses:Warehouse[]
  products:Product[]
  customers:Customer[]
  categories:ProductCategory[]
  transferConfig:BankTransferConfig|null
  printConfig:DocumentPrintConfig|null
  canSell:boolean
  loadError?:string|null
}){
  const router=useRouter()
  const salePrint=normalizeDocumentPrintConfig(
    printConfig?.is_active===false?null:printConfig,
    DEFAULT_SALE_PRINT_CONFIG,
  )
  const searchRef=useRef<HTMLInputElement|null>(null)
  const discountRef=useRef<HTMLInputElement|null>(null)
  const [pending,startTransition]=useTransition()
  const [warehouseId,setWarehouseId]=useState('')
  const [search,setSearch]=useState('')
  const [cart,setCart]=useState<CartLine[]>([])
  const [customerId,setCustomerId]=useState('')
  const [customerRows,setCustomerRows]=useState<Customer[]>(customers)
  const [held,setHeld]=useState<HeldOrder[]>([])
  const [heldOpen,setHeldOpen]=useState(false)
  const [createCustomerOpen,setCreateCustomerOpen]=useState(false)
  const [checkoutOpen,setCheckoutOpen]=useState(false)
  const [mobileCartOpen,setMobileCartOpen]=useState(false)
  const [paymentMode,setPaymentMode]=useState<'cash'|'transfer'|'debt'|'combined'>('cash')
  const [transferRef,setTransferRef]=useState('')
  const [invoiceExtrasOpen,setInvoiceExtrasOpen]=useState(false)
  const [discountMode,setDiscountMode]=useState<'amount'|'percent'>('amount')
  const [discountValue,setDiscountValue]=useState(0)
  const [otherFee,setOtherFee]=useState(0)
  const [note,setNote]=useState('')
  const [cashTendered,setCashTendered]=useState(0)
  const [combinedCash,setCombinedCash]=useState(0)
  const [combinedTransfer,setCombinedTransfer]=useState(0)
  const [error,setError]=useState('')
  const [receipt,setReceipt]=useState<Receipt|null>(null)
  const [printTarget,setPrintTarget]=useState<'prepay'|'final'|null>(null)
  const [categoryId,setCategoryId]=useState('ALL')
  const [categoryRows,setCategoryRows]=useState<ProductCategory[]>(categories)
  const [categoryOpen,setCategoryOpen]=useState(false)
  const [newCategory,setNewCategory]=useState('')
  const [categoryError,setCategoryError]=useState('')

  useEffect(()=>{
    const saved=localStorage.getItem(WAREHOUSE_KEY)
    const preferred=warehouses.find(w=>w.id===saved)
      ??warehouses.find(w=>w.code==='HN')
      ??warehouses[0]
    if(preferred)setWarehouseId(preferred.id)
    try{
      const raw=localStorage.getItem(HOLD_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed))setHeld(parsed)
      }
    }catch{}
    window.setTimeout(()=>searchRef.current?.focus(),50)
  },[warehouses])

  useEffect(()=>{
    if(warehouseId)localStorage.setItem(WAREHOUSE_KEY,warehouseId)
  },[warehouseId])

  useEffect(()=>{setCategoryRows(categories)},[categories])

  function persistHeld(next:HeldOrder[]){
    setHeld(next)
    localStorage.setItem(HOLD_KEY,JSON.stringify(next))
  }

  const warehouse=warehouses.find(w=>w.id===warehouseId)??null
  const warehouseProducts=useMemo(
    ()=>products.filter(p=>p.warehouse_id===warehouseId),
    [products,warehouseId],
  )

  const filteredProducts=useMemo(()=>{
    const q=search.trim().toLowerCase()
    let rows=warehouseProducts
    if(categoryId!=='ALL'){
      rows=categoryId==='UNCATEGORIZED'
        ? rows.filter(p=>!p.category_id)
        : rows.filter(p=>p.category_id===categoryId)
    }
    if(!q)return rows
    return rows.filter(p=>
      p.sku.toLowerCase().includes(q)||
      p.name.toLowerCase().includes(q)||
      p.variant.toLowerCase().includes(q)||
      String(p.barcode??'').toLowerCase().includes(q)
    )
  },[warehouseProducts,search,categoryId])

  const subtotal=cart.reduce((sum,line)=>sum+line.cart_qty*line.unit_price,0)
  const discountAmount=Math.min(
    subtotal+otherFee,
    discountMode==='percent'
      ? subtotal*Math.max(0,Math.min(100,discountValue))/100
      : Math.max(0,discountValue),
  )
  const total=Math.max(0,subtotal-discountAmount+Math.max(0,otherFee))
  const cartQty=cart.reduce((sum,line)=>sum+line.cart_qty,0)
  const selectedCustomer=customerRows.find(c=>c.id===customerId)??null
  const transferAmount=paymentMode==='transfer'
    ? total
    : paymentMode==='combined'
      ? Math.max(0,combinedTransfer)
      : 0
  const transferDescription=buildTransferDescription(
    null,
    transferRef||'POS',
  )
  const transferQR=transferConfig?.is_active&&transferAmount>0
    ? buildVietQRUrl(transferConfig,transferAmount,transferDescription,'compact2')
    : ''

  function printReceipt(target:'prepay'|'final'){
    setPrintTarget(target)
    window.setTimeout(()=>window.print(),80)
  }

  function resetSale(){
    setCart([])
    setCustomerId('')
    setDiscountMode('amount')
    setDiscountValue(0)
    setOtherFee(0)
    setNote('')
    setCashTendered(0)
    setCombinedCash(0)
    setCombinedTransfer(0)
    setCheckoutOpen(false)
    setMobileCartOpen(false)
    setPaymentMode('cash')
    setTransferRef('')
    setInvoiceExtrasOpen(false)
    setError('')
    window.setTimeout(()=>searchRef.current?.focus(),50)
  }

  function changeWarehouse(nextId:string){
    if(nextId===warehouseId)return
    if(cart.length&&!window.confirm('Đổi Kho bán sẽ xóa giỏ hiện tại. Tiếp tục?'))return
    setWarehouseId(nextId)
    resetSale()
  }

  function addProduct(product:Product){
    if(!canSell)return
    setCart(prev=>{
      const found=prev.find(line=>line.variant_id===product.variant_id)
      if(found){
        if(found.cart_qty>=product.quantity)return prev
        return prev.map(line=>line.variant_id===product.variant_id
          ? {...line,cart_qty:line.cart_qty+1}
          : line
        )
      }
      return [...prev,{...product,cart_qty:1,unit_price:product.sale_price}]
    })
  }

  function scanEnter(){
    const q=search.trim().toLowerCase()
    if(!q)return
    const exact=warehouseProducts.find(p=>
      p.sku.toLowerCase()===q||String(p.barcode??'').toLowerCase()===q
    )
    if(exact){
      addProduct(exact)
      setSearch('')
      window.setTimeout(()=>searchRef.current?.focus(),10)
      return
    }
    if(filteredProducts.length===1){
      addProduct(filteredProducts[0])
      setSearch('')
    }
  }

  function setQty(variantId:string,next:number){
    setCart(prev=>prev
      .map(line=>line.variant_id===variantId
        ? {...line,cart_qty:Math.max(0,Math.min(line.quantity,Math.floor(next)||0))}
        : line
      )
      .filter(line=>line.cart_qty>0)
    )
  }

  function removeLine(variantId:string){
    setCart(prev=>prev.filter(line=>line.variant_id!==variantId))
  }

  function holdOrder(){
    if(!cart.length)return
    const entry:HeldOrder={
      id:id(),
      created_at:new Date().toISOString(),
      warehouse_id:warehouseId,
      customer_id:customerId,
      cart,
      discount_mode:discountMode,
      discount_value:discountValue,
      other_fee:otherFee,
      note,
    }
    persistHeld([entry,...held].slice(0,30))
    resetSale()
  }

  function restoreHeld(entry:HeldOrder){
    if(cart.length&&!window.confirm('Mở đơn tạm sẽ thay thế giỏ hiện tại. Tiếp tục?'))return
    const allowed=new Map(products
      .filter(p=>p.warehouse_id===entry.warehouse_id)
      .map(p=>[p.variant_id,p]))
    const restored=entry.cart
      .map(line=>{
        const live=allowed.get(line.variant_id)
        if(!live)return null
        return {...live,cart_qty:Math.min(line.cart_qty,live.quantity),unit_price:line.unit_price}
      })
      .filter(Boolean) as CartLine[]
    setWarehouseId(entry.warehouse_id)
    setCustomerId(entry.customer_id)
    setCart(restored)
    setDiscountMode(entry.discount_mode)
    setDiscountValue(entry.discount_value)
    setOtherFee(entry.other_fee)
    setNote(entry.note)
    persistHeld(held.filter(x=>x.id!==entry.id))
    setHeldOpen(false)
  }

  function removeHeld(holdId:string){
    persistHeld(held.filter(x=>x.id!==holdId))
  }

  function createCategory(){
    const name=newCategory.trim()
    if(!name)return
    setCategoryError('')
    startTransition(async()=>{
      const result=await createSalesProductCategory({name})
      if(!result.ok){setCategoryError(result.error);return}
      setCategoryRows(prev=>[...prev,result.data].sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'vi')))
      setNewCategory('')
      router.refresh()
    })
  }

  function toggleCategory(category:ProductCategory){
    setCategoryError('')
    startTransition(async()=>{
      const result=await updateSalesProductCategory({id:category.id,is_active:!category.is_active})
      if(!result.ok){setCategoryError(result.error);return}
      setCategoryRows(prev=>prev.map(x=>x.id===category.id?{...x,is_active:!x.is_active}:x))
      if(categoryId===category.id&&category.is_active)setCategoryId('ALL')
      router.refresh()
    })
  }

  function assignCategory(productId:string,categoryIdValue:string){
    setCategoryError('')
    startTransition(async()=>{
      const result=await assignProductSalesCategory({product_id:productId,category_id:categoryIdValue||null})
      if(!result.ok){setCategoryError(result.error);return}
      router.refresh()
    })
  }

  async function openPayment(mode:'cash'|'transfer'|'debt'|'combined'){
    if(!cart.length){setError('Giỏ hàng đang trống');return}
    if(total<=0){setError('Tổng thanh toán phải lớn hơn 0');return}
    if(mode==='debt'&&!customerId){
      setError('Ghi nợ cần gắn khách hàng trước.')
      setCreateCustomerOpen(true)
      return
    }
    if((mode==='transfer'||mode==='combined')&&(!transferConfig?.is_active||!transferConfig.bank_id||!transferConfig.account_no)){
      setError('Chưa cấu hình tài khoản chuyển khoản. Mở Cài đặt → Thanh toán & QR để thiết lập.')
      return
    }

    let documentCode=transferRef
    if((mode==='transfer'||mode==='combined')&&!documentCode){
      const reserved=await reservePOSInvoiceCode()
      if(!reserved.ok){
        setError(reserved.error)
        return
      }
      documentCode=reserved.data
      setTransferRef(documentCode)
    }

    setError('')
    setPaymentMode(mode)
    setCashTendered(total)
    setCombinedCash(0)
    setCombinedTransfer(0)
    setCheckoutOpen(true)
    setMobileCartOpen(true)
  }

  function beginCheckout(){
    openPayment('cash')
  }

  function submitCheckout(){
    if(!warehouseId||!cart.length)return
    setError('')

    let payments:{method:'CASH'|'TRANSFER',amount:number,tendered_amount?:number|null,reference_code?:string|null}[]=[]
    if(paymentMode==='cash'){
      if(cashTendered<total){setError('Tiền khách đưa chưa đủ');return}
      payments=[{method:'CASH',amount:total,tendered_amount:cashTendered}]
    }
    if(paymentMode==='transfer'){
      if(!transferConfig?.is_active||!transferConfig.bank_id||!transferConfig.account_no){
        setError('Chưa cấu hình tài khoản chuyển khoản')
        return
      }
      if(!transferRef){setError('Chưa có mã phiếu bán');return}
      payments=[{method:'TRANSFER',amount:total,reference_code:transferRef}]
    }
    if(paymentMode==='debt'){
      if(!customerId){setError('Cần chọn khách hàng để ghi nợ');return}
      payments=[]
    }
    if(paymentMode==='combined'){
      const cash=Math.max(0,combinedCash)
      const transfer=Math.max(0,combinedTransfer)
      if(cash+transfer>total){setError('Tổng tiền đã nhận vượt số tiền cần thanh toán');return}
      const debt=total-cash-transfer
      if(debt>0&&!customerId){setError('Phần còn nợ cần gắn khách hàng');return}
      if(transfer>0&&(!transferConfig?.is_active||!transferConfig.bank_id||!transferConfig.account_no)){
        setError('Chưa cấu hình tài khoản chuyển khoản')
        return
      }
      if(cash>0)payments.push({method:'CASH',amount:cash,tendered_amount:cash})
      if(transfer>0)payments.push({
        method:'TRANSFER',
        amount:transfer,
        reference_code:transferRef||null,
      })
    }

    startTransition(async()=>{
      try{
        const result=await checkoutPOS({
          warehouse_id:warehouseId,
          customer_id:customerId||null,
          items:cart.map(line=>({
            product_variant_id:line.variant_id,
            quantity:line.cart_qty,
            sale_price:line.unit_price,
          })),
          discount_amount:discountAmount,
          other_fee:Math.max(0,otherFee),
          payments,
          note:note||null,
          invoice_code:transferRef||null,
        })
        if(!result.ok){
          setError(result.error)
          return
        }
        setReceipt({
          ...result.data,
          print_items:cart.map(line=>({...line})),
          print_customer:selectedCustomer,
          print_warehouse:warehouse,
          print_payment_mode:paymentMode,
          print_transfer_qr:transferQR,
          print_transfer_description:transferDescription,
          print_note:note,
        })
        resetSale()
      }catch(e:any){
        setError(e?.message??'Không thể hoàn tất thanh toán')
      }
    })
  }

  function createCustomer(form:HTMLFormElement){
    const fd=new FormData(form)
    const name=String(fd.get('name')??'').trim()
    const phone=String(fd.get('phone')??'').trim()
    const address=String(fd.get('address')??'').trim()
    setError('')
    startTransition(async()=>{
      try{
        const result=await createPOSCustomer({name,phone,address})
        if(!result.ok){
          setError(result.error)
          return
        }
        const row=result.data as Customer
        setCustomerRows(prev=>[row,...prev.filter(x=>x.id!==row.id)])
        setCustomerId(row.id)
        setCreateCustomerOpen(false)
      }catch(e:any){
        setError(e?.message??'Không thể tạo khách hàng')
      }
    })
  }

  useEffect(()=>{
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='F2'){event.preventDefault();beginCheckout()}
      if(event.key==='F3'){event.preventDefault();holdOrder()}
      if(event.key==='F4'){event.preventDefault();searchRef.current?.focus()}
      if(event.key==='F5'){event.preventDefault();setCreateCustomerOpen(true)}
      if(event.key==='F7'){event.preventDefault();discountRef.current?.focus()}
      if(event.key==='F8'){
        event.preventDefault()
        const last=cart[cart.length-1]
        if(last)removeLine(last.variant_id)
      }
      if(event.key==='Escape'){
        setCheckoutOpen(false)
        setHeldOpen(false)
        setCreateCustomerOpen(false)
      }
    }
    window.addEventListener('keydown',onKeyDown)
    return ()=>window.removeEventListener('keydown',onKeyDown)
  },[cart,total,warehouseId,customerId,discountMode,discountValue,otherFee,note])

  return <div className="tracking-screen tracking-screen-v2 pos-screen pos-screen-v2">
    <header className="page-head tracking-page-head-v2 pos-page-head-v2">
      <div>
        <span className="module-eyebrow">BÁN HÀNG</span>
        <h1>POS bán hàng</h1>
        <p>Bán tại quầy · tồn theo kho · thanh toán nhanh · hóa đơn tức thời</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/sales">Tổng quan bán hàng</Link>
        <Link className="button" href="/sales/history">Lịch sử bán</Link>
        <span className="status-pill green pos-live-status"><i/>POS sẵn sàng</span>
      </div>
    </header>

    <section className="tracking-command-center-v2 pos-command-center-v2">
      <div className="tracking-control-row-v2 pos-control-row-v2">
        <label className="pos-warehouse pos-warehouse-v2">
          <span>Kho bán</span>
          <select value={warehouseId} onChange={e=>changeWarehouse(e.target.value)}>
            {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.address??w.name}</option>)}
          </select>
        </label>

        <div className="pos-search pos-search-v2">
          <span className="pos-search-icon">⌕</span>
          <input
            ref={searchRef}
            value={search}
            onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>{
              if(e.key==='Enter'){e.preventDefault();scanEnter()}
              if(e.key==='Escape'){e.preventDefault();setSearch('')}
            }}
            aria-label="Tìm sản phẩm theo barcode, SKU hoặc tên"
            placeholder="Quét barcode · nhập SKU · tìm tên sản phẩm"
          />
          {search&&<button className="pos-search-clear" type="button" onClick={()=>{setSearch('');searchRef.current?.focus()}} aria-label="Xóa từ khóa">×</button>}
          <kbd>F4</kbd>
        </div>

        <div className="pos-control-actions">
          <button className="button small" type="button" onClick={()=>setCreateCustomerOpen(v=>!v)}>
            {selectedCustomer?selectedCustomer.name:'Khách lẻ'}
          </button>
          <button className="button small" type="button" onClick={()=>setHeldOpen(v=>!v)}>
            Đơn tạm ({held.length})
          </button>
        </div>
      </div>
    </section>

    {loadError&&<div className="error-box">{loadError}</div>}
    {error&&<div className="error-box">{error}</div>}

    {createCustomerOpen&&<div className="pos-popover pos-customer-popover">
      <div className="pos-popover-head">
        <b>Gắn / tạo khách hàng</b>
        <button type="button" onClick={()=>setCreateCustomerOpen(false)}>×</button>
      </div>
      <label>Khách hiện có
        <select value={customerId} onChange={e=>setCustomerId(e.target.value)}>
          <option value="">Khách lẻ</option>
          {customerRows.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}
        </select>
      </label>
      <form onSubmit={e=>{e.preventDefault();createCustomer(e.currentTarget)}}>
        <b>Tạo nhanh khách mới</b>
        <input name="name" placeholder="Tên khách hàng" required/>
        <input name="phone" placeholder="SĐT"/>
        <input name="address" placeholder="Địa chỉ"/>
        <button className="button primary" type="submit" disabled={pending}>Tạo & gắn khách</button>
      </form>
    </div>}

    {heldOpen&&<div className="pos-popover pos-held-popover">
      <div className="pos-popover-head">
        <b>Đơn tạm ({held.length})</b>
        <button type="button" onClick={()=>setHeldOpen(false)}>×</button>
      </div>
      {!held.length
        ? <div className="empty compact">Chưa có đơn tạm.</div>
        : held.map(entry=>{
            const wh=warehouses.find(w=>w.id===entry.warehouse_id)
            const amount=entry.cart.reduce((s,x)=>s+x.cart_qty*x.unit_price,0)
            return <div className="pos-held-row" key={entry.id}>
              <div><b>{wh?.code??'Kho'} · {entry.cart.reduce((s,x)=>s+x.cart_qty,0)} SP</b><span>{new Date(entry.created_at).toLocaleString('vi-VN')}</span></div>
              <strong>{money(amount)}</strong>
              <button className="button small primary" type="button" onClick={()=>restoreHeld(entry)}>Mở</button>
              <button className="button small" type="button" onClick={()=>removeHeld(entry.id)}>Xóa</button>
            </div>
          })}
    </div>}

    <button
      className={'mobile-pos-cart-bar '+(cart.length?'has-items':'')}
      type="button"
      onClick={()=>setMobileCartOpen(true)}
      disabled={!cart.length}
    >
      <span><b>{cartQty}</b><small>SP trong giỏ</small></span>
      <strong>{money(total)}</strong>
      <i>Giỏ hàng ›</i>
    </button>

    <div className="pos-workspace">
      <section className="pos-products">
        <div className="pos-product-toolbar pos-product-toolbar-v2">
          <div>
            <span className="pos-section-kicker">SẢN PHẨM ĐANG BÁN</span>
            <b>{warehouse?.code??'—'} · {warehouse?.address??warehouse?.name??''}</b>
          </div>
          <div className="pos-product-meta">
            <b>{filteredProducts.length}</b>
            <span>{search?'kết quả':'SKU hiển thị'}</span>
          </div>
          <button className="button small pos-category-settings-button" type="button" onClick={()=>setCategoryOpen(v=>!v)}>⚙ Phân loại</button>
        </div>

        <div className="pos-product-body">
          <aside className="pos-category-rail">
            <button className={categoryId==='ALL'?'active':''} type="button" onClick={()=>setCategoryId('ALL')}><span>Tất cả</span><b>{warehouseProducts.length}</b></button>
            {categoryRows.filter(x=>x.is_active).map(category=><button key={category.id} className={categoryId===category.id?'active':''} type="button" onClick={()=>setCategoryId(category.id)}><span>{category.name}</span><b>{warehouseProducts.filter(p=>p.category_id===category.id).length}</b></button>)}
            {warehouseProducts.some(p=>!p.category_id)&&<button className={categoryId==='UNCATEGORIZED'?'active':''} type="button" onClick={()=>setCategoryId('UNCATEGORIZED')}><span>Chưa phân loại</span><b>{warehouseProducts.filter(p=>!p.category_id).length}</b></button>}
          </aside>
          <div className="pos-product-pane">
            {categoryOpen&&<div className="pos-category-settings">
              <div className="pos-popover-head"><div><b>Cài đặt phân loại</b><span>Lưu trực tiếp vào dữ liệu sản phẩm</span></div><button type="button" onClick={()=>setCategoryOpen(false)}>×</button></div>
              {categoryError&&<div className="error-box compact">{categoryError}</div>}
              <div className="pos-category-settings-list">
                {categoryRows.map(category=><div key={category.id}><span><b>{category.name}</b><small>{category.is_active?'Đang hiển thị':'Đã ẩn'}</small></span><button className="button small" type="button" onClick={()=>toggleCategory(category)}>{category.is_active?'Ẩn':'Hiện'}</button></div>)}
              </div>
              <div className="pos-category-add"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="Tên phân loại mới"/><button className="button small primary" type="button" onClick={createCategory} disabled={pending}>+ Thêm</button></div>
              <div className="pos-category-product-list"><b>Gắn phân loại sản phẩm</b>{Array.from(new Map(warehouseProducts.map(p=>[p.product_id,p])).values()).map(product=><label key={product.product_id}><span>{product.name}<small>{product.sku}</small></span><select value={product.category_id??''} onChange={e=>assignCategory(product.product_id,e.target.value)}><option value="">Chưa phân loại</option>{categoryRows.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>)}</div>
            </div>}

            <div className="pos-product-grid">
              {!filteredProducts.length
                ? <div className="empty">Không tìm thấy sản phẩm phù hợp trong kho này.</div>
                : filteredProducts.map(product=><button
                    type="button"
                    className="pos-product-tile-final"
                    key={product.warehouse_id+product.variant_id}
                    onClick={()=>addProduct(product)}
                    disabled={!canSell||product.quantity<=0}
                  >
                    <div className="pos-final-top">
                      <span className="pos-final-name" title={product.name}>{product.name}</span>
                      <span className="pos-final-variant" title={product.variant}>{product.variant}</span>
                    </div>
                    <div className="pos-final-bottom">
                      <span className="pos-final-sku" title={product.sku}>{product.sku}</span>
                      <strong>{money(product.sale_price)}</strong>
                      <span className={'pos-final-stock '+(product.quantity<=5?'low':'')}>Tồn {product.quantity} · {product.warehouse_code}</span>
                    </div>
                  </button>)}
            </div>
          </div>
        </div>
      </section>

      <aside className={'pos-cart '+(mobileCartOpen||checkoutOpen?'mobile-open':'')}>
        {!checkoutOpen
          ? <>
              <div className="pos-cart-head pos-cart-head-v2">
                <div>
                  <span className="module-eyebrow">HÓA ĐƠN HIỆN TẠI</span>
                  <b>Giỏ hàng · {cartQty} SP</b>
                  <small>{cart.length} SKU · {selectedCustomer?.name??'Khách lẻ'}</small>
                </div>
                <div className="pos-cart-head-actions">
                  {cart.length>0&&<button type="button" className="pos-text-danger" onClick={()=>setCart([])}>Xóa giỏ</button>}
                  <button type="button" className="mobile-cart-close" onClick={()=>setMobileCartOpen(false)} aria-label="Đóng giỏ">×</button>
                </div>
              </div>

              <div className="pos-cart-lines">
                {!cart.length
                  ? <div className="pos-cart-empty"><b>Giỏ hàng đang trống</b><span>Chọn thẻ sản phẩm hoặc quét barcode để bắt đầu.</span></div>
                  : cart.map(line=><div className="pos-cart-line" key={line.variant_id}>
                      <div className="pos-cart-product">
                        <b>{line.name}</b><span>{line.variant}</span><small>{line.sku} · Tồn {line.quantity}</small>
                      </div>
                      <div className="pos-qty">
                        <button type="button" onClick={()=>setQty(line.variant_id,line.cart_qty-1)}>−</button>
                        <input value={line.cart_qty} onChange={e=>setQty(line.variant_id,num(e.target.value))}/>
                        <button type="button" onClick={()=>setQty(line.variant_id,line.cart_qty+1)}>+</button>
                      </div>
                      <label className="pos-price">
                        <span>Đơn giá</span>
                        <input value={line.unit_price} onChange={e=>setCart(prev=>prev.map(x=>x.variant_id===line.variant_id?{...x,unit_price:Math.max(0,num(e.target.value))}:x))}/>
                      </label>
                      <strong>{money(line.cart_qty*line.unit_price)}</strong>
                      <button type="button" className="pos-remove" onClick={()=>removeLine(line.variant_id)}>×</button>
                    </div>)}
              </div>

              <div className="pos-customer-row">
                <div><span>Khách hàng</span><b>{selectedCustomer?.name??'Khách lẻ'}</b>{selectedCustomer?.phone&&<small>{selectedCustomer.phone}</small>}</div>
                <button className="button small" type="button" onClick={()=>setCreateCustomerOpen(true)}>Gắn khách</button>
              </div>

              <div className="pos-summary pos-summary-fast">
                <div><span>Tiền hàng</span><b>{money(subtotal)}</b></div>
                {discountAmount>0&&<div><span>Giảm giá</span><b>−{money(discountAmount)}</b></div>}
                {otherFee>0&&<div><span>Phí khác</span><b>{money(otherFee)}</b></div>}
                <button className="pos-invoice-extras-toggle" type="button" onClick={()=>setInvoiceExtrasOpen(v=>!v)}>
                  {invoiceExtrasOpen?'Thu gọn tùy chỉnh':'Tùy chỉnh hóa đơn'} <span>{invoiceExtrasOpen?'▴':'▾'}</span>
                </button>
                {invoiceExtrasOpen&&<div className="pos-invoice-extras">
                  <div className="pos-discount-row">
                    <span>Giảm giá</span>
                    <select value={discountMode} onChange={e=>setDiscountMode(e.target.value as any)}>
                      <option value="amount">Số tiền</option>
                      <option value="percent">%</option>
                    </select>
                    <input ref={discountRef} value={discountValue} onChange={e=>setDiscountValue(Math.max(0,num(e.target.value)))}/>
                    <b>−{money(discountAmount)}</b>
                  </div>
                  <div><span>Phí khác</span><input value={otherFee} onChange={e=>setOtherFee(Math.max(0,num(e.target.value)))}/><b>{money(otherFee)}</b></div>
                  <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú hóa đơn (không bắt buộc)"/>
                </div>}
                <div className="pos-total"><span>PHẢI THU</span><b>{money(total)}</b></div>
              </div>

              <div className="pos-cart-actions pos-cart-actions-fast">
                <button className="button" type="button" onClick={holdOrder} disabled={!cart.length||pending}>Giữ</button>
                <button className="button pos-quick-cash" type="button" onClick={()=>openPayment('cash')} disabled={!cart.length||pending||!canSell}>
                  Tiền mặt
                </button>
                <button className="button primary pos-quick-transfer" type="button" onClick={()=>openPayment('transfer')} disabled={!cart.length||pending||!canSell}>
                  Chuyển khoản
                </button>
                <button className="button" type="button" onClick={()=>openPayment('debt')} disabled={!cart.length||pending||!canSell}>
                  Ghi nợ
                </button>
              </div>
            </>
          : <div className="pos-checkout">
              <div className="pos-checkout-head">
                <button type="button" onClick={()=>setCheckoutOpen(false)}>←</button>
                <div><span className="module-eyebrow">THANH TOÁN POS</span><b>Thanh toán</b><span>{cartQty} sản phẩm · {warehouse?.code}</span></div>
              </div>

              <div className="pos-pay-methods">
                <button className={paymentMode==='cash'?'active':''} type="button" onClick={()=>openPayment('cash')}>Tiền mặt</button>
                <button className={paymentMode==='transfer'?'active':''} type="button" onClick={()=>openPayment('transfer')}>Chuyển khoản</button>
                <button className={paymentMode==='debt'?'active':''} type="button" onClick={()=>openPayment('debt')}>Ghi nợ</button>
                <button className={paymentMode==='combined'?'active':''} type="button" onClick={()=>openPayment('combined')}>Kết hợp</button>
              </div>

              <div className="pos-checkout-total">
                <span>Tổng thanh toán</span><b>{money(total)}</b>
              </div>

              {paymentMode==='cash'&&<div className="pos-cash-panel">
                <label>Khách đưa
                  <input value={cashTendered} onChange={e=>setCashTendered(Math.max(0,num(e.target.value)))}/>
                </label>
                <div className="pos-money-presets">
                  {[100000,200000,500000,1000000].map(v=><button key={v} type="button" onClick={()=>setCashTendered(v)}>{v===1000000?'1tr':v/1000+'k'}</button>)}
                  <button type="button" onClick={()=>setCashTendered(total)}>Vừa đủ</button>
                </div>
                <div className="pos-change"><span>Tiền thừa</span><b>{money(Math.max(0,cashTendered-total))}</b></div>
              </div>}

              {paymentMode==='transfer'&&<div className="pos-transfer-panel">
                {transferQR
                  ? <img src={transferQR} alt="VietQR chuyển khoản"/>
                  : <div className="empty compact">Chưa có cấu hình QR.</div>}
                <div className="pos-transfer-info">
                  <div><span>Số tiền</span><b className="amount">{money(total)}</b></div>
                  <div><span>Ngân hàng</span><b>{transferConfig?.bank_name??'—'}</b></div>
                  <div><span>Số tài khoản</span><b>{transferConfig?.account_no??'—'}</b></div>
                  <div><span>Tên tài khoản</span><b>{transferConfig?.account_name??'—'}</b></div>
                  <div><span>Nội dung CK</span><b>{transferDescription}</b></div>
                </div>
                <small>QR đã gắn sẵn đúng số tiền. Nội dung chuyển khoản = {transferRef}. Chỉ xác nhận sau khi đã nhận tiền.</small>
                <div className="pos-transfer-actions">
                  <button className="button" type="button" onClick={()=>printReceipt('prepay')}>In phiếu cho khách</button>
                </div>
              </div>}

              {paymentMode==='debt'&&<div className="pos-payment-note warning">
                <b>Ghi nợ toàn bộ</b>
                <span>{selectedCustomer?'Công nợ sẽ ghi cho '+selectedCustomer.name:'Cần gắn khách hàng trước khi xác nhận.'}</span>
              </div>}

              {paymentMode==='combined'&&<div className="pos-combined-panel">
                <label>Tiền mặt<input value={combinedCash} onChange={e=>setCombinedCash(Math.max(0,num(e.target.value)))}/></label>
                <label>Chuyển khoản<input value={combinedTransfer} onChange={e=>setCombinedTransfer(Math.max(0,num(e.target.value)))}/></label>
                {combinedTransfer>0&&transferQR&&<div className="pos-combined-qr">
                  <img src={transferQR} alt="VietQR phần chuyển khoản"/>
                  <span>{money(combinedTransfer)} · {transferDescription}</span>
                </div>}
                <div><span>Còn nợ</span><b>{money(Math.max(0,total-combinedCash-combinedTransfer))}</b></div>
                {total-combinedCash-combinedTransfer>0&&!selectedCustomer&&<small>Cần gắn khách hàng cho phần còn nợ.</small>}
              </div>}

              <div className="pos-checkout-customer">
                <span>Khách hàng</span>
                <b>{selectedCustomer?.name??'Khách lẻ'}</b>
                <button className="button small" type="button" onClick={()=>setCreateCustomerOpen(true)}>Thay đổi</button>
              </div>

              <button className="button primary pos-confirm-payment" type="button" onClick={submitCheckout} disabled={pending}>
                {pending
                  ? 'Đang xử lý...'
                  : paymentMode==='transfer'
                    ? 'Đã nhận chuyển khoản · '+money(total)
                    : 'Xác nhận thanh toán · '+money(total)}
              </button>
            </div>}
      </aside>
    </div>

    {receipt&&<div className="pos-success-layer">
      <div className="pos-success-card">
        <div className="pos-success-icon">✓</div>
        <h2>{receipt.payment_status==='UNPAID'?'Đã ghi nợ':'Thanh toán thành công'}</h2>
        <b>{receipt.invoice_code}</b>
        <div className="pos-success-money">{money(receipt.total_amount)}</div>
        <div className="pos-success-grid">
          <div><span>Đã thu</span><b>{money(receipt.paid_amount)}</b></div>
          <div><span>Còn nợ</span><b>{money(receipt.debt_amount)}</b></div>
          <div><span>Khách đưa</span><b>{money(receipt.cash_received)}</b></div>
          <div><span>Tiền thừa</span><b>{money(receipt.change_amount)}</b></div>
        </div>
        <div className="pos-success-actions">
          <button className="button" type="button" onClick={()=>printReceipt('final')}>In hóa đơn</button>
          <Link className="button" href={'/sales/history?sale='+receipt.sale_id}>Xem hóa đơn</Link>
          <button
            className="button primary"
            type="button"
            onClick={()=>{
              setReceipt(null)
              setPrintTarget(null)
              router.refresh()
              window.setTimeout(()=>searchRef.current?.focus(),80)
            }}
          >Đơn mới</button>
        </div>
      </div>
    </div>}

    {printTarget&&<div className={'pos-inline-receipt-print print-paper-'+salePrint.paper_size.toLowerCase().replace('_','-')}>
      <div className="receipt-brand">
        <b>{salePrint.brand_name}</b>
        <span>{salePrint.title}</span>
        {salePrint.header_note&&<small>{salePrint.header_note}</small>}
        <small>{printTarget==='prepay'?'CHỜ THANH TOÁN':receipt?.payment_status==='UNPAID'?'GHI NỢ':'ĐÃ THANH TOÁN'}</small>
      </div>

      <div className="receipt-meta">
        <div><span>Mã phiếu</span><b>{printTarget==='prepay'?transferRef:receipt?.invoice_code}</b></div>
        {salePrint.show_warehouse&&<div><span>Kho bán</span><b>{printTarget==='prepay'
          ? (warehouse?.code+' · '+(warehouse?.address??warehouse?.name??''))
          : (receipt?.print_warehouse?.code+' · '+(receipt?.print_warehouse?.address??receipt?.print_warehouse?.name??''))}</b></div>}
        <div><span>Khách hàng</span><b>{printTarget==='prepay'
          ? (selectedCustomer?.name??'Khách lẻ')
          : (receipt?.print_customer?.name??'Khách lẻ')}</b></div>
        {salePrint.show_customer_phone&&(printTarget==='prepay'?selectedCustomer?.phone:receipt?.print_customer?.phone)&&<div>
          <span>SĐT</span><b>{printTarget==='prepay'?selectedCustomer?.phone:receipt?.print_customer?.phone}</b>
        </div>}
      </div>

      {salePrint.show_invoice_details&&<table>
        <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>{(printTarget==='prepay'?cart:(receipt?.print_items??[])).map((item,index)=><tr key={item.variant_id}>
          <td>{index+1}</td>
          <td><b>{item.name}</b>{(salePrint.show_sku||salePrint.show_variant)&&<small>{salePrint.show_sku?item.sku:''}{salePrint.show_sku&&salePrint.show_variant?' · ':''}{salePrint.show_variant?item.variant:''}</small>}</td>
          <td>{item.cart_qty}</td>
          <td>{money(item.unit_price)}</td>
          <td>{money(item.cart_qty*item.unit_price)}</td>
        </tr>)}</tbody>
      </table>}

      <div className="receipt-totals">
        <div><span>Tiền hàng</span><b>{money(printTarget==='prepay'?subtotal:Number(receipt?.subtotal??0))}</b></div>
        {(printTarget==='prepay'?discountAmount:Number(receipt?.discount_amount??0))>0&&<div>
          <span>Giảm giá</span><b>−{money(printTarget==='prepay'?discountAmount:Number(receipt?.discount_amount??0))}</b>
        </div>}
        {(printTarget==='prepay'?otherFee:Number(receipt?.other_fee??0))>0&&<div>
          <span>Phí khác</span><b>{money(printTarget==='prepay'?otherFee:Number(receipt?.other_fee??0))}</b>
        </div>}
        <div className="total"><span>TỔNG THANH TOÁN</span><b>{money(printTarget==='prepay'?total:Number(receipt?.total_amount??0))}</b></div>
        {printTarget==='final'&&<div><span>Đã thu</span><b>{money(Number(receipt?.paid_amount??0))}</b></div>}
        {printTarget==='final'&&Number(receipt?.debt_amount??0)>0&&<div><span>Còn nợ</span><b>{money(Number(receipt?.debt_amount??0))}</b></div>}
      </div>

      {salePrint.show_qr&&((printTarget==='prepay'&&transferQR)||(printTarget==='final'&&receipt?.print_payment_mode==='transfer'&&receipt?.print_transfer_qr))&&<div className="receipt-qr">
        <div>
          <b>{printTarget==='prepay'?'QUÉT QR ĐỂ THANH TOÁN':'THANH TOÁN CHUYỂN KHOẢN'}</b>
          <span>{transferConfig?.bank_name} · {transferConfig?.account_no}</span>
          <span>{transferConfig?.account_name}</span>
          <strong>{money(printTarget==='prepay'?total:Number(receipt?.total_amount??0))}</strong>
          <small>Nội dung: {printTarget==='prepay'?transferDescription:receipt?.print_transfer_description}</small>
          {printTarget==='final'&&<em>ĐÃ GHI NHẬN THANH TOÁN</em>}
        </div>
        <img
          src={printTarget==='prepay'?transferQR:String(receipt?.print_transfer_qr??'')}
          alt="VietQR phiếu bán hàng"
        />
      </div>}

      {(printTarget==='prepay'?note:receipt?.print_note)&&<div className="receipt-note">
        <span>Ghi chú</span><b>{printTarget==='prepay'?note:receipt?.print_note}</b>
      </div>}
      {salePrint.footer_text&&<p>{salePrint.footer_text}</p>}
    </div>}

    <footer className="pos-shortcuts">
      <span><kbd>F2</kbd> Thanh toán</span>
      <span><kbd>F3</kbd> Giữ đơn</span>
      <span><kbd>F4</kbd> Tìm / quét SP</span>
      <span><kbd>F5</kbd> Gắn khách</span>
      <span><kbd>F7</kbd> Giảm giá</span>
      <span><kbd>F8</kbd> Xóa dòng cuối</span>
      <span><kbd>Esc</kbd> Đóng</span>
    </footer>
  </div>
}
