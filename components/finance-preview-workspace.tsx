'use client'

import { useEffect,useMemo,useState } from 'react'

type Tab='overview'|'cashflow'|'settlement'|'reports'
type TxType='INCOME'|'EXPENSE'
type Payment='CASH'|'TRANSFER'|'COMBINED'
type DocStatus='DRAFT'|'POSTED'|'CANCELLED'

type Category={
  id:string
  name:string
  txType:TxType
  parentId:string|null
  active:boolean
  system?:boolean
}
type Line={id:string,categoryId:string,description:string,amount:number}
type DocumentRow={
  id:string
  code:string
  type:TxType
  status:DocStatus
  occurredAt:string
  counterparty:string
  payment:Payment
  cashAmount:number
  transferAmount:number
  note:string
  source:string
  lines:Line[]
}
type DraftLine={id:string,categoryId:string,description:string,amount:string}

const STORE_KEY='mynh-finance-preview-v2'
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' ₫'
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)
const nowInput=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
const labelType=(t:TxType)=>t==='INCOME'?'Thu':'Chi'
const labelPayment=(m:Payment)=>m==='CASH'?'Tiền mặt':m==='TRANSFER'?'Chuyển khoản':'Kết hợp'
const labelStatus=(s:DocStatus)=>s==='DRAFT'?'Nháp':s==='CANCELLED'?'Đã huỷ':'Đã ghi nhận'

const defaultCategories:Category[]=[
  {id:'sales',name:'Bán hàng',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'debt',name:'Thu công nợ',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'refund-in',name:'Hoàn ứng / Thu hồi',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'other-in',name:'Thu khác',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'purchase',name:'Thanh toán đơn nhập',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'transport',name:'Vận chuyển',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'tip',name:'Tip Shipper',txType:'EXPENSE',parentId:'transport',active:true,system:true},
  {id:'shipping',name:'Phí vận chuyển',txType:'EXPENSE',parentId:'transport',active:true,system:true},
  {id:'packaging',name:'Đóng gói',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'warehouse',name:'Kho',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'marketing',name:'Marketing',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'software',name:'Phần mềm',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'personnel',name:'Nhân sự',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'utilities',name:'Điện nước',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'office',name:'Văn phòng',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'customer-refund',name:'Hoàn tiền khách',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'other-expense',name:'Chi khác',txType:'EXPENSE',parentId:null,active:true,system:true},
]

const seedDocs:DocumentRow[]=[
  {
    id:'seed-pos-1',code:'POS-261001-000010',type:'INCOME',status:'POSTED',
    occurredAt:'2026-10-01T15:20',counterparty:'Khách lẻ',payment:'TRANSFER',
    cashAmount:0,transferAmount:698000,note:'Thanh toán POS',source:'POS',
    lines:[{id:'l1',categoryId:'sales',description:'Thanh toán POS',amount:698000}],
  },
  {
    id:'seed-pos-2',code:'POS-261001-000008',type:'INCOME',status:'POSTED',
    occurredAt:'2026-10-01T15:06',counterparty:'Khách lẻ',payment:'CASH',
    cashAmount:289000,transferAmount:0,note:'Thanh toán POS',source:'POS',
    lines:[{id:'l2',categoryId:'sales',description:'Thanh toán POS',amount:289000}],
  },
  {
    id:'seed-shipper',code:'PC-261002-000019',type:'EXPENSE',status:'POSTED',
    occurredAt:'2026-10-02T11:05',counterparty:'Shipper HN',payment:'TRANSFER',
    cashAmount:0,transferAmount:2050000,note:'Đối soát 4 đơn',source:'Đối soát',
    lines:[
      {id:'l3',categoryId:'purchase',description:'Thanh toán COD đơn nhập',amount:2000000},
      {id:'l4',categoryId:'tip',description:'Tip Shipper',amount:50000},
    ],
  },
]

const navGroups=[
  ['TỔNG QUAN',['Tổng quan hệ thống']],
  ['MUA HÀNG',['Tổng quan mua hàng','Tài khoản mua hàng','Đơn nhập hàng','Cảnh báo vận chuyển']],
  ['VẬN HÀNH KHO',['Tổng quan kho','Nhập kho','Tồn kho','Lịch sử kho']],
  ['BÁN HÀNG',['Tổng quan bán hàng','POS','Lịch sử bán','Khách hàng','Công nợ']],
] as const

