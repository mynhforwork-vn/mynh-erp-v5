'use client'

import { useEffect,useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cancelFinanceDocument,saveFinanceCategory,saveFinanceDocument,type FinanceTxType } from '@/lib/actions/finance'
import { formatDateTime,formatMoney } from '@/lib/format'
import { FinanceReferencePanel } from '@/components/finance-reference-panel'

type Category={
  id:string
  code:string
  name:string
  tx_type:FinanceTxType
  parent_id?:string|null
  sort_order:number
  is_active:boolean
  is_system:boolean
  note?:string|null
}
type Line={
  id?:string
  category_id:string
  description:string
  amount:number
  line_order?:number
  finance_categories?:Category|null
}
type Document={
  id:string
  document_code:string
  document_type:FinanceTxType
  document_status:'DRAFT'|'POSTED'|'CANCELLED'
  occurred_at:string
  counterparty_name?:string|null
  payment_method:'CASH'|'TRANSFER'|'COMBINED'
  cash_amount:number|string
  transfer_amount:number|string
  total_amount:number|string
  source_type:string
  source_id?:string|null
  note?:string|null
  posted_at?:string|null
  cancelled_at?:string|null
  cancellation_reason?:string|null
  finance_document_lines?:Line[]
}
type Transaction={
  id:string
  tx_type:FinanceTxType
  category:string
  category_id?:string|null
  amount:number|string
  reference_type?:string|null
  reference_id?:string|null
  transaction_at:string
  note?:string|null
  finance_document_id?:string|null
  payment_method?:'CASH'|'TRANSFER'|null
  status?:'POSTED'|'VOID'
  voided_at?:string|null
  void_reason?:string|null
}
type CustomerPaymentRef={
  id:string
  customer_id:string
  amount:number|string
  paid_at:string
  note?:string|null
  receipt_code?:string|null
  payment_method?:string|null
  cash_amount?:number|string|null
  transfer_amount?:number|string|null
  customers?:{id:string,name?:string|null,phone?:string|null,address?:string|null}|null
}
type CustomerPaymentAllocationRef={
  id:string
  customer_payment_id:string
  sale_id:string
  amount:number|string
  created_at?:string|null
}
type ShipperPaymentRef={
  id:string
  destination_hub?:string|null
  shipper_id?:string|null
  shipper_name?:string|null
  total_cod:number|string
  actual_transferred:number|string
  tip:number|string
  transferred_at:string
  note?:string|null
  destination_shippers?:{name?:string|null,phone?:string|null}|null
  warehouses?:{code?:string|null,name?:string|null}|null
  shipper_payment_details?:any[]
}
type FinanceReference={type:'CUSTOMER_PAYMENT'|'SHIPPER_PAYMENT'|'SALE'|'ORDER',id:string}

type DraftLine={key:string,category_id:string,description:string,amount:number}
type PanelMode='NONE'|'CREATE'|'DETAIL'|'CATEGORIES'|'BILL'
type DocumentTab='INFO'|'MONEY'
type DetailTab='INFO'|'REF'|'HISTORY'
type BillTab='READ'|'CATEGORY'
type Period='all'|'today'|'7d'|'month'|'custom'
type ColumnKey='time'|'code'|'type'|'category'|'content'|'counterparty'|'source'|'method'|'income'|'expense'|'status'
type SortDir='asc'|'desc'
const DEFAULT_COLUMNS:ColumnKey[]=['time','code','type','category','content','counterparty','source','method','income','expense','status']
const COLUMN_LABELS:Record<ColumnKey,string>={
  time:'Thời gian',code:'Mã phiếu',type:'Loại',category:'Hạng mục',content:'Nội dung',
  counterparty:'Đối tượng',source:'Nguồn',method:'Phương thức',income:'Tiền thu',expense:'Tiền chi',status:'Trạng thái'
}
const COLUMN_PREF_KEY='mynh-finance-columns-v1'

function num(value:any){
  const n=Number(value)
  return Number.isFinite(n)?n:0
}
function localInput(value?:string|null){
  const d=value?new Date(value):new Date()
  if(Number.isNaN(d.getTime()))return ''
  const copy=new Date(d.getTime()-d.getTimezoneOffset()*60000)
  return copy.toISOString().slice(0,16)
}
function key(){
  return 'f-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)
}
function typeLabel(type:FinanceTxType){return type==='INCOME'?'Thu':'Chi'}
function statusLabel(status?:string|null){
  if(status==='DRAFT')return 'Nháp'
  if(status==='CANCELLED'||status==='VOID')return 'Đã huỷ'
  return 'Đã ghi nhận'
}
function paymentLabel(method?:string|null){
  if(method==='CASH')return 'Tiền mặt'
  if(method==='TRANSFER')return 'Chuyển khoản'
  if(method==='COMBINED')return 'Kết hợp'
  return '—'
}
function periodMatch(value:string,period:Period,from:string,to:string){
  if(period==='all')return true
  const t=new Date(value).getTime()
  const now=new Date()
  if(period==='today'){
    const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()
    return t>=start
  }
  if(period==='7d')return t>=Date.now()-6*24*60*60*1000
  if(period==='month')return t>=new Date(now.getFullYear(),now.getMonth(),1).getTime()
  const ymd=new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})
  if(from&&ymd<from)return false
  if(to&&ymd>to)return false
  return true
}
function sourceLabel(source?:string|null,reference?:string|null){
  if(source==='MANUAL')return 'Nhập tay'
  if(source==='BANK_BILL')return 'Bill ngân hàng'
  if(source==='SHIPPER_SETTLEMENT')return 'Đối soát đơn nhập'
  if(source==='CUSTOMER_PAYMENT')return 'Công nợ khách hàng'
  if(source==='SALE'||reference==='SALE')return 'POS'
  if(source==='REFUND')return 'Hoàn tiền'
  if(source==='ADJUSTMENT')return 'Điều chỉnh'
  return source||reference||'Hệ thống'
}

