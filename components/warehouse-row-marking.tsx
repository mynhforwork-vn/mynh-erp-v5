'use client'
import {useEffect,useMemo,useState} from 'react'
import {
 listWarehouseHighlights,markWarehouseRows,setWarehouseRowFlag,
 saveWarehouseHighlightRule,deleteWarehouseHighlightRule
} from '@/lib/actions/erp-row-highlights'
import {
 ROW_MARK_COLORS,resolveRowMark,ruleMatches,
 type HighlightRow,type RowMarkColor,type RowMark,
 type RowHighlightRule,type RowRuleCondition
} from '@/lib/erp-row-highlights'

const COLOR_NAMES:Record<RowMarkColor,string>={
 yellow:'Vàng nhạt',blue:'Xanh lam nhạt',green:'Xanh lá nhạt',
 purple:'Tím nhạt',pink:'Hồng nhạt'
}
const FIELDS=[['status','Trạng thái'],['warehouse','Kho nhận'],
 ['sku_missing','Thiếu SKU'],['item_count','Số sản phẩm']] as const
const OPS=[['eq','Bằng'],['neq','Khác'],['contains','Chứa'],
 ['gt','Lớn hơn'],['lt','Nhỏ hơn'],['empty','Trống'],['not_empty','Không trống']] as const