export function FinancePreviewWorkspace(){
  const [tab,setTab]=useState<Tab>('overview')
  const [categories,setCategories]=useState<Category[]>(defaultCategories)
  const [docs,setDocs]=useState<DocumentRow[]>(seedDocs)
  const [hydrated,setHydrated]=useState(false)
  const [panel,setPanel]=useState<'NONE'|'DOCUMENT'|'CATEGORIES'|'DETAIL'>('NONE')
  const [detailId,setDetailId]=useState<string|null>(null)
  const [docType,setDocType]=useState<TxType>('EXPENSE')
  const [occurredAt,setOccurredAt]=useState(nowInput())
  const [counterparty,setCounterparty]=useState('')
  const [payment,setPayment]=useState<Payment>('CASH')
  const [cashAmount,setCashAmount]=useState('')
  const [transferAmount,setTransferAmount]=useState('')
  const [note,setNote]=useState('')
  const [draftLines,setDraftLines]=useState<DraftLine[]>([{id:uid(),categoryId:'',description:'',amount:''}])
  const [formError,setFormError]=useState('')
  const [catType,setCatType]=useState<TxType>('EXPENSE')
  const [catName,setCatName]=useState('')
  const [catParent,setCatParent]=useState('')

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORE_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed.categories))setCategories(parsed.categories)
        if(Array.isArray(parsed.docs))setDocs(parsed.docs)
      }
    }catch{}
    setHydrated(true)
  },[])

  useEffect(()=>{
    if(!hydrated)return
    localStorage.setItem(STORE_KEY,JSON.stringify({categories,docs}))
  },[hydrated,categories,docs])

  const categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories])
  const postedDocs=docs.filter(d=>d.status==='POSTED')
  const income=postedDocs.filter(d=>d.type==='INCOME').reduce((s,d)=>s+d.lines.reduce((a,l)=>a+l.amount,0),0)
  const expense=postedDocs.filter(d=>d.type==='EXPENSE').reduce((s,d)=>s+d.lines.reduce((a,l)=>a+l.amount,0),0)
  const draftCount=docs.filter(d=>d.status==='DRAFT').length
  const selectedDetail=docs.find(d=>d.id===detailId)??null

  const rows=[...docs].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime())
  const activeCategories=categories.filter(c=>c.txType===docType&&c.active)

  function resetDocument(type:TxType){
    setDocType(type)
    setOccurredAt(nowInput())
    setCounterparty('')
    setPayment('CASH')
    setCashAmount('')
    setTransferAmount('')
    setNote('')
    setDraftLines([{id:uid(),categoryId:'',description:'',amount:''}])
    setFormError('')
    setPanel('DOCUMENT')
  }

  function addLine(){
    setDraftLines(v=>[...v,{id:uid(),categoryId:'',description:'',amount:''}])
  }
  function patchLine(id:string,patch:Partial<DraftLine>){
    setDraftLines(v=>v.map(x=>x.id===id?{...x,...patch}:x))
  }
  function removeLine(id:string){
    setDraftLines(v=>v.length===1?v:v.filter(x=>x.id!==id))
  }

  function submitDocument(status:'DRAFT'|'POSTED'){
    setFormError('')
    const lines=draftLines.map(x=>({
      id:uid(),
      categoryId:x.categoryId,
      description:x.description.trim(),
      amount:Number(x.amount),
    }))
    if(lines.some(x=>!x.categoryId||!x.description||!Number.isFinite(x.amount)||x.amount<=0)){
      setFormError('Nhập đủ Hạng mục, Nội dung và Số tiền cho từng dòng.')
      return
    }
    const total=lines.reduce((s,x)=>s+x.amount,0)
    let cash=0,transfer=0
    if(payment==='CASH')cash=total
    else if(payment==='TRANSFER')transfer=total
    else{
      cash=Number(cashAmount)
      transfer=Number(transferAmount)
      if(!Number.isFinite(cash)||!Number.isFinite(transfer)||cash<=0||transfer<=0||Math.round(cash+transfer)!==Math.round(total)){
        setFormError('Với Kết hợp, Tiền mặt + Chuyển khoản phải bằng Tổng phiếu.')
        return
      }
    }
    const prefix=docType==='INCOME'?'PT':'PC'
    const code=prefix+'-'+new Date(occurredAt).toISOString().slice(2,10).replaceAll('-','')+'-'+String(docs.length+1).padStart(6,'0')
    setDocs(v=>[...v,{
      id:uid(),code,type:docType,status,occurredAt,counterparty:counterparty.trim(),
      payment,cashAmount:cash,transferAmount:transfer,note:note.trim(),source:'Nhập tay',lines,
    }])
    setPanel('NONE')
  }

  function addCategory(){
    const name=catName.trim()
    if(!name)return
    setCategories(v=>[...v,{id:uid(),name,txType:catType,parentId:catParent||null,active:true}])
    setCatName('')
    setCatParent('')
  }
  function toggleCategory(id:string){
    setCategories(v=>v.map(c=>c.id===id&&!c.system?{...c,active:!c.active}:c))
  }
  function resetPreview(){
    localStorage.removeItem(STORE_KEY)
    setCategories(defaultCategories)
    setDocs(seedDocs)
    setPanel('NONE')
  }
  function cancelDocument(id:string){
    setDocs(v=>v.map(d=>d.id===id?{...d,status:'CANCELLED'}:d))
    setPanel('NONE')
  }

  return <div className="shell finance-preview-old-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark small">M</span><span><b>MYNH ERP</b><small>HỆ THỐNG VẬN HÀNH</small></span></div>
      <nav className="nav">
        {navGroups.map(([group,items])=><section className="nav-group" key={group}>
          <div className="nav-section-label">{group}</div>
          <div className="nav-group-items">{items.map(label=><a key={label} href="#" onClick={e=>e.preventDefault()}><span className="nav-icon">·</span><span>{label}</span></a>)}</div>
        </section>)}
        <section className="nav-group">
          <div className="nav-section-label">TÀI CHÍNH</div>
          <div className="nav-group-items">
            <a href="#" className={tab==='overview'?'active':''} onClick={e=>{e.preventDefault();setTab('overview')}}><span className="nav-icon">₫</span><span>Tổng quan tài chính</span></a>
            <a href="#" className={tab==='cashflow'?'active':''} onClick={e=>{e.preventDefault();setTab('cashflow')}}><span className="nav-icon">↕</span><span>Thu / Chi</span></a>
            <a href="#" className={tab==='settlement'?'active':''} onClick={e=>{e.preventDefault();setTab('settlement')}}><span className="nav-icon">✓</span><span>Đối soát & Thanh toán</span></a>
            <a href="#" className={tab==='reports'?'active':''} onClick={e=>{e.preventDefault();setTab('reports')}}><span className="nav-icon">▥</span><span>Báo cáo tài chính</span></a>
          </div>
        </section>
        <section className="nav-group"><div className="nav-section-label">HỆ THỐNG</div><div className="nav-group-items"><a href="#" onClick={e=>e.preventDefault()}><span className="nav-icon">⚙</span><span>Cài đặt hệ thống</span></a></div></section>
      </nav>
      <div className="sidebar-foot">
        <div className="account"><b>Finance Preview</b><span>Không ghi dữ liệu production</span></div>
        <button className="button ghost" type="button" onClick={resetPreview}>Đặt lại dữ liệu Preview</button>
      </div>
    </aside>

    <main className="main finance-preview-main-old">
      <div className="finance-preview-banner"><b>Cloudflare Preview</b><span>Tương tác thật trong trình duyệt · không ghi Supabase production</span></div>
      {tab==='overview'&&<Overview docs={docs} income={income} expense={expense}/>}
      {tab==='cashflow'&&<Cashflow docs={rows} categories={categoryMap} income={income} expense={expense} draftCount={draftCount} onCreate={resetDocument} onCategories={()=>{setFormError('');setPanel('CATEGORIES')}} onDetail={id=>{setDetailId(id);setPanel('DETAIL')}}/>}
      {tab==='settlement'&&<Settlement/>}
      {tab==='reports'&&<Reports income={income} expense={expense} docs={postedDocs} categories={categoryMap}/>}
    </main>

    {panel!=='NONE'&&<div className="finance-preview-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setPanel('NONE')}}>
      <aside className="detail-panel floating finance-panel finance-preview-panel">
        {panel==='DOCUMENT'&&<>
          <div className="panel-head"><div><span className="eyebrow">{docType==='INCOME'?'PHIẾU THU':'PHIẾU CHI'}</span><h2>{docType==='INCOME'?'Tạo Phiếu thu':'Tạo Phiếu chi'}</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
          <div className="panel-tabs"><span className="active">Thông tin</span><span>Chi tiết tiền</span></div>
          <div className="panel-scroll finance-form">
            {formError&&<div className="error-box">{formError}</div>}
            <div className="form-grid">
              <label>Ngày {docType==='INCOME'?'thu':'chi'}<input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label>
              <label>Phương thức<select value={payment} onChange={e=>setPayment(e.target.value as Payment)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="COMBINED">Kết hợp</option></select></label>
            </div>
            <label>{docType==='INCOME'?'Người nộp':'Người nhận'}<input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Không bắt buộc"/></label>
            <div className="finance-lines-head"><div><b>Chi tiết hạng mục</b><span>{draftLines.length} dòng</span></div><button className="mini-add" type="button" onClick={addLine}>+ Thêm dòng</button></div>
            <div className="finance-lines">
              {draftLines.map((line,index)=><div className="finance-line-card" key={line.id}>
                <div className="finance-line-number">#{index+1}</div>
                <label>Hạng mục<select value={line.categoryId} onChange={e=>patchLine(line.id,{categoryId:e.target.value})}><option value="">Chọn hạng mục...</option>{activeCategories.map(c=><option key={c.id} value={c.id}>{c.parentId?'↳ ':''}{c.name}</option>)}</select></label>
                <label>Nội dung<input value={line.description} onChange={e=>patchLine(line.id,{description:e.target.value})} placeholder="Nội dung thu / chi"/></label>
                <label>Số tiền<input type="number" min="0" step="1000" value={line.amount} onChange={e=>patchLine(line.id,{amount:e.target.value})}/></label>
                {draftLines.length>1&&<button className="finance-remove-line" type="button" onClick={()=>removeLine(line.id)}>Xoá</button>}
              </div>)}
            </div>
            {payment==='COMBINED'&&<div className="finance-split-payment"><label>Tiền mặt<input type="number" min="0" value={cashAmount} onChange={e=>setCashAmount(e.target.value)}/></label><label>Chuyển khoản<input type="number" min="0" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)}/></label></div>}
            <div className="finance-total"><span>Tổng phiếu</span><b>{money(draftLines.reduce((s,x)=>s+(Number(x.amount)||0),0))}</b></div>
            <label>Ghi chú<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú chứng từ..."/></label>
            <div className="form-actions finance-form-actions"><button className="button" onClick={()=>submitDocument('DRAFT')}>Lưu nháp</button><button className="button primary" onClick={()=>submitDocument('POSTED')}>Ghi nhận</button></div>
          </div>
        </>}

        {panel==='CATEGORIES'&&<>
          <div className="panel-head"><div><span className="eyebrow">CẤU HÌNH TÀI CHÍNH</span><h2>Hạng mục Thu / Chi</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
          <div className="panel-tabs"><button className={catType==='INCOME'?'active':''} onClick={()=>{setCatType('INCOME');setCatParent('')}}>Thu</button><button className={catType==='EXPENSE'?'active':''} onClick={()=>{setCatType('EXPENSE');setCatParent('')}}>Chi</button></div>
          <div className="panel-scroll finance-categories-panel">
            <div className="finance-category-form">
              <b>Thêm hạng mục</b>
              <label>Tên hạng mục<input value={catName} onChange={e=>setCatName(e.target.value)} placeholder="Ví dụ: Mua vật tư"/></label>
              <label>Nhóm cha<select value={catParent} onChange={e=>setCatParent(e.target.value)}><option value="">Không có</option>{categories.filter(c=>c.txType===catType&&c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <div className="form-actions"><button className="button primary" onClick={addCategory}>+ Thêm hạng mục</button></div>
            </div>
            <div className="finance-category-list">{categories.filter(c=>c.txType===catType).map(c=><div className={'finance-category-row '+(!c.active?'inactive':'')} key={c.id}><div><b>{c.name}</b><span>{c.parentId?'↳ '+(categoryMap.get(c.parentId)?.name??'Nhóm cha'):(c.system?'Hệ thống':'Tùy chỉnh')}</span></div><div>{!c.system&&<button className="button small" onClick={()=>toggleCategory(c.id)}>{c.active?'Ngừng':'Bật'}</button>}</div></div>)}</div>
          </div>
        </>}

        {panel==='DETAIL'&&selectedDetail&&<>
          <div className="panel-head"><div><span className="eyebrow">CHI TIẾT CHỨNG TỪ</span><h2>{selectedDetail.code}</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
          <div className="panel-tabs"><span className="active">Thông tin</span><span>Tham chiếu</span><span>Lịch sử</span></div>
          <div className="panel-scroll">
            <div className="detail-grid">
              <div><span>Loại</span><b>{labelType(selectedDetail.type)}</b></div><div><span>Trạng thái</span><b>{labelStatus(selectedDetail.status)}</b></div>
              <div><span>Thời gian</span><b>{new Date(selectedDetail.occurredAt).toLocaleString('vi-VN')}</b></div><div><span>Phương thức</span><b>{labelPayment(selectedDetail.payment)}</b></div>
              <div className="full"><span>Đối tượng</span><b>{selectedDetail.counterparty||'—'}</b></div>
              <div><span>Tiền mặt</span><b>{money(selectedDetail.cashAmount)}</b></div><div><span>Chuyển khoản</span><b>{money(selectedDetail.transferAmount)}</b></div>
            </div>
            <h3>Chi tiết hạng mục</h3>
            <div className="finance-detail-lines">{selectedDetail.lines.map(l=><div key={l.id}><span><b>{categoryMap.get(l.categoryId)?.name??'Hạng mục'}</b><small>{l.description}</small></span><strong>{money(l.amount)}</strong></div>)}</div>
            {selectedDetail.note&&<div className="finance-note"><span>Ghi chú</span><b>{selectedDetail.note}</b></div>}
            {selectedDetail.status!=='CANCELLED'&&<div className="panel-action-row"><button className="button finance-danger-button" onClick={()=>cancelDocument(selectedDetail.id)}>Huỷ phiếu</button></div>}
          </div>
        </>}
      </aside>
    </div>}
  </div>
}

