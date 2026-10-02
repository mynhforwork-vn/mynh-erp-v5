'use client'

import { useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelFinanceDocument,saveFinanceCategory,saveFinanceDocument,type FinanceTxType } from '@/lib/actions/finance'
import { formatDateTime,formatMoney } from '@/lib/format'

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
type DraftLine={key:string,category_id:string,description:string,amount:number}
type PanelMode='NONE'|'CREATE'|'DETAIL'|'CATEGORIES'

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
function sourceLabel(source?:string|null,reference?:string|null){
  if(source==='MANUAL')return 'Nhập tay'
  if(source==='SHIPPER_SETTLEMENT')return 'Đối soát đơn nhập'
  if(source==='CUSTOMER_PAYMENT')return 'Công nợ khách hàng'
  if(source==='SALE'||reference==='SALE')return 'POS'
  if(source==='REFUND')return 'Hoàn tiền'
  if(source==='ADJUSTMENT')return 'Điều chỉnh'
  return source||reference||'Hệ thống'
}

export function FinanceCashflowWorkspace({
  categories,documents,transactions,canEdit,loadError,
}:{
  categories:Category[]
  documents:Document[]
  transactions:Transaction[]
  canEdit:boolean
  loadError?:string|null
}){
  const router=useRouter()
  const [pending,startTransition]=useTransition()
  const [panel,setPanel]=useState<PanelMode>('NONE')
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
  const [categoryType,setCategoryType]=useState<FinanceTxType>('EXPENSE')
  const [categoryEditId,setCategoryEditId]=useState<string|null>(null)
  const [categoryName,setCategoryName]=useState('')
  const [categoryParent,setCategoryParent]=useState('')
  const [categoryNote,setCategoryNote]=useState('')

  const categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories])
  const categoryCodeMap=useMemo(()=>new Map(categories.map(c=>[c.code,c])),[categories])
  const total=lines.reduce((sum,line)=>sum+Math.max(0,num(line.amount)),0)
  const detail=documents.find(d=>d.id===detailId)??null
  const legacy=transactions.find(t=>t.id===legacyId)??null

  const activeTransactions=transactions.filter(t=>t.status!=='VOID')
  const totalIncome=activeTransactions.filter(t=>t.tx_type==='INCOME').reduce((s,t)=>s+num(t.amount),0)
  const totalExpense=activeTransactions.filter(t=>t.tx_type==='EXPENSE').reduce((s,t)=>s+num(t.amount),0)
  const incomeDocuments=documents.filter(d=>d.document_type==='INCOME'&&d.document_status!=='CANCELLED').length
  const expenseDocuments=documents.filter(d=>d.document_type==='EXPENSE'&&d.document_status!=='CANCELLED').length
  const pendingDocuments=documents.filter(d=>d.document_status==='DRAFT').length

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
        content,
        counterparty:doc.counterparty_name||'—',
        source:sourceLabel(doc.source_type),
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

  const filteredRows=rows.filter(row=>{
    const q=search.trim().toLowerCase()
    if(filterType!=='ALL'&&row.type!==filterType)return false
    if(filterStatus!=='ALL'&&row.status!==filterStatus)return false
    if(filterSource!=='ALL'&&row.source!==filterSource)return false
    if(filterMethod!=='ALL'&&row.method!==filterMethod)return false
    if(q&&![
      row.code,row.category,row.content,row.counterparty,row.source,
    ].join(' ').toLowerCase().includes(q))return false
    return true
  })

  const sourceOptions=[...new Set(rows.map(r=>r.source).filter(Boolean))]
  const availableCategories=categories.filter(c=>c.tx_type===documentType&&c.is_active)
  const categoryRows=categories.filter(c=>c.tx_type===categoryType)

  function resetForm(type:FinanceTxType){
    setEditingId(null)
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
    if(kind==='DOCUMENT'){
      setDetailId(id)
      setLegacyId(null)
    }else{
      setLegacyId(id)
      setDetailId(null)
    }
    setPanel('DETAIL')
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

  return <div className="finance-screen">
    <header className="page-head finance-page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Thu / Chi</h1>
        <p>Sổ giao dịch tài chính trung tâm · Phiếu thu, Phiếu chi và Hạng mục trong cùng một màn hình.</p>
      </div>
      <div className="head-actions">
        <button className="button" type="button" onClick={()=>{setPanel('CATEGORIES');setError('');setMessage('')}}>Hạng mục</button>
        <button className="button" type="button" disabled={!canEdit} onClick={()=>resetForm('INCOME')}>+ Phiếu thu</button>
        <button className="button primary" type="button" disabled={!canEdit} onClick={()=>resetForm('EXPENSE')}>+ Phiếu chi</button>
      </div>
    </header>

    {loadError&&<div className="error-box finance-alert">{loadError}</div>}
    {error&&panel==='NONE'&&<div className="error-box finance-alert">{error}</div>}
    {message&&panel==='NONE'&&<div className="notice finance-success">{message}</div>}

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

    <section className="finance-ledger">
      <div className="finance-toolbar">
        <input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm mã phiếu / nội dung / đối tượng..."/>
        <select value={filterType} onChange={e=>setFilterType(e.target.value as any)}>
          <option value="ALL">Thu / Chi</option>
          <option value="INCOME">Thu</option>
          <option value="EXPENSE">Chi</option>
        </select>
        <select value={filterSource} onChange={e=>setFilterSource(e.target.value)}>
          <option value="ALL">Nguồn</option>
          {sourceOptions.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <select value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}>
          <option value="ALL">Phương thức</option>
          <option value="CASH">Tiền mặt</option>
          <option value="TRANSFER">Chuyển khoản</option>
          <option value="COMBINED">Kết hợp</option>
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)}>
          <option value="ALL">Trạng thái</option>
          <option value="POSTED">Đã ghi nhận</option>
          <option value="DRAFT">Nháp</option>
          <option value="CANCELLED">Đã huỷ</option>
        </select>
        <button className="button small" type="button" onClick={()=>{setSearch('');setFilterType('ALL');setFilterSource('ALL');setFilterMethod('ALL');setFilterStatus('ALL')}}>Xoá lọc</button>
        <span className="toolbar-note">{filteredRows.length} giao dịch</span>
      </div>

      <div className="card table-card finance-table-card">
        <table className="table finance-table">
          <thead><tr>
            <th>Thời gian</th><th>Mã phiếu</th><th>Loại</th><th>Hạng mục</th><th>Nội dung</th>
            <th>Đối tượng</th><th>Nguồn</th><th>Phương thức</th><th>Tiền thu</th><th>Tiền chi</th><th>Trạng thái</th>
          </tr></thead>
          <tbody>
            {!filteredRows.length
              ? <tr><td className="empty" colSpan={11}>Chưa có giao dịch phù hợp.</td></tr>
              : filteredRows.map(row=><tr key={row.kind+'-'+row.id} onClick={()=>openRow(row.kind,row.id)}>
                <td>{formatDateTime(row.time)}</td>
                <td className="strong finance-code">{row.code}</td>
                <td><span className={'finance-type '+(row.type==='INCOME'?'income':'expense')}>{typeLabel(row.type)}</span></td>
                <td className="finance-category-cell">{row.category}</td>
                <td className="truncate">{row.content}</td>
                <td>{row.counterparty}</td>
                <td>{row.source}</td>
                <td>{paymentLabel(row.method)}</td>
                <td className="money finance-money income">{row.type==='INCOME'?formatMoney(row.amount):'—'}</td>
                <td className="money finance-money expense">{row.type==='EXPENSE'?formatMoney(row.amount):'—'}</td>
                <td><span className={'finance-status '+String(row.status).toLowerCase()}>{statusLabel(row.status)}</span></td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {panel!=='NONE'&&<aside className="detail-panel floating finance-panel">
      {panel==='CREATE'&&<>
        <div className="panel-head">
          <div><span className="eyebrow">{documentType==='INCOME'?'PHIẾU THU':'PHIẾU CHI'}</span><h2>{editingId?'Sửa phiếu nháp':documentType==='INCOME'?'Tạo Phiếu thu':'Tạo Phiếu chi'}</h2></div>
          <button className="close" type="button" onClick={()=>setPanel('NONE')}>×</button>
        </div>
        <div className="panel-tabs"><span className="active">Thông tin</span><span>Chi tiết tiền</span></div>
        <div className="panel-scroll finance-form">
          {error&&<div className="error-box">{error}</div>}
          <div className="form-grid">
            <label>Ngày {documentType==='INCOME'?'thu':'chi'}
              <input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/>
            </label>
            <label>Phương thức
              <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)}>
                <option value="CASH">Tiền mặt</option>
                <option value="TRANSFER">Chuyển khoản</option>
                <option value="COMBINED">Kết hợp</option>
              </select>
            </label>
          </div>
          <label>{documentType==='INCOME'?'Người nộp':'Người nhận'}
            <input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Không bắt buộc"/>
          </label>

          <div className="finance-lines-head">
            <div><b>Chi tiết hạng mục</b><span>{lines.length} dòng</span></div>
            <button className="mini-add" type="button" onClick={()=>setLines(prev=>[...prev,{key:key(),category_id:'',description:'',amount:0}])}>+ Thêm dòng</button>
          </div>

          <div className="finance-lines">
            {lines.map((line,index)=><div className="finance-line-card" key={line.key}>
              <div className="finance-line-number">#{index+1}</div>
              <label>Hạng mục
                <select value={line.category_id} onChange={e=>updateLine(line.key,{category_id:e.target.value})}>
                  <option value="">Chọn hạng mục...</option>
                  {availableCategories.map(cat=><option key={cat.id} value={cat.id}>
                    {cat.parent_id?'↳ ':''}{cat.name}
                  </option>)}
                </select>
              </label>
              <label>Nội dung
                <input value={line.description} onChange={e=>updateLine(line.key,{description:e.target.value})} placeholder="Nội dung thu / chi"/>
              </label>
              <label>Số tiền
                <input type="number" min="0" step="1000" value={line.amount||''} onChange={e=>updateLine(line.key,{amount:num(e.target.value)})}/>
              </label>
              {lines.length>1&&<button className="finance-remove-line" type="button" onClick={()=>setLines(prev=>prev.filter(x=>x.key!==line.key))}>Xoá</button>}
            </div>)}
          </div>

          {paymentMethod==='COMBINED'&&<div className="finance-split-payment">
            <label>Tiền mặt<input type="number" min="0" value={cashAmount||''} onChange={e=>setCashAmount(num(e.target.value))}/></label>
            <label>Chuyển khoản<input type="number" min="0" value={transferAmount||''} onChange={e=>setTransferAmount(num(e.target.value))}/></label>
          </div>}

          <div className="finance-total">
            <span>Tổng phiếu</span><b>{formatMoney(total)}</b>
          </div>

          <label>Ghi chú
            <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú chứng từ..."/>
          </label>

          <div className="form-actions finance-form-actions">
            <button className="button" type="button" disabled={pending} onClick={()=>submitDocument(false)}>Lưu nháp</button>
            <button className="button primary" type="button" disabled={pending} onClick={()=>submitDocument(true)}>{pending?'Đang lưu...':'Ghi nhận'}</button>
          </div>
        </div>
      </>}

      {panel==='DETAIL'&&<>
        <div className="panel-head">
          <div><span className="eyebrow">CHI TIẾT CHỨNG TỪ</span><h2>{detail?.document_code??(legacy?('TX-'+legacy.id.slice(0,8).toUpperCase()):'Giao dịch')}</h2></div>
          <button className="close" type="button" onClick={()=>setPanel('NONE')}>×</button>
        </div>
        <div className="panel-tabs"><span className="active">Thông tin</span><span>Tham chiếu</span><span>Lịch sử</span></div>
        <div className="panel-scroll">
          {error&&<div className="error-box">{error}</div>}
          {detail&&<>
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
            {canEdit&&detail.document_status==='DRAFT'&&<div className="panel-action-row"><button className="button primary" type="button" onClick={()=>editDraft(detail)}>Sửa phiếu nháp</button></div>}
            {canEdit&&detail.document_status!=='CANCELLED'&&<div className="panel-action-row"><button className="button finance-danger-button" type="button" onClick={()=>cancelDoc(detail)}>Huỷ phiếu</button></div>}
          </>}
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
            <div className="panel-meta">Giao dịch hệ thống cũ được giữ nguyên và đã đưa vào Sổ Thu / Chi.</div>
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
  </div>
}