const blankCondition=():RowRuleCondition=>({field:'status',op:'eq',value:''})
type RuleDraft={
 id?:string,title:string,enabled:boolean,priority:number,
 match_mode:'ALL'|'ANY',color:RowMarkColor,conditions:RowRuleCondition[]
}
const blankRule=():RuleDraft=>({
 title:'',enabled:true,priority:50,match_mode:'ALL',color:'yellow',conditions:[blankCondition()]
})
const safeError=(e:unknown)=>e instanceof Error?e.message:'Không thể lưu thay đổi'
export function useWarehouseRowMarking(enabled:boolean,rows:HighlightRow[]){
 const [marks,setMarks]=useState<RowMark[]>([])
 const [rules,setRules]=useState<RowHighlightRule[]>([])
 const [flags,setFlags]=useState<{row_id:string,flag_type:string,reason:string}[]>([])
 const [marking,setMarking]=useState(false)
 const [selected,setSelected]=useState<string[]>([])
 const [ruleOpen,setRuleOpen]=useState(false)
 const [draft,setDraft]=useState<RuleDraft>(blankRule)
 const [flagReason,setFlagReason]=useState('')
 const [flagOpen,setFlagOpen]=useState(false)
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const markMap=useMemo(()=>new Map(marks.map(r=>[r.row_id,r])),[marks])
 const flagsMap=useMemo(()=>new Map(flags.map(r=>[r.row_id,r])),[flags])
 const available=useMemo(()=>new Set(rows.map(r=>r.id)),[rows])
 const picked=selected.filter(id=>available.has(id))
 const display=useMemo(()=>{
  const map=new Map<string,{color:RowMarkColor|null,pinned:boolean,flagged:boolean}>()
  for(const row of rows)map.set(row.id,{
   color:resolveRowMark(row,markMap.get(row.id),rules),
   pinned:markMap.get(row.id)?.pinned??false,flagged:flagsMap.has(row.id)
  })
  return map
 },[rows,markMap,flagsMap,rules])
 async function reload(){
  const info=await listWarehouseHighlights()
  setMarks(info.marks);setRules(info.rules);setFlags(info.flags)
 }
 useEffect(()=>{
  if(!enabled)return
  let cancelled=false
  void listWarehouseHighlights().then(info=>{
   if(!cancelled){setMarks(info.marks);setRules(info.rules);setFlags(info.flags)}
  }).catch(e=>{if(!cancelled)setError(safeError(e))})
  return ()=>{cancelled=true}
 },[enabled])
 useEffect(()=>{
  if(!notice)return
  const id=setTimeout(()=>setNotice(''),5000)
  return ()=>clearTimeout(id)
 },[notice])
 useEffect(()=>{
  if(!marking){setSelected([]);setFlagOpen(false)}
 },[marking])
 async function run(operation:()=>Promise<unknown>,done:string){
  if(busy)return
  setBusy(true);setError('')
  try{await operation();await reload();setNotice(done)}
  catch(e){setError(safeError(e))}
  finally{setBusy(false)}
 }
 function toggle(id:string){
  if(!marking||!available.has(id))return
  setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length>=100?s:[...s,id])
 }
 function pickVisible(ids:string[]){
  const all=ids.filter(x=>available.has(x)).slice(0,100)
  setSelected(old=>all.every(id=>old.includes(id))?old.filter(x=>!all.includes(x))
   :[...new Set([...old,...all])].slice(0,100))
 }
 function colorSelected(color:RowMarkColor|null){
  if(picked.length)void run(async()=>{
   await markWarehouseRows(picked,{color})
   setSelected([])
  },color?'Đã highlight các dòng đã chọn.':'Đã bỏ highlight các dòng đã chọn.')
 }
 async function pinSelected(value:boolean){
  if(!picked.length)return
  await run(async()=>{
   // Preserve each row's existing manual color when pinning.
   await Promise.all(picked.map(async id=>
    markWarehouseRows([id],{color:markMap.get(id)?.color??null,pinned:value})
   ))
   setSelected([])
  },value?'Đã ghim các dòng.':'Đã bỏ ghim các dòng.')
 }
 function flagSelected(){
  if(!picked.length)return
  if(flagReason.trim().length<4){setError('Lý do gắn cờ cần ít nhất 4 ký tự');return}
  void run(async()=>{
   for(const id of picked)await setWarehouseRowFlag({
    rowId:id,flagType:'review',reason:flagReason.trim()
   })
   setFlagOpen(false);setFlagReason('');setSelected([])
  },'Đã gắn cờ các đơn đã chọn.')
 }
 function saveRule(){
  void run(async()=>{
   await saveWarehouseHighlightRule(draft)
   setRuleOpen(false);setDraft(blankRule())
  },'Đã lưu quy tắc highlight.')
 }
 const rowStyle=(id:string)=>display.get(id)?.color
 const top=<div className="warehouse-mark-controls" aria-label="Đánh dấu bảng Nhập kho">
  <div className="warehouse-mark-actions">
   <button type="button" aria-pressed={marking} disabled={!enabled||busy}
    onClick={()=>setMarking(x=>!x)}>{marking?'Đóng đánh dấu':'Đánh dấu dòng'}</button>
   <button type="button" aria-expanded={ruleOpen} disabled={!enabled||busy}
    onClick={()=>setRuleOpen(x=>!x)}>Quy tắc highlight</button>
   {marking&&<span className="warehouse-mark-picked">{picked.length} dòng đã chọn</span>}
   {marking&&picked.length>0&&<>
    <button type="button" disabled={busy} onClick={()=>void pinSelected(true)}>Ghim</button>
    <button type="button" disabled={busy} onClick={()=>void pinSelected(false)}>Bỏ ghim</button>
    <button type="button" disabled={busy} onClick={()=>setFlagOpen(x=>!x)}>Gắn cờ</button>
    <button type="button" disabled={busy} onClick={()=>colorSelected(null)}>Bỏ màu</button>
    {ROW_MARK_COLORS.map(color=><button type="button" key={color}
     disabled={busy} className={'warehouse-mark-color warehouse-mark-'+color}
     aria-label={'Highlight '+COLOR_NAMES[color]} title={COLOR_NAMES[color]}
     onClick={()=>colorSelected(color)}/>)}
    <button type="button" disabled={busy} onClick={()=>setSelected([])}>Bỏ chọn</button>
   </>}
  </div>
  {flagOpen&&marking&&<div className="warehouse-mark-flag-editor">
   <label>Lý do cần xử lý
    <input value={flagReason} maxLength={300} placeholder="Nhập lý do gắn cờ"
     onChange={e=>setFlagReason(e.target.value)}/>
   </label>
   <button type="button" disabled={busy||flagReason.trim().length<4}
    onClick={flagSelected}>Xác nhận gắn cờ</button>
  </div>}
  {ruleOpen&&<div className="warehouse-highlight-rules" role="region" aria-label="Thiết lập quy tắc highlight">
   <div className="warehouse-highlight-rules-existing">
    <b>Quy tắc của tôi</b>
    {rules.map(rule=><div key={rule.id} className="warehouse-highlight-existing-rule">
     <span>{rule.title} · Ưu tiên {rule.priority}{rule.enabled?'':' · Đang tắt'}</span>
     <button type="button" disabled={busy} onClick={()=>setDraft({...rule})}>Sửa</button>
     <button type="button" disabled={busy}
      onClick={()=>void run(()=>deleteWarehouseHighlightRule(rule.id),
       'Đã xóa quy tắc highlight.')}>Xóa</button>
    </div>)}
    {rules.length===0&&<small>Chưa có quy tắc nào.</small>}
   </div>
   <div className="warehouse-highlight-rule-inputs">
    <label>Tên quy tắc <input maxLength={70} value={draft.title}
     onChange={e=>setDraft(s=>({...s,title:e.target.value}))}/></label>
    <label>Màu <select value={draft.color} onChange={e=>setDraft(s=>({...s,color:e.target.value as RowMarkColor}))}>
     {ROW_MARK_COLORS.map(c=><option key={c} value={c}>{COLOR_NAMES[c]}</option>)}
    </select></label>
    <label>Ưu tiên <input type="number" min={1} max={100} value={draft.priority}
      onChange={e=>setDraft(s=>({...s,priority:Number(e.target.value)}))}/></label>
    <label>Kết hợp <select value={draft.match_mode}
     onChange={e=>setDraft(s=>({...s,match_mode:e.target.value as 'ALL'|'ANY'}))}>
     <option value="ALL">Tất cả điều kiện (VÀ)</option>
     <option value="ANY">Một trong các điều kiện (HOẶC)</option>
    </select></label>
    <label className="warehouse-highlight-rule-on">
     <input type="checkbox" checked={draft.enabled}
      onChange={e=>setDraft(s=>({...s,enabled:e.target.checked}))}/> Bật quy tắc
    </label>
   </div>
   <b>Điều kiện (tối đa 6)</b>
   {draft.conditions.map((c,i)=><div key={i} className="warehouse-highlight-condition">
    <select aria-label={'Trường điều kiện '+(i+1)} value={c.field}
     onChange={e=>setDraft(s=>({...s,conditions:s.conditions.map((x,j)=>j===i?{
      ...x,field:e.target.value as RowRuleCondition['field'],op:'eq',value:''
     }:x)}))}>
     {FIELDS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select>
    <select aria-label={'Toán tử '+(i+1)} value={c.op}
     onChange={e=>setDraft(s=>({...s,conditions:s.conditions.map((x,j)=>j===i?{
      ...x,op:e.target.value as RowRuleCondition['op']
     }:x)}))}>
     {OPS.filter(([op])=>c.field==='item_count'||!['gt','lt'].includes(op))
      .map(([op,label])=><option key={op} value={op}>{label}</option>)}
    </select>
    <input aria-label={'Giá trị '+(i+1)} value={c.value}
     disabled={c.op==='empty'||c.op==='not_empty'}
     placeholder={c.field==='sku_missing'?'true / false':'Giá trị'}
     onChange={e=>setDraft(s=>({...s,conditions:s.conditions.map((x,j)=>j===i?{
      ...x,value:e.target.value
     }:x)}))}/>
    <button type="button" disabled={draft.conditions.length===1}
     aria-label={'Xóa điều kiện '+(i+1)}
     onClick={()=>setDraft(s=>({...s,conditions:s.conditions.filter((_,j)=>j!==i)}))}>×</button>
   </div>)}
   <div className="warehouse-highlight-rule-footer">
    <button type="button" disabled={draft.conditions.length>=6}
     onClick={()=>setDraft(s=>({...s,conditions:[...s.conditions,blankCondition()]}))}>+ Điều kiện</button>
    <small>{rows.filter(row=>ruleMatches(row,{...draft,id:draft.id??'new'})).length} dòng khớp trong dữ liệu đang tải</small>
    <button type="button" disabled={busy} onClick={()=>setDraft(blankRule())}>Làm mới</button>
    <button type="button" disabled={busy||draft.title.trim().length<2} onClick={saveRule}>
     {busy?'Đang lưu…':'Lưu quy tắc'}
    </button>
   </div>
  </div>}
  {notice&&<p role="status" className="warehouse-mark-notice">{notice}</p>}
  {error&&<p role="alert" className="warehouse-mark-error">{error}</p>}
 </div>
 return {
  marking,selected:picked,display,rowStyle,top,
  toggle,pickVisible,enabled,
  selectedSet:new Set(picked)
 }
}