function Header({title,desc,actions}:{title:string,desc:string,actions?:React.ReactNode}){
  return <header className="page-head finance-page-head"><div><span className="module-eyebrow">TÀI CHÍNH</span><h1>{title}</h1><p>{desc}</p></div>{actions&&<div className="head-actions">{actions}</div>}</header>
}

function Overview({docs,income,expense}:{docs:DocumentRow[],income:number,expense:number}){
  const shipper=docs.filter(d=>d.source==='Đối soát'&&d.status==='POSTED')
  const tip=shipper.flatMap(d=>d.lines).filter(l=>l.categoryId==='tip').reduce((s,l)=>s+l.amount,0)
  return <div className="finance-screen">
    <Header title="Tổng quan tài chính" desc="Dòng tiền, công nợ và các khoản đối soát trên một màn hình."/>
    <div className="finance-period-tabs"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span><span>Tháng này</span></div>
    <section className="finance-kpi-grid finance-overview-kpis">
      <div className="finance-kpi"><span>Tổng thu</span><b className="income">{money(income)}</b><small>Phiếu đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Tổng chi</span><b className="expense">{money(expense)}</b><small>Phiếu đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(income-expense)}</b><small>Thu − Chi</small></div>
      <div className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{money(410000)}</b><small>Dữ liệu minh hoạ</small></div>
      <div className="finance-kpi"><span>Đợt đối soát</span><b>{shipper.length}</b><small>Shipper</small></div>
      <div className="finance-kpi warning"><span>Tip Shipper</span><b>{money(tip)}</b><small>Tự tách từ đối soát</small></div>
    </section>
    <section className="finance-overview-grid"><div className="card finance-overview-card"><div className="card-head"><div><h2>Giao dịch gần nhất</h2><span>{docs.length} chứng từ</span></div></div><div className="finance-daily-list">{docs.slice().reverse().slice(0,5).map(d=><div key={d.id}><b>{d.code}</b><span className={d.type==='INCOME'?'income':'expense'}>{d.type==='INCOME'?'+ ':'− '}{money(d.lines.reduce((s,l)=>s+l.amount,0))}</span><span>{d.source}</span><strong>{labelStatus(d.status)}</strong></div>)}</div></div><div className="card finance-overview-card"><div className="card-head"><div><h2>Trạng thái chứng từ</h2></div></div><div className="finance-report-summary-list"><div><span>Đã ghi nhận</span><b>{docs.filter(d=>d.status==='POSTED').length}</b></div><div><span>Nháp</span><b>{docs.filter(d=>d.status==='DRAFT').length}</b></div><div><span>Đã huỷ</span><b>{docs.filter(d=>d.status==='CANCELLED').length}</b></div></div></div></section>
  </div>
}