export function FinanceCashflowWorkspace({
  categories,documents,transactions,customerPayments,customerPaymentAllocations,shipperPayments,referencedSales,canEdit,loadError,
}:{
  categories:Category[]
  documents:Document[]
  transactions:Transaction[]
  customerPayments:CustomerPaymentRef[]
  customerPaymentAllocations:CustomerPaymentAllocationRef[]
  shipperPayments:ShipperPaymentRef[]
  referencedSales:any[]
  canEdit:boolean
  loadError?:string|null
}){
  const router=useRouter()
  const [pending,startTransition]=useTransition()
  const [panel,setPanel]=useState<PanelMode>('NONE')
  const [documentTab,setDocumentTab]=useState<DocumentTab>('INFO')
  const [detailTab,setDetailTab]=useState<DetailTab>('INFO')
  const [billTab,setBillTab]=useState<BillTab>('READ')
  const [documentType,setDocumentType]=useState<FinanceTxType>('EXPENSE')
  const [editingId,setEditingId]=useState<string|null>(null)
  const [detailId,setDetailId]=useState<string|null>(null)
  const [legacyId,setLegacyId]=useState<string|null>(null)
  const [occurredAt,setOccurredAt]=useState(localInput())
  const [counterparty,setCounterparty]=useState('')
  const [paymentMethod,setPaymentMethod]=useState<'CASH'|'TRANSFER'|'COMBINED'>('CASH')
  const [cashAmount,setCashAmount]=useState(0)
  const [transferAmount,setTransferAmount]=useState(0)
  const [note,setNote]=useState('')
  const [lines,setLines]=useState<DraftLine[]>([{key:key(),category_id:'',description:'',amount:0}])
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [search,setSearch]=useState('')
  const [filterType,setFilterType]=useState<'ALL'|FinanceTxType>('ALL')
  const [filterStatus,setFilterStatus]=useState<'ALL'|'POSTED'|'DRAFT'|'CANCELLED'>('ALL')
  const [filterSource,setFilterSource]=useState('ALL')
  const [filterMethod,setFilterMethod]=useState('ALL')
  const [filterCategory,setFilterCategory]=useState('ALL')
  const [period,setPeriod]=useState<Period>('all')
  const [customFrom,setCustomFrom]=useState('')
  const [customTo,setCustomTo]=useState('')
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(10)
  const [sortKey,setSortKey]=useState<ColumnKey>('time')
  const [sortDir,setSortDir]=useState<SortDir>('desc')
  const [columnOrder,setColumnOrder]=useState<ColumnKey[]>(DEFAULT_COLUMNS)
  const [hiddenColumns,setHiddenColumns]=useState<ColumnKey[]>([])
  const [columnMenu,setColumnMenu]=useState(false)
  const [draggedColumn,setDraggedColumn]=useState<ColumnKey|null>(null)
  const [categorySearch,setCategorySearch]=useState('')
  const [categoryType,setCategoryType]=useState<FinanceTxType>('EXPENSE')
  const [categoryEditId,setCategoryEditId]=useState<string|null>(null)
  const [categoryName,setCategoryName]=useState('')
  const [categoryParent,setCategoryParent]=useState('')
  const [categoryNote,setCategoryNote]=useState('')
  const [billReading,setBillReading]=useState(false)
  const [billFileName,setBillFileName]=useState('')
  const [billPreview,setBillPreview]=useState('')
  const [billRawText,setBillRawText]=useState('')
  const [billAmount,setBillAmount]=useState(0)
  const [billOccurredAt,setBillOccurredAt]=useState(localInput())
  const [billCounterparty,setBillCounterparty]=useState('')
  const [billContent,setBillContent]=useState('')
  const [billBank,setBillBank]=useState('')
  const [billType,setBillType]=useState<FinanceTxType>('EXPENSE')
  const [billCategory,setBillCategory]=useState('')
  const [billError,setBillError]=useState('')
  const [printDocument,setPrintDocument]=useState<Document|null>(null)
  const [referenceStack,setReferenceStack]=useState<FinanceReference[]>([])

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(COLUMN_PREF_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed.order)&&parsed.order.length===DEFAULT_COLUMNS.length)setColumnOrder(parsed.order)
        if(Array.isArray(parsed.hidden))setHiddenColumns(parsed.hidden)
      }
    }catch{}
  },[])
  useEffect(()=>{
    try{localStorage.setItem(COLUMN_PREF_KEY,JSON.stringify({order:columnOrder,hidden:hiddenColumns}))}catch{}
  },[columnOrder,hiddenColumns])
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        if(referenceStack.length)setReferenceStack(prev=>prev.slice(0,-1))
        else setPanel('NONE')
        setColumnMenu(false)
      }
    }
    const onPointer=(event:MouseEvent)=>{if(!(event.target as HTMLElement).closest('.finance-column-manager-wrap'))setColumnMenu(false)}
    window.addEventListener('keydown',onKey)
    document.addEventListener('mousedown',onPointer)
    return ()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('mousedown',onPointer)}
  },[referenceStack.length])

  const categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories])
  const categoryCodeMap=useMemo(()=>new Map(categories.map(c=>[c.code,c])),[categories])
  const total=lines.reduce((sum,line)=>sum+Math.max(0,num(line.amount)),0)
  const detail=documents.find(d=>d.id===detailId)??null
  const legacy=transactions.find(t=>t.id===legacyId)??null
  const activeReference=referenceStack.length?referenceStack[referenceStack.length-1]:null
  const customerPaymentMap=useMemo(()=>new Map(customerPayments.map(row=>[String(row.id),row])),[customerPayments])
  const shipperPaymentMap=useMemo(()=>new Map(shipperPayments.map(row=>[String(row.id),row])),[shipperPayments])
  const referencedSaleMap=useMemo(()=>new Map(referencedSales.map(row=>[String(row.id),row])),[referencedSales])
  const allocationsByPayment=useMemo(()=>{
    const map=new Map<string,CustomerPaymentAllocationRef[]>()
    for(const row of customerPaymentAllocations){
      const key=String(row.customer_payment_id)
      const list=map.get(key)??[]
      list.push(row)
      map.set(key,list)
    }
    return map
  },[customerPaymentAllocations])
  const referencedOrderMap=useMemo(()=>{
    const map=new Map<string,any>()
    for(const payment of shipperPayments){
      for(const detail of payment.shipper_payment_details??[]){
        const order=detail.orders??null
        if(order?.id)map.set(String(order.id),{...order,cod_snapshot:detail.cod_snapshot,payment_id:payment.id})
      }
    }
    return map
  },[shipperPayments])
  const activeCustomerPayment=activeReference?.type==='CUSTOMER_PAYMENT'
    ? customerPaymentMap.get(activeReference.id)??null
    : null
  const activeShipperPayment=activeReference?.type==='SHIPPER_PAYMENT'
    ? shipperPaymentMap.get(activeReference.id)??null
    : null
  const activeReferencedSale=activeReference?.type==='SALE'
    ? referencedSaleMap.get(activeReference.id)??null
    : null
  const activeReferencedOrder=activeReference?.type==='ORDER'
    ? referencedOrderMap.get(activeReference.id)??null
    : null

  const activeTransactions=transactions.filter(t=>t.status!=='VOID')
  const periodTransactions=activeTransactions.filter(t=>periodMatch(t.transaction_at,period,customFrom,customTo))
  const periodDocuments=documents.filter(d=>periodMatch(d.occurred_at,period,customFrom,customTo))
  const totalIncome=periodTransactions.filter(t=>t.tx_type==='INCOME').reduce((sum,t)=>sum+num(t.amount),0)
  const totalExpense=periodTransactions.filter(t=>t.tx_type==='EXPENSE').reduce((sum,t)=>sum+num(t.amount),0)
  const incomeDocuments=periodDocuments.filter(d=>d.document_type==='INCOME'&&d.document_status!=='CANCELLED').length
  const expenseDocuments=periodDocuments.filter(d=>d.document_type==='EXPENSE'&&d.document_status!=='CANCELLED').length
  const pendingDocuments=periodDocuments.filter(d=>d.document_status==='DRAFT').length

  const rows=useMemo(()=>{
    const docRows=documents.map(doc=>{
      const docLines=doc.finance_document_lines??[]
      const names=[...new Set(docLines.map(line=>line.finance_categories?.name??categoryMap.get(line.category_id)?.name).filter(Boolean))]
      const content=docLines.length===1
        ? docLines[0].description
        : docLines.length
          ? String(docLines.length)+' hạng mục'
          : doc.note||'—'
      return {
        kind:'DOCUMENT' as const,
        id:doc.id,
        time:doc.occurred_at,
        code:doc.document_code,
        type:doc.document_type,
        category:names.length?names.join(', '):'—',
        categoryIds:docLines.map(line=>line.category_id),
        content,
        counterparty:doc.counterparty_name||'—',
        source:doc.note?.startsWith('[BILL]')?'Bill ngân hàng':sourceLabel(doc.source_type),
        method:doc.payment_method,
        amount:num(doc.total_amount),
        status:doc.document_status,
      }
    })
    const legacyRows=transactions
      .filter(tx=>!tx.finance_document_id)
      .map(tx=>{
        const cat=tx.category_id?categoryMap.get(tx.category_id):categoryCodeMap.get(tx.category)
        return {
          kind:'LEGACY' as const,
          id:tx.id,
          time:tx.transaction_at,
          code:tx.reference_type==='SALE'?'POS-'+String(tx.reference_id??tx.id).slice(0,8).toUpperCase():'TX-'+tx.id.slice(0,8).toUpperCase(),
          type:tx.tx_type,
          category:cat?.name??tx.category,
          categoryIds:tx.category_id?[tx.category_id]:[],
          content:tx.note||'Giao dịch hệ thống',
          counterparty:'—',
          source:sourceLabel(null,tx.reference_type),
          method:tx.payment_method??(tx.category==='SALE_CASH'?'CASH':tx.category==='SALE_TRANSFER'?'TRANSFER':null),
          amount:num(tx.amount),
          status:tx.status==='VOID'?'CANCELLED':'POSTED',
        }
      })
    return [...docRows,...legacyRows].sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime())
  },[documents,transactions,categoryMap,categoryCodeMap])

  const filteredRows=useMemo(()=>{
    const filtered=rows.filter(row=>{
      const q=search.trim().toLowerCase()
      if(!periodMatch(row.time,period,customFrom,customTo))return false
      if(filterType!=='ALL'&&row.type!==filterType)return false
      if(filterStatus!=='ALL'&&row.status!==filterStatus)return false
      if(filterSource!=='ALL'&&row.source!==filterSource)return false
      if(filterMethod!=='ALL'&&row.method!==filterMethod)return false
      if(filterCategory!=='ALL'&&!row.categoryIds.includes(filterCategory))return false
      if(q&&![row.code,row.category,row.content,row.counterparty,row.source].join(' ').toLowerCase().includes(q))return false
      return true
    })
    return filtered.sort((a,b)=>{
      const value=(row:any)=>{
        if(sortKey==='time')return new Date(row.time).getTime()
        if(sortKey==='code')return row.code
        if(sortKey==='type')return row.type
        if(sortKey==='category')return row.category
        if(sortKey==='content')return row.content
        if(sortKey==='counterparty')return row.counterparty
        if(sortKey==='source')return row.source
        if(sortKey==='method')return row.method??''
        if(sortKey==='income')return row.type==='INCOME'?row.amount:-1
        if(sortKey==='expense')return row.type==='EXPENSE'?row.amount:-1
        return row.status
      }
      const av=value(a),bv=value(b)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sortDir==='asc'?cmp:-cmp
    })
  },[rows,search,period,customFrom,customTo,filterType,filterStatus,filterSource,filterMethod,filterCategory,sortKey,sortDir])

  const maxPage=Math.max(1,Math.ceil(filteredRows.length/pageSize))
  const safePage=Math.min(page,maxPage)
  const pageRows=filteredRows.slice((safePage-1)*pageSize,safePage*pageSize)

  const sourceOptions=[...new Set(rows.map(r=>r.source).filter(Boolean))]
  const availableCategories=categories.filter(c=>c.tx_type===documentType&&c.is_active)
  const categoryRows=categories.filter(c=>c.tx_type===categoryType&&(!categorySearch.trim()||[c.name,c.code,c.note??''].join(' ').toLowerCase().includes(categorySearch.toLowerCase())))

  function setPeriodSafe(next:Period){setPeriod(next);setPage(1)}
  function changeSort(next:ColumnKey){
    if(sortKey===next)setSortDir(v=>v==='asc'?'desc':'asc')
    else{setSortKey(next);setSortDir('asc')}
    setPage(1)
  }
  function toggleColumn(key:ColumnKey){
    setHiddenColumns(prev=>{
      if(prev.includes(key))return prev.filter(x=>x!==key)
      const visible=columnOrder.filter(x=>!prev.includes(x))
      return visible.length<=1?prev:[...prev,key]
    })
  }
  function moveColumn(from:ColumnKey,to:ColumnKey){
    if(from===to)return
    setColumnOrder(prev=>{
      const next=[...prev],a=next.indexOf(from),b=next.indexOf(to)
      if(a<0||b<0)return prev
      next.splice(a,1);next.splice(b,0,from);return next
    })
  }
  function resetColumns(){setColumnOrder(DEFAULT_COLUMNS);setHiddenColumns([])}
  function clearFilters(){setSearch('');setFilterType('ALL');setFilterSource('ALL');setFilterMethod('ALL');setFilterStatus('ALL');setFilterCategory('ALL');setPage(1)}

  function printFinanceDocument(doc:Document){
    setPrintDocument(doc)
    window.setTimeout(()=>{
      const body=document.body
      body.classList.add('print-finance-document')
      const cleanup=()=>{
        body.classList.remove('print-finance-document')
        setPrintDocument(null)
      }
      window.addEventListener('afterprint',cleanup,{once:true})
      window.print()
      window.setTimeout(()=>{
        if(body.classList.contains('print-finance-document'))cleanup()
      },1500)
    },60)
  }

  function openBill(){
    setBillTab('READ');setBillReading(false);setBillFileName('');setBillPreview('');setBillRawText('');setBillAmount(0)
    setBillOccurredAt(localInput());setBillCounterparty('');setBillContent('');setBillBank('');setBillType('EXPENSE');setBillCategory('');setBillError('');setPanel('BILL')
  }
  function parseBillText(raw:string){
    const text=raw.replace(/\r/g,'');const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);const lower=text.toLowerCase()
    const banks=[['Techcombank','techcombank'],['Vietcombank','vietcombank'],['MB Bank','mbbank'],['BIDV','bidv'],['VietinBank','vietinbank'],['VPBank','vpbank'],['ACB','acb'],['TPBank','tpbank'],['Sacombank','sacombank']]
    const bank=banks.find(([,token])=>lower.includes(token))?.[0]??''
    let amount=0
    for(const line of lines){
      if(!/(số tiền|amount|giá trị giao dịch|thành tiền|vnd|vnđ|₫|\bđ\b)/i.test(line))continue
      for(const match of line.match(/[+-]?\s*\d[\d\s.,]{2,}/g)??[]){const n=Number(match.replace(/[^\d]/g,''));if(Number.isFinite(n)&&n>=1000&&n>amount)amount=n}
      if(amount)break
    }
    let occurred=localInput()
    const dm=text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+|\s*[,|-]\s*)(\d{1,2}):(\d{2})(?::\d{2})?\b/)
    if(dm){const [,d,m,y,h,mi]=dm;occurred=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${mi}`}
    const after=(labels:string[])=>{
      for(let i=0;i<lines.length;i++)for(const label of labels){const at=lines[i].toLowerCase().indexOf(label);if(at>=0){const same=lines[i].slice(at+label.length).replace(/^\s*[:\-]\s*/,'').trim();if(same)return same;if(lines[i+1])return lines[i+1]}}
      return ''
    }
    const counterparty=after(['người nhận','tên người nhận','người thụ hưởng','beneficiary','receiver'])
    const content=after(['nội dung chuyển tiền','nội dung giao dịch','nội dung','description'])
    const incoming=['tiền vào','nhận tiền','ghi có','credit','incoming transfer','đã nhận']
    const outgoing=['chuyển tiền thành công','người nhận','thụ hưởng','ghi nợ','debit','transfer successful']
    const type:FinanceTxType=incoming.some(x=>lower.includes(x))&&!outgoing.some(x=>lower.includes(x))?'INCOME':'EXPENSE'
    return {bank,amount,occurred,counterparty,content,type}
  }
  async function readBill(file:File){
    setBillReading(true);setBillError('');setBillFileName(file.name);setBillPreview(URL.createObjectURL(file))
    try{
      const {createWorker}=await import('tesseract.js');const worker=await createWorker('vie+eng');const result=await worker.recognize(file);await worker.terminate()
      const raw=result.data.text??'';const parsed=parseBillText(raw);setBillRawText(raw);setBillBank(parsed.bank);setBillAmount(parsed.amount);setBillOccurredAt(parsed.occurred);setBillCounterparty(parsed.counterparty);setBillContent(parsed.content);setBillType(parsed.type);setBillCategory('')
      if(parsed.amount)setBillTab('CATEGORY');else setBillError('Đã đọc bill nhưng chưa nhận diện chắc chắn số tiền.')
    }catch(error:any){setBillError('Không đọc được bill: '+String(error?.message??'OCR thất bại'))}finally{setBillReading(false)}
  }
  function saveBill(){
    setBillError('')
    if(!billAmount){setBillError('Chưa đọc được số tiền từ bill.');return}
    if(!billCategory){setBillError('Chọn Hạng mục trước khi ghi nhận.');return}
    startTransition(async()=>{
      const result=await saveFinanceDocument({
        document_type:billType,occurred_at:new Date(billOccurredAt).toISOString(),counterparty_name:billCounterparty||null,
        payment_method:'TRANSFER',cash_amount:0,transfer_amount:billAmount,note:'[BILL] '+(billBank?billBank+' · ':'')+(billContent||billFileName||'Giao dịch ngân hàng'),post:true,
        lines:[{category_id:billCategory,description:billContent||('Giao dịch ngân hàng'+(billBank?' · '+billBank:'')),amount:billAmount}],
      })
      if(!result.ok){setBillError(result.error);return}
      router.refresh();setPanel('NONE')
    })
  }

  function resetForm(type:FinanceTxType){
    setEditingId(null)
    setDocumentTab('INFO')
    setDocumentType(type)
    setOccurredAt(localInput())
    setCounterparty('')
    setPaymentMethod('CASH')
    setCashAmount(0)
    setTransferAmount(0)
    setNote('')
    setLines([{key:key(),category_id:'',description:'',amount:0}])
    setMessage('')
    setError('')
    setPanel('CREATE')
  }

  function editDraft(doc:Document){
    setEditingId(doc.id)
    setDocumentTab('INFO')
    setDocumentType(doc.document_type)
    setOccurredAt(localInput(doc.occurred_at))
    setCounterparty(doc.counterparty_name??'')
    setPaymentMethod(doc.payment_method)
    setCashAmount(num(doc.cash_amount))
    setTransferAmount(num(doc.transfer_amount))
    setNote(doc.note??'')
    setLines((doc.finance_document_lines??[]).sort((a,b)=>num(a.line_order)-num(b.line_order)).map(line=>({
      key:line.id??key(),
      category_id:line.category_id,
      description:line.description,
      amount:num(line.amount),
    })))
    setDetailId(null)
    setLegacyId(null)
    setError('')
    setMessage('')
    setPanel('CREATE')
  }

  function openRow(kind:'DOCUMENT'|'LEGACY',id:string){
    setError('')
    setMessage('')
    setReferenceStack([])
    setDetailTab('INFO')
    if(kind==='DOCUMENT'){
      setDetailId(id)
      setLegacyId(null)
    }else{
      setLegacyId(id)
      setDetailId(null)
    }
    setPanel('DETAIL')
  }

  function closePanel(){
    setReferenceStack([])
    setPanel('NONE')
  }

  function pushReference(type:FinanceReference['type'],id?:string|null){
    const value=String(id??'').trim()
    if(!value)return
    setReferenceStack(prev=>[...prev,{type,id:value}])
  }

  function openCurrentReference(){
    const source=detail?.source_type??legacy?.reference_type??''
    const id=detail?.source_id??legacy?.reference_id??null
    if(source==='CUSTOMER_PAYMENT')pushReference('CUSTOMER_PAYMENT',id)
    else if(source==='SHIPPER_SETTLEMENT'||source==='SHIPPER_PAYMENT')pushReference('SHIPPER_PAYMENT',id)
    else if(source==='SALE')pushReference('SALE',id)
  }

  function currentReferenceSupported(){
    const source=detail?.source_type??legacy?.reference_type??''
    return ['CUSTOMER_PAYMENT','SHIPPER_SETTLEMENT','SHIPPER_PAYMENT','SALE'].includes(source)
  }

  function updateLine(lineKey:string,patch:Partial<DraftLine>){
    setLines(prev=>prev.map(line=>line.key===lineKey?{...line,...patch}:line))
  }

  function submitDocument(post:boolean){
    setError('')
    setMessage('')
    if(!total){setError('Tổng phiếu phải lớn hơn 0');return}
    if(lines.some(line=>!line.category_id||!line.description.trim()||num(line.amount)<=0)){
      setError('Vui lòng nhập đủ Hạng mục, Nội dung và Số tiền cho từng dòng')
      return
    }
    if(paymentMethod==='COMBINED'&&Math.round(cashAmount+transferAmount)!==Math.round(total)){
      setError('Tổng Tiền mặt + Chuyển khoản phải bằng tổng phiếu')
      return
    }

    startTransition(async()=>{
      const result=await saveFinanceDocument({
        id:editingId,
        document_type:documentType,
        occurred_at:new Date(occurredAt).toISOString(),
        counterparty_name:counterparty||null,
        payment_method:paymentMethod,
        cash_amount:cashAmount,
        transfer_amount:transferAmount,
        note:note||null,
        post,
        lines:lines.map(line=>({
          category_id:line.category_id,
          description:line.description,
          amount:num(line.amount),
        })),
      })
      if(!result.ok){setError(result.error);return}
      setMessage(post?'Đã ghi nhận chứng từ':'Đã lưu phiếu nháp')
      router.refresh()
      setPanel('NONE')
    })
  }

  function cancelDoc(doc:Document){
    const reason=window.prompt('Nhập lý do huỷ '+doc.document_code)
    if(!reason?.trim())return
    setError('')
    startTransition(async()=>{
      const result=await cancelFinanceDocument(doc.id,reason)
      if(!result.ok){setError(result.error);return}
      router.refresh()
      setPanel('NONE')
    })
  }

  function resetCategoryForm(){
    setCategoryEditId(null)
    setCategoryName('')
    setCategoryParent('')
    setCategoryNote('')
  }

  function editCategory(cat:Category){
    setCategoryType(cat.tx_type)
    setCategoryEditId(cat.id)
    setCategoryName(cat.name)
    setCategoryParent(cat.parent_id??'')
    setCategoryNote(cat.note??'')
  }

  function submitCategory(active=true){
    if(!categoryName.trim()){setError('Chưa nhập tên hạng mục');return}
    startTransition(async()=>{
      const result=await saveFinanceCategory({
        id:categoryEditId,
        name:categoryName,
        tx_type:categoryType,
        parent_id:categoryParent||null,
        note:categoryNote||null,
        is_active:active,
      })
      if(!result.ok){setError(result.error);return}
      resetCategoryForm()
      router.refresh()
    })
  }

  function toggleCategory(cat:Category){
    if(cat.is_system)return
    startTransition(async()=>{
      const result=await saveFinanceCategory({
        id:cat.id,
        name:cat.name,
        tx_type:cat.tx_type,
        parent_id:cat.parent_id||null,
        note:cat.note||null,
        is_active:!cat.is_active,
      })
      if(!result.ok){setError(result.error);return}
      router.refresh()
    })
  }

  return <div className="finance-screen finance-live-workspace">
    <header className="page-head finance-page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Thu / Chi</h1>
        <p>Sổ giao dịch tài chính trung tâm · Phiếu thu, Phiếu chi và Hạng mục trong cùng một màn hình.</p>
      </div>
      <div className="head-actions">
        <button className="button" type="button" disabled={!canEdit} onClick={openBill}>Đọc bill ngân hàng</button>
        <button className="button" type="button" onClick={()=>{setCategorySearch('');setPanel('CATEGORIES');setError('');setMessage('')}}>Hạng mục</button>
        <button className="button" type="button" disabled={!canEdit} onClick={()=>resetForm('INCOME')}>+ Phiếu thu</button>
        <button className="button primary" type="button" disabled={!canEdit} onClick={()=>resetForm('EXPENSE')}>+ Phiếu chi</button>
      </div>
    </header>

    {loadError&&<div className="error-box finance-alert">{loadError}</div>}
    {error&&panel==='NONE'&&<div className="error-box finance-alert">{error}</div>}
    {message&&panel==='NONE'&&<div className="notice finance-success">{message}</div>}

    <div className="finance-period-tabs finance-period-controls">
      {([['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này'],['custom','Tùy chọn']] as [Period,string][]).map(([value,label])=><button key={value} type="button" className={period===value?'active-preview':''} onClick={()=>setPeriodSafe(value)}>{label}</button>)}
      {period==='custom'&&<div className="finance-custom-range"><input type="date" value={customFrom} onChange={e=>{setCustomFrom(e.target.value);setPage(1)}}/><span>→</span><input type="date" value={customTo} onChange={e=>{setCustomTo(e.target.value);setPage(1)}}/></div>}
    </div>
    <section className="finance-kpi-grid">
      <button type="button" className="finance-kpi" onClick={()=>{setFilterType('INCOME');setFilterStatus('ALL')}}>
        <span>Tổng thu</span><b className="income">{formatMoney(totalIncome)}</b><small>Dòng tiền đã ghi nhận</small>
      </button>
      <button type="button" className="finance-kpi" onClick={()=>{setFilterType('EXPENSE');setFilterStatus('ALL')}}>
        <span>Tổng chi</span><b className="expense">{formatMoney(totalExpense)}</b><small>Dòng tiền đã ghi nhận</small>
      </button>
      <button type="button" className="finance-kpi" onClick={()=>{setFilterType('ALL');setFilterStatus('POSTED')}}>
        <span>Dòng tiền ròng</span><b>{formatMoney(totalIncome-totalExpense)}</b><small>Thu − Chi</small>
      </button>
      <button type="button" className="finance-kpi" onClick={()=>{setFilterType('INCOME');setFilterStatus('ALL')}}>
        <span>Số phiếu thu</span><b>{incomeDocuments}</b><small>Phiếu thủ công / tự động</small>
      </button>
      <button type="button" className="finance-kpi" onClick={()=>{setFilterType('EXPENSE');setFilterStatus('ALL')}}>
        <span>Số phiếu chi</span><b>{expenseDocuments}</b><small>Phiếu thủ công / tự động</small>
      </button>
      <button type="button" className="finance-kpi warning" onClick={()=>{setFilterType('ALL');setFilterStatus('DRAFT')}}>
        <span>Chờ xử lý</span><b>{pendingDocuments}</b><small>Phiếu nháp chưa ghi nhận</small>
      </button>
    </section>

    <div className={'finance-ledger-layout '+(panel!=='NONE'?'with-panel':'')}>
    <section className="finance-ledger">
      <div className="finance-toolbar finance-toolbar-complete">
        <input className="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Tìm mã phiếu / nội dung / đối tượng..."/>
        <select value={filterType} onChange={e=>{setFilterType(e.target.value as any);setPage(1)}}><option value="ALL">Thu / Chi</option><option value="INCOME">Thu</option><option value="EXPENSE">Chi</option></select>
        <select value={filterCategory} onChange={e=>{setFilterCategory(e.target.value);setPage(1)}}><option value="ALL">Hạng mục</option>{categories.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={filterSource} onChange={e=>{setFilterSource(e.target.value);setPage(1)}}><option value="ALL">Nguồn</option>{sourceOptions.map(x=><option key={x} value={x}>{x}</option>)}</select>
        <select value={filterMethod} onChange={e=>{setFilterMethod(e.target.value);setPage(1)}}><option value="ALL">Phương thức</option><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="COMBINED">Kết hợp</option></select>
        <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value as any);setPage(1)}}><option value="ALL">Trạng thái</option><option value="POSTED">Đã ghi nhận</option><option value="DRAFT">Nháp</option><option value="CANCELLED">Đã huỷ</option></select>
        <button className="button small" type="button" onClick={clearFilters}>Xoá lọc</button>
        <div className="finance-column-manager-wrap">
          <button className={'button small finance-column-button '+(columnMenu?'active':'')} type="button" onClick={()=>setColumnMenu(!columnMenu)}>☷ Cột</button>
          {columnMenu&&<div className="finance-column-manager-menu" onClick={e=>e.stopPropagation()}>
            <div className="finance-column-menu-head"><div><b>Hiển thị & thứ tự cột</b><span>Kéo ⋮⋮ để sắp xếp</span></div><button type="button" onClick={resetColumns}>Đặt lại</button></div>
            <div className="finance-column-menu-list">{columnOrder.map(col=>{
              const hidden=hiddenColumns.includes(col)
              return <div className={'finance-column-menu-row '+(hidden?'hidden':'')} key={col} draggable onDragStart={()=>setDraggedColumn(col)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(draggedColumn)moveColumn(draggedColumn,col);setDraggedColumn(null)}} onDragEnd={()=>setDraggedColumn(null)}>
                <span className="finance-drag-handle">⋮⋮</span><label><input type="checkbox" checked={!hidden} onChange={()=>toggleColumn(col)}/><span>{COLUMN_LABELS[col]}</span></label>
              </div>
            })}</div>
          </div>}
        </div>
        <span className="toolbar-note">{filteredRows.length} giao dịch</span>
      </div>

      {(()=>{
        const visible=columnOrder.filter(col=>!hiddenColumns.includes(col))
        const head=(col:ColumnKey)=><th key={col}><button className="finance-sort-head" onClick={()=>changeSort(col)}>{COLUMN_LABELS[col]}{sortKey===col?<span>{sortDir==='asc'?'↑':'↓'}</span>:null}</button></th>
        const cell=(row:any,col:ColumnKey)=>{
          if(col==='time')return <td key={col}>{formatDateTime(row.time)}</td>
          if(col==='code')return <td key={col} className="strong finance-code">{row.code}</td>
          if(col==='type')return <td key={col}><span className={'finance-type '+(row.type==='INCOME'?'income':'expense')}>{typeLabel(row.type)}</span></td>
          if(col==='category')return <td key={col} className="finance-category-cell">{row.category}</td>
          if(col==='content')return <td key={col} className="truncate">{row.content}</td>
          if(col==='counterparty')return <td key={col}>{row.counterparty}</td>
          if(col==='source')return <td key={col}>{row.source}</td>
          if(col==='method')return <td key={col}>{paymentLabel(row.method)}</td>
          if(col==='income')return <td key={col} className="money finance-money income">{row.type==='INCOME'?formatMoney(row.amount):'—'}</td>
          if(col==='expense')return <td key={col} className="money finance-money expense">{row.type==='EXPENSE'?formatMoney(row.amount):'—'}</td>
          return <td key={col}><span className={'finance-status '+String(row.status).toLowerCase()}>{statusLabel(row.status)}</span></td>
        }
        return <div className="card table-card finance-table-card"><table className="table finance-table"><thead><tr>{visible.map(head)}</tr></thead><tbody>
          {!pageRows.length?<tr><td className="empty" colSpan={visible.length}>Chưa có giao dịch phù hợp.</td></tr>:pageRows.map(row=><tr key={row.kind+'-'+row.id} onClick={()=>openRow(row.kind,row.id)}>{visible.map(col=>cell(row,col))}</tr>)}
        </tbody></table></div>
      })()}
      <div className="finance-pagination"><span>Trang {safePage}/{maxPage}</span><div><button className="button small" disabled={safePage<=1} onClick={()=>setPage(safePage-1)}>‹</button><button className="button small" disabled={safePage>=maxPage} onClick={()=>setPage(safePage+1)}>›</button><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value={10}>10 dòng</option><option value={20}>20 dòng</option><option value={50}>50 dòng</option></select></div></div>
    </section>

    {panel!=='NONE'&&<aside className="detail-panel floating finance-panel">
      {panel==='CREATE'&&<>
        <div className="panel-head"><div><span className="eyebrow">{documentType==='INCOME'?'PHIẾU THU':'PHIẾU CHI'}</span><h2>{editingId?'Sửa phiếu nháp':documentType==='INCOME'?'Tạo Phiếu thu':'Tạo Phiếu chi'}</h2></div><button className="close" type="button" onClick={closePanel}>×</button></div>
        <div className="panel-tabs"><button className={documentTab==='INFO'?'active':''} onClick={()=>setDocumentTab('INFO')}>Thông tin</button><button className={documentTab==='MONEY'?'active':''} onClick={()=>setDocumentTab('MONEY')}>Chi tiết tiền <span className="panel-tab-count">{lines.length}</span></button></div>
        <div className="panel-scroll finance-form">
          {error&&<div className="error-box">{error}</div>}
          {documentTab==='INFO'&&<>
            <div className="form-grid"><label>Ngày {documentType==='INCOME'?'thu':'chi'}<input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label><label>Phương thức<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="COMBINED">Kết hợp</option></select></label></div>
            <label>{documentType==='INCOME'?'Người nộp':'Người nhận'}<input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Không bắt buộc"/></label>
            <label>Ghi chú<textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú chứng từ..."/></label>
            <div className="finance-panel-hint"><b>Bước tiếp theo</b><span>Chọn hạng mục và nhập số tiền tại tab Chi tiết tiền.</span><button className="button small" onClick={()=>setDocumentTab('MONEY')}>Mở Chi tiết tiền →</button></div>
          </>}
          {documentTab==='MONEY'&&<>
            <div className="finance-lines-head"><div><b>Chi tiết hạng mục</b><span>{lines.length} dòng</span></div><button className="mini-add" type="button" onClick={()=>setLines(prev=>[...prev,{key:key(),category_id:'',description:'',amount:0}])}>+ Thêm dòng</button></div>
            <div className="finance-lines">{lines.map((line,index)=><div className="finance-line-card" key={line.key}><div className="finance-line-number">#{index+1}</div><label>Hạng mục<select value={line.category_id} onChange={e=>updateLine(line.key,{category_id:e.target.value})}><option value="">Chọn hạng mục...</option>{availableCategories.map(cat=><option key={cat.id} value={cat.id}>{cat.parent_id?'↳ ':''}{cat.name}</option>)}</select></label><label>Nội dung<input value={line.description} onChange={e=>updateLine(line.key,{description:e.target.value})}/></label><label>Số tiền<input type="number" min="0" step="1000" value={line.amount||''} onChange={e=>updateLine(line.key,{amount:num(e.target.value)})}/></label>{lines.length>1&&<button className="finance-remove-line" type="button" onClick={()=>setLines(prev=>prev.filter(x=>x.key!==line.key))}>Xoá</button>}</div>)}</div>
            {paymentMethod==='COMBINED'&&<div className="finance-split-payment"><label>Tiền mặt<input type="number" min="0" value={cashAmount||''} onChange={e=>setCashAmount(num(e.target.value))}/></label><label>Chuyển khoản<input type="number" min="0" value={transferAmount||''} onChange={e=>setTransferAmount(num(e.target.value))}/></label></div>}
            <div className="finance-total"><span>Tổng phiếu</span><b>{formatMoney(total)}</b></div>
          </>}
          <div className="form-actions finance-form-actions"><button className="button" type="button" disabled={pending} onClick={()=>submitDocument(false)}>Lưu nháp</button><button className="button primary" type="button" disabled={pending} onClick={()=>submitDocument(true)}>{pending?'Đang lưu...':'Ghi nhận'}</button></div>
        </div>
      </>}

      {panel==='DETAIL'&&!activeReference&&<>
        <div className="panel-head">
          <div><span className="eyebrow">CHI TIẾT CHỨNG TỪ</span><h2>{detail?.document_code??(legacy?('TX-'+legacy.id.slice(0,8).toUpperCase()):'Giao dịch')}</h2></div>
          <button className="close" type="button" onClick={()=>setPanel('NONE')}>×</button>
        </div>
        <div className="panel-tabs"><button className={detailTab==='INFO'?'active':''} onClick={()=>setDetailTab('INFO')}>Thông tin</button><button className={detailTab==='REF'?'active':''} onClick={()=>setDetailTab('REF')}>Tham chiếu</button><button className={detailTab==='HISTORY'?'active':''} onClick={()=>setDetailTab('HISTORY')}>Lịch sử</button></div>
        <div className="panel-scroll">
          {error&&<div className="error-box">{error}</div>}
          {detail&&detailTab==='INFO'&&<>
            <div className="detail-grid">
              <div><span>Loại</span><b>{typeLabel(detail.document_type)}</b></div>
              <div><span>Trạng thái</span><b>{statusLabel(detail.document_status)}</b></div>
              <div><span>Thời gian</span><b>{formatDateTime(detail.occurred_at)}</b></div>
              <div><span>Phương thức</span><b>{paymentLabel(detail.payment_method)}</b></div>
              <div className="full"><span>{detail.document_type==='INCOME'?'Người nộp':'Người nhận'}</span><b>{detail.counterparty_name||'—'}</b></div>
              <div><span>Tiền mặt</span><b>{formatMoney(detail.cash_amount)}</b></div>
              <div><span>Chuyển khoản</span><b>{formatMoney(detail.transfer_amount)}</b></div>
              <div className="full"><span>Tổng phiếu</span><b>{formatMoney(detail.total_amount)}</b></div>
            </div>
            <h3>Chi tiết hạng mục</h3>
            <div className="finance-detail-lines">
              {(detail.finance_document_lines??[]).sort((a,b)=>num(a.line_order)-num(b.line_order)).map(line=><div key={line.id??line.description}>
                <span><b>{line.finance_categories?.name??categoryMap.get(line.category_id)?.name??'Hạng mục'}</b><small>{line.description}</small></span>
                <strong>{formatMoney(line.amount)}</strong>
              </div>)}
            </div>
            {detail.note&&<div className="finance-note"><span>Ghi chú</span><b>{detail.note}</b></div>}
            {detail.document_status==='CANCELLED'&&<div className="notice warning"><span>Đã huỷ: {detail.cancellation_reason||'Không có lý do'}</span></div>}
            <div className="panel-action-row finance-print-action">
              <button className="button" type="button" onClick={()=>printFinanceDocument(detail)}>
                {detail.document_status==='DRAFT'
                  ? 'In phiếu tạm'
                  : detail.document_status==='CANCELLED'
                    ? 'In phiếu đã hủy'
                    : detail.document_type==='INCOME'
                      ? 'In lại phiếu thu'
                      : 'In lại phiếu chi'}
              </button>
            </div>
            {canEdit&&detail.document_status==='DRAFT'&&<div className="panel-action-row"><button className="button primary" type="button" onClick={()=>editDraft(detail)}>Sửa phiếu nháp</button></div>}
            {canEdit&&detail.document_status!=='CANCELLED'&&<div className="panel-action-row"><button className="button finance-danger-button" type="button" onClick={()=>cancelDoc(detail)}>Huỷ phiếu</button></div>}
          </>}
          {detail&&detailTab==='REF'&&<>
            <div className="detail-grid">
              <div><span>Nguồn</span><b>{sourceLabel(detail.source_type)}</b></div>
              <div><span>Mã tham chiếu</span><b>{detail.source_id??'—'}</b></div>
              <div className="full"><span>Liên kết nghiệp vụ</span><b>{detail.source_type==='SHIPPER_SETTLEMENT'?'Đối soát Shipper':detail.source_type==='CUSTOMER_PAYMENT'?'Thu công nợ khách hàng':detail.note?.startsWith('[BILL]')?'Bill ngân hàng':'Chứng từ thủ công'}</b></div>
            </div>
            {currentReferenceSupported()&&<div className="panel-action-row finance-reference-open">
              <button className="button primary" type="button" onClick={openCurrentReference}>Mở chi tiết tại đây →</button>
            </div>}
          </>}
          {detail&&detailTab==='HISTORY'&&<div className="finance-history-list"><div><b>Tạo chứng từ</b><span>{formatDateTime(detail.occurred_at)}</span></div>{detail.posted_at&&<div><b>Ghi nhận vào sổ</b><span>{formatDateTime(detail.posted_at)}</span></div>}{detail.cancelled_at&&<div><b>Huỷ chứng từ</b><span>{formatDateTime(detail.cancelled_at)} · {detail.cancellation_reason||'—'}</span></div>}{detail.document_status==='DRAFT'&&<div><b>Trạng thái hiện tại</b><span>Đang chờ xử lý</span></div>}</div>}
          {legacy&&<>
            <div className="detail-grid">
              <div><span>Loại</span><b>{typeLabel(legacy.tx_type)}</b></div>
              <div><span>Trạng thái</span><b>{statusLabel(legacy.status)}</b></div>
              <div><span>Thời gian</span><b>{formatDateTime(legacy.transaction_at)}</b></div>
              <div><span>Phương thức</span><b>{paymentLabel(legacy.payment_method??(legacy.category==='SALE_CASH'?'CASH':legacy.category==='SALE_TRANSFER'?'TRANSFER':null))}</b></div>
              <div className="full"><span>Hạng mục</span><b>{categoryCodeMap.get(legacy.category)?.name??legacy.category}</b></div>
              <div className="full"><span>Số tiền</span><b>{formatMoney(legacy.amount)}</b></div>
              <div className="full"><span>Nguồn</span><b>{sourceLabel(null,legacy.reference_type)}</b></div>
            </div>
            {legacy.note&&<div className="finance-note"><span>Nội dung</span><b>{legacy.note}</b></div>}
            {currentReferenceSupported()&&<div className="panel-action-row finance-reference-open">
              <button className="button primary" type="button" onClick={openCurrentReference}>Mở chi tiết tại đây →</button>
            </div>}
            <div className="panel-meta">Giao dịch hệ thống cũ được giữ nguyên và đã đưa vào Sổ Thu / Chi.</div>
          </>}
        </div>
      </>}

      {panel==='DETAIL'&&activeReference&&<FinanceReferencePanel
        reference={activeReference}
        customerPayment={activeCustomerPayment}
        allocations={activeCustomerPayment?(allocationsByPayment.get(String(activeCustomerPayment.id))??[]):[]}
        shipperPayment={activeShipperPayment}
        sale={activeReferencedSale}
        order={activeReferencedOrder}
        saleMap={referencedSaleMap}
        canOperate={canEdit}
        onBack={()=>setReferenceStack(prev=>prev.slice(0,-1))}
        onClose={closePanel}
        onPush={(type,id)=>pushReference(type,id)}
      />}

      {panel==='BILL'&&<>
        <div className="panel-head"><div><span className="eyebrow">NGÂN HÀNG</span><h2>Đọc bill giao dịch</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
        <div className="panel-tabs"><button className={billTab==='READ'?'active':''} onClick={()=>setBillTab('READ')}>Đọc bill</button><button className={billTab==='CATEGORY'?'active':''} onClick={()=>setBillTab('CATEGORY')}>Gắn hạng mục {billAmount>0&&<span className="panel-tab-count">1</span>}</button></div>
        <div className="panel-scroll finance-bill-panel">
          {billError&&<div className="error-box">{billError}</div>}
          {billTab==='READ'&&<>
            <label className="finance-bill-upload"><input type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void readBill(file)}}/><b>{billReading?'Đang đọc bill...':'Chọn ảnh bill ngân hàng'}</b><span>PNG, JPG, ảnh chụp màn hình</span></label>
            {billPreview&&<div className="finance-bill-image"><img src={billPreview} alt="Bill ngân hàng"/></div>}
            {(billReading||billRawText)&&<div className="finance-bill-readout"><div className="finance-bill-status"><span>{billReading?'Đang nhận diện...':'Đã đọc bill'}</span><b>{billBank||'Ngân hàng chưa xác định'}</b></div>{!billReading&&<><div className="detail-grid"><div><span>Loại</span><b>{typeLabel(billType)}</b></div><div><span>Phương thức</span><b>Chuyển khoản</b></div><div><span>Thời gian</span><b>{formatDateTime(new Date(billOccurredAt).toISOString())}</b></div><div><span>Số tiền</span><b>{billAmount?formatMoney(billAmount):'Chưa nhận diện'}</b></div><div className="full"><span>Đối tượng</span><b>{billCounterparty||'Chưa nhận diện'}</b></div><div className="full"><span>Nội dung</span><b>{billContent||'Giao dịch ngân hàng'}</b></div></div><details className="finance-bill-raw"><summary>Xem văn bản OCR</summary><pre>{billRawText}</pre></details><div className="form-actions finance-form-actions"><button className="button primary" disabled={!billAmount} onClick={()=>setBillTab('CATEGORY')}>Tiếp tục: Gắn hạng mục →</button></div></>}</div>}
          </>}
          {billTab==='CATEGORY'&&<>
            {!billRawText?<div className="finance-panel-empty"><b>Chưa có bill</b><span>Quay lại Đọc bill và chọn ảnh giao dịch.</span><button className="button" onClick={()=>setBillTab('READ')}>← Đọc bill</button></div>:<>
              <div className="finance-bill-summary"><div><span>Số tiền</span><b>{formatMoney(billAmount)}</b></div><div><span>Đối tượng</span><b>{billCounterparty||'—'}</b></div><div><span>Ngân hàng</span><b>{billBank||'—'}</b></div></div>
              <div className="finance-bill-category"><label>Hạng mục<select value={billCategory} onChange={e=>setBillCategory(e.target.value)}><option value="">Chọn hạng mục...</option>{categories.filter(c=>c.tx_type===billType&&c.is_active).map(c=><option key={c.id} value={c.id}>{c.parent_id?'↳ ':''}{c.name}</option>)}</select></label><small>Thông tin bill đã đọc tự động. Chỉ cần gắn hạng mục trước khi ghi nhận.</small></div>
              <div className="form-actions finance-form-actions"><button className="button" onClick={()=>setBillTab('READ')}>← Kiểm tra bill</button><button className="button primary" disabled={pending} onClick={saveBill}>{pending?'Đang lưu...':'Gắn hạng mục & Ghi nhận'}</button></div>
            </>}
          </>}
        </div>
      </>}

      {panel==='CATEGORIES'&&<>
        <div className="panel-head">
          <div><span className="eyebrow">CẤU HÌNH TÀI CHÍNH</span><h2>Hạng mục Thu / Chi</h2></div>
          <button className="close" type="button" onClick={()=>setPanel('NONE')}>×</button>
        </div>
        <div className="panel-tabs">
          <button className={categoryType==='INCOME'?'active':''} type="button" onClick={()=>{setCategoryType('INCOME');resetCategoryForm()}}>Thu</button>
          <button className={categoryType==='EXPENSE'?'active':''} type="button" onClick={()=>{setCategoryType('EXPENSE');resetCategoryForm()}}>Chi</button>
        </div>
        <div className="panel-scroll finance-categories-panel">
          {error&&<div className="error-box">{error}</div>}
          <input className="search finance-category-search" value={categorySearch} onChange={e=>setCategorySearch(e.target.value)} placeholder="Tìm hạng mục..."/>
          {canEdit&&<div className="finance-category-form">
            <b>{categoryEditId?'Sửa hạng mục':'Thêm hạng mục'}</b>
            <label>Tên hạng mục<input value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="Ví dụ: Mua vật tư"/></label>
            <label>Nhóm cha
              <select value={categoryParent} onChange={e=>setCategoryParent(e.target.value)}>
                <option value="">Không có</option>
                {categoryRows.filter(c=>c.id!==categoryEditId).map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </label>
            <label>Ghi chú<textarea rows={2} value={categoryNote} onChange={e=>setCategoryNote(e.target.value)}/></label>
            <div className="form-actions">
              {categoryEditId&&<button className="button" type="button" onClick={resetCategoryForm}>Huỷ sửa</button>}
              <button className="button primary" type="button" disabled={pending} onClick={()=>submitCategory(true)}>Lưu hạng mục</button>
            </div>
          </div>}
          <div className="finance-category-list">
            {categoryRows.map(cat=>{
              const parent=cat.parent_id?categoryMap.get(cat.parent_id):null
              return <div className={'finance-category-row '+(!cat.is_active?'inactive':'')} key={cat.id}>
                <div>
                  <b>{cat.name}</b>
                  <span>{parent?'↳ '+parent.name:cat.code}{cat.is_system?' · Hệ thống':''}</span>
                </div>
                <div>
                  {canEdit&&<button className="button small" type="button" onClick={()=>editCategory(cat)}>Sửa</button>}
                  {canEdit&&!cat.is_system&&<button className="button small" type="button" onClick={()=>toggleCategory(cat)}>{cat.is_active?'Ngừng':'Bật'}</button>}
                </div>
              </div>
            })}
          </div>
        </div>
      </>}
    </aside>}

    {printDocument&&<section className="finance-document-print" aria-hidden="true">
      <header className="finance-document-print-head">
        <div><b>MYNH ERP</b><span>Sổ Thu / Chi</span></div>
        <div>
          <strong>{printDocument.document_type==='INCOME'?'PHIẾU THU':'PHIẾU CHI'}</strong>
          <small>{printDocument.document_code}</small>
        </div>
      </header>

      {printDocument.document_status==='DRAFT'&&<div className="finance-document-print-stamp draft">PHIẾU TẠM · CHƯA GHI NHẬN</div>}
      {printDocument.document_status==='CANCELLED'&&<div className="finance-document-print-stamp cancelled">ĐÃ HỦY{printDocument.cancellation_reason?' · '+printDocument.cancellation_reason:''}</div>}

      <div className="finance-document-print-meta">
        <div><span>Thời gian</span><b>{formatDateTime(printDocument.occurred_at)}</b></div>
        <div><span>Phương thức</span><b>{paymentLabel(printDocument.payment_method)}</b></div>
        <div className="full"><span>{printDocument.document_type==='INCOME'?'Người nộp':'Người nhận'}</span><b>{printDocument.counterparty_name||'—'}</b></div>
        <div><span>Tiền mặt</span><b>{formatMoney(printDocument.cash_amount)}</b></div>
        <div><span>Chuyển khoản</span><b>{formatMoney(printDocument.transfer_amount)}</b></div>
      </div>

      <div className="finance-document-print-total">
        <span>TỔNG {printDocument.document_type==='INCOME'?'THU':'CHI'}</span>
        <strong>{formatMoney(printDocument.total_amount)}</strong>
      </div>

      <div className="finance-document-print-title">Chi tiết hạng mục</div>
      <div className="finance-document-print-lines">
        {(printDocument.finance_document_lines??[])
          .slice()
          .sort((a,b)=>num(a.line_order)-num(b.line_order))
          .map((line,index)=><div key={line.id??line.description??index}>
            <span>
              <b>{line.finance_categories?.name??categoryMap.get(line.category_id)?.name??'Hạng mục'}</b>
              <small>{line.description||'—'}</small>
            </span>
            <strong>{formatMoney(line.amount)}</strong>
          </div>)}
      </div>

      {printDocument.note&&<div className="finance-document-print-note"><span>Ghi chú</span><b>{printDocument.note}</b></div>}

      <div className="finance-document-print-signatures">
        <div><b>{printDocument.document_type==='INCOME'?'Người nộp tiền':'Người nhận tiền'}</b><span>Ký / ghi rõ họ tên</span></div>
        <div><b>Người lập phiếu</b><span>Ký / ghi rõ họ tên</span></div>
      </div>

      <footer>
        {printDocument.document_status==='POSTED'
          ? 'Chứng từ đã ghi nhận trên MYNH ERP.'
          : printDocument.document_status==='DRAFT'
            ? 'Phiếu tạm chưa ghi nhận vào sổ.'
            : 'Chứng từ đã hủy; bản in chỉ dùng để đối chiếu.'}
      </footer>
    </section>}
    </div>
  </div>
}