function Cashflow({docs,categories,income,expense,draftCount,onCreate,onCategories,onDetail}:{docs:DocumentRow[],categories:Map<string,Category>,income:number,expense:number,draftCount:number,onCreate:(t:TxType)=>void,onCategories:()=>void,onDetail:(id:string)=>void}){
  return <div className="finance-screen">
    <Header title="Thu / Chi" desc="Sổ giao dịch tài chính trung tâm · Phiếu thu, Phiếu chi và Hạng mục trong cùng một màn hình." actions={<><button className="button" onClick={onCategories}>Hạng mục</button><button className="button" onClick={()=>onCreate('INCOME')}>+ Phiếu thu</button><button className="button primary" onClick={()=>onCreate('EXPENSE')}>+ Phiếu chi</button></>}/>
    <section className="finance-kpi-grid">
      <div className="finance-kpi"><span>Tổng thu</span><b className="income">{money(income)}</b><small>Đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Tổng chi</span><b className="expense">{money(expense)}</b><small>Đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(income-expense)}</b><small>Thu − Chi</small></div>
      <div className="finance-kpi"><span>Số phiếu thu</span><b>{docs.filter(d=>d.type==='INCOME'&&d.status!=='CANCELLED').length}</b><small>Trong Preview</small></div>
      <div className="finance-kpi"><span>Số phiếu chi</span><b>{docs.filter(d=>d.type==='EXPENSE'&&d.status!=='CANCELLED').length}</b><small>Trong Preview</small></div>
      <div className="finance-kpi warning"><span>Chờ xử lý</span><b>{draftCount}</b><small>Phiếu nháp</small></div>
    </section>
    <div className="finance-toolbar"><input className="search" readOnly placeholder="Tìm mã phiếu / nội dung / đối tượng..."/><button className="button small">Thu / Chi</button><button className="button small" onClick={onCategories}>Hạng mục</button><button className="button small">Nguồn</button><span className="toolbar-note">{docs.length} giao dịch</span></div>
    <div className="card table-card finance-table-card"><table className="table finance-table"><thead><tr><th>Thời gian</th><th>Mã phiếu</th><th>Loại</th><th>Hạng mục</th><th>Nội dung</th><th>Đối tượng</th><th>Nguồn</th><th>Phương thức</th><th>Tiền thu</th><th>Tiền chi</th><th>Trạng thái</th></tr></thead><tbody>
      {docs.map(d=>{const total=d.lines.reduce((s,l)=>s+l.amount,0);const cats=[...new Set(d.lines.map(l=>categories.get(l.categoryId)?.name??'Hạng mục'))];return <tr key={d.id} onClick={()=>onDetail(d.id)}><td>{new Date(d.occurredAt).toLocaleString('vi-VN')}</td><td className="strong finance-code">{d.code}</td><td><span className={'finance-type '+(d.type==='INCOME'?'income':'expense')}>{labelType(d.type)}</span></td><td>{cats.join(', ')}</td><td>{d.lines.length===1?d.lines[0].description:d.lines.length+' hạng mục'}</td><td>{d.counterparty||'—'}</td><td>{d.source}</td><td>{labelPayment(d.payment)}</td><td className="money finance-money income">{d.type==='INCOME'?money(total):'—'}</td><td className="money finance-money expense">{d.type==='EXPENSE'?money(total):'—'}</td><td><span className={'finance-status '+d.status.toLowerCase()}>{labelStatus(d.status)}</span></td></tr>})}
    </tbody></table></div>
  </div>
}

function Settlement(){
  return <div className="finance-screen"><Header title="Đối soát & Thanh toán" desc="Một màn hình cho Đơn nhập / Shipper và Khách hàng."/><div className="finance-mode-bar"><div className="segmented finance-mode-tabs"><span className="active">Đơn nhập / Shipper</span><span>Khách hàng</span></div><div className="finance-period-tabs compact"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span></div></div><section className="finance-kpi-grid finance-settlement-kpis"><div className="finance-kpi"><span>Đợt đối soát</span><b>2</b><small>4 đơn</small></div><div className="finance-kpi"><span>Tổng COD</span><b>{money(2000000)}</b></div><div className="finance-kpi"><span>Thực chuyển</span><b className="expense">{money(2050000)}</b></div><div className="finance-kpi warning"><span>Tip Shipper</span><b>{money(50000)}</b></div></section><div className="finance-settlement-list"><article className="card shipper-payment-batch"><div className="shipper-payment-batch-head"><div><span className="module-eyebrow">ĐỢT ĐỐI SOÁT</span><h2>HUB HN - Hồng Mai</h2><small>HN · 02/10/2026 11:05</small></div><div className="shipper-payment-batch-metrics"><div><span>Đơn</span><b>3</b></div><div><span>COD</span><b>{money(1500000)}</b></div><div><span>Thực chuyển</span><b>{money(1530000)}</b></div><div><span>Tip</span><b>{money(30000)}</b></div></div></div></article></div></div>
}

function Reports({income,expense,docs,categories}:{income:number,expense:number,docs:DocumentRow[],categories:Map<string,Category>}){
  const expenseBy=new Map<string,number>()
  docs.filter(d=>d.type==='EXPENSE').flatMap(d=>d.lines).forEach(l=>{const name=categories.get(l.categoryId)?.name??'Khác';expenseBy.set(name,(expenseBy.get(name)??0)+l.amount)})
  const rows=[...expenseBy.entries()].sort((a,b)=>b[1]-a[1])
  const max=Math.max(1,...rows.map(r=>r[1]))
  return <div className="finance-screen"><Header title="Báo cáo tài chính" desc="Dòng tiền, thu/chi, công nợ và hiệu quả bán hàng."/><div className="finance-period-tabs"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span><span>Tháng này</span></div><section className="finance-report-section"><div className="finance-report-title"><div><span>01</span><h2>Dòng tiền</h2></div></div><div className="finance-kpi-grid finance-report-kpis"><div className="finance-kpi"><span>Tiền vào</span><b className="income">{money(income)}</b></div><div className="finance-kpi"><span>Tiền ra</span><b className="expense">{money(expense)}</b></div><div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(income-expense)}</b></div></div></section><section className="finance-report-grid"><div className="card finance-overview-card"><div className="card-head"><div><h2>Chi theo hạng mục</h2><span>{rows.length} hạng mục phát sinh</span></div></div><div className="finance-category-bars report">{rows.map(([name,value])=><div key={name}><div><span>{name}</span><b>{money(value)}</b></div><i><em style={{width:Math.max(3,Math.round(value/max*100))+'%'}}/></i></div>)}</div></div><div className="card finance-overview-card"><div className="card-head"><div><h2>Chứng từ</h2></div></div><div className="finance-report-summary-list"><div><span>Đã ghi nhận</span><b>{docs.length}</b></div><div><span>Phiếu thu</span><b>{docs.filter(d=>d.type==='INCOME').length}</b></div><div><span>Phiếu chi</span><b>{docs.filter(d=>d.type==='EXPENSE').length}</b></div></div></div></section></div>
}
