'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {
  batchSetTableRowMarks,batchSetTableRowFlags,loadTableRowMarkings,
  saveTableHighlightRule,deleteTableHighlightRule
} from '@/lib/actions/table-row-markings'
import {
  HIGHLIGHT_FIELDS,MARK_OPERATOR_LABELS,MARK_OPERATORS,ROW_COLORS,ROW_COLOR_LABELS,
  getRowDecoration,type TableMarkScope,type RowData,type RowColor,type HighlightRule,
  type HighlightCondition,type RowMark,type RowFlag
} from '@/lib/table-row-highlights'

type SourceRow={id:string;data:RowData}
type RuleDraft=Omit<HighlightRule,'id'>
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function emptyDraft(scope:TableMarkScope):RuleDraft{
  const first=Object.keys(HIGHLIGHT_FIELDS[scope])[0]
  return {title:'',enabled:true,priority:10,match_mode:'all',
    conditions:[{field:first,operator:'eq',value:''}],color:'yellow'}
}
function ruleValue(field:string,scope:TableMarkScope,raw:string){
  const def=HIGHLIGHT_FIELDS[scope][field]
  return def?.type==='boolean'?raw==='true':def?.type==='number'
    ?(raw===''?0:Number(raw)):raw
}
export function useTableRowMarking(
  scope:TableMarkScope,rows:SourceRow[],enabled:boolean,readOnly:boolean
){
  const [mode,setMode]=useState(false)
  const [selected,setSelected]=useState<string[]>([])
  const [marks,setMarks]=useState<RowMark[]>([])
  const [flags,setFlags]=useState<RowFlag[]>([])
  const [rules,setRules]=useState<HighlightRule[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState<{error:boolean,text:string}|null>(null)
  const ids=useMemo(()=>rows.map(row=>row.id).filter(id=>UUID.test(id)).slice(0,1000),[rows])
  const identity=ids.join(',')
  const markMap=useMemo(()=>new Map(marks.map(x=>[x.row_key,x])),[marks])
  const flagMap=useMemo(()=>new Map(flags.map(x=>[x.row_key,x])),[flags])
  const markedSet=useMemo(()=>new Set(selected),[selected])
  const activeRows=useMemo(()=>new Map(rows.map(x=>[x.id,x.data])),[rows])
  const notify=(text:string,error=false)=>setMessage(text?{text,error}:null)
  const refresh=useCallback(async()=>{
    if(!enabled||readOnly){setMarks([]);setFlags([]);setRules([]);return}
    const all=await loadTableRowMarkings(scope,ids)
    setMarks(all.marks);setFlags(all.flags);setRules(all.rules)
  },[scope,identity,enabled,readOnly])
  useEffect(()=>{
    if(!enabled)return
    let active=true
    if(!readOnly)refresh().catch(e=>{
      if(active)setMessage({error:true,text:e instanceof Error?e.message:'Không tải được đánh dấu'})
    })
    return ()=>{active=false}
  },[enabled,readOnly,refresh])
  useEffect(()=>setSelected(current=>current.filter(id=>activeRows.has(id))),[activeRows])
  useEffect(()=>{
    if(!message)return
    const timer=window.setTimeout(()=>setMessage(null),5000)
    return ()=>window.clearTimeout(timer)
  },[message])
  function toggleMode(){
    setMode(current=>!current)
    setSelected([])
  }
  function toggle(id:string){
    if(!mode||busy)return
    setSelected(current=>current.includes(id)?current.filter(x=>x!==id):
      current.length>=100?current:[...current,id])
  }
  function toggleAll(keys:string[]){
    if(!mode||busy)return
    const visible=keys.filter(id=>UUID.test(id)).slice(0,100)
    const all=visible.length>0&&visible.every(id=>markedSet.has(id))
    setSelected(current=>all?current.filter(id=>!visible.includes(id)):
      [...new Set([...current,...visible])].slice(0,100))
  }
  async function action(operation:()=>Promise<unknown>,success:string){
    if(readOnly){notify('Chế độ xem trước chỉ cho kiểm tra giao diện, chưa ghi đánh dấu',true);return false}
    setBusy(true)
    try{
      await operation()
      await refresh()
      notify(success)
      return true
    }catch(e){
      notify(e instanceof Error?e.message:'Không thể lưu đánh dấu',true)
      return false
    }finally{setBusy(false)}
  }
  async function markColor(color:RowColor|null){
    if(!selected.length)return
    await action(()=>batchSetTableRowMarks(scope,selected,{color}),
      color?'Đã tô màu '+selected.length+' dòng':'Đã bỏ highlight '+selected.length+' dòng')
  }
  async function pin(pinned:boolean){
    if(!selected.length)return false
    return action(()=>batchSetTableRowMarks(scope,selected,{pinned}),
      (pinned?'Đã ghim ':'Đã bỏ ghim ')+selected.length+' dòng')
  }
  async function pinRow(id:string,pinned:boolean){
    return action(()=>batchSetTableRowMarks(scope,[id],{pinned}),
      pinned?'Đã ghim đơn':'Đã bỏ ghim đơn')
  }
  async function flag(type:'attention'|'urgent'|'follow_up'|null,reason=''){
    if(!selected.length)return false
    return action(()=>batchSetTableRowFlags(scope,selected.slice(0,25),type,reason),
      (type?'Đã gắn cờ ':'Đã bỏ cờ ')+Math.min(25,selected.length)+' dòng')
  }
  async function flagRow(id:string,type:'attention'|'urgent'|'follow_up'|null,reason=''){
    return action(()=>batchSetTableRowFlags(scope,[id],type,reason),
      type?'Đã gắn cờ đơn':'Đã bỏ cờ đơn')
  }
  async function saveRule(rule:RuleDraft,id?:string){
    return action(()=>saveTableHighlightRule(scope,rule,id),
      id?'Đã cập nhật quy tắc':'Đã lưu quy tắc highlight')
  }
  async function removeRule(id:string){
    return action(()=>deleteTableHighlightRule(scope,id),'Đã xóa quy tắc')
  }
  function getDecoration(id:string){
    return getRowDecoration(scope,activeRows.get(id)??{},markMap.get(id),rules)
  }
  return {
    enabled,readOnly,mode,selected,busy,message,marks,flags,rules,markMap,flagMap,
    selectedSet:markedSet,toggleMode,toggle,toggleAll,markColor,pin,pinRow,flag,flagRow,
    saveRule,removeRule,getDecoration,clearSelected:()=>setSelected([]),
    notice:notify
  }
}
export type TableMarkingModel=ReturnType<typeof useTableRowMarking>

export function TableMarkingToolbar({
  model,scope,rows
}:{model:TableMarkingModel,scope:TableMarkScope,rows:SourceRow[]}){
  const [expanded,setExpanded]=useState(false)
  const [position,setPosition]=useState({top:38,right:8})
  const anchorRef=useRef<HTMLDivElement|null>(null)
  const panelRef=useRef<HTMLDivElement|null>(null)
  const [section,setSection]=useState<'none'|'flag'|'rules'>('none')
  const [flagType,setFlagType]=useState<'attention'|'urgent'|'follow_up'>('attention')
  const [flagReason,setFlagReason]=useState('')
  const [draft,setDraft]=useState<RuleDraft>(()=>emptyDraft(scope))
  const [editing,setEditing]=useState<string|null>(null)
  const [editingOpen,setEditingOpen]=useState(false)
  const supported=HIGHLIGHT_FIELDS[scope]
  const conditionOperators=(field:string)=>{
    const type=supported[field]?.type
    return MARK_OPERATORS.filter(op=>type==='boolean'?['eq','neq'].includes(op):
      type==='number'?!['contains'].includes(op):!['gt','lt'].includes(op))
  }
  // Evaluate exactly the visible loaded data, not an estimated server-wide count.
  const previewMatches=rows.filter(row=>getRowDecoration(scope,row.data,undefined,[{
    id:'preview',...draft,enabled:true
  }])!==null).length
  useEffect(()=>{
    const esc=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){setSection('none');setEditingOpen(false);setExpanded(false)}
    }
    window.addEventListener('keydown',esc)
    return ()=>window.removeEventListener('keydown',esc)
  },[])
  useEffect(()=>{
    if(!expanded)return
    const onOutside=(event:PointerEvent)=>{
      if(!anchorRef.current?.contains(event.target as Node)&&
         !panelRef.current?.contains(event.target as Node)){
        setExpanded(false);setSection('none');setEditingOpen(false)
      }
    }
    document.addEventListener('pointerdown',onOutside)
    return ()=>document.removeEventListener('pointerdown',onOutside)
  },[expanded])
  if(!model.enabled)return null
  function toggleExpanded(){
    if(!expanded){
      const rect=anchorRef.current?.getBoundingClientRect()
      if(rect){
        const top=Math.max(8,Math.min(rect.bottom+6,Math.max(8,window.innerHeight-230)))
        const right=Math.max(8,Math.min(window.innerWidth-308,window.innerWidth-rect.right))
        setPosition({top,right})
      }
    }
    setExpanded(value=>!value)
  }
  function editCondition(index:number,patch:Partial<HighlightCondition>){
    setDraft(current=>({...current,conditions:current.conditions.map((x,i)=>i===index?{...x,...patch}:x)}))
  }
  function openRules(){
    setSection(current=>current==='rules'?'none':'rules')
    setEditingOpen(false)
  }
  async function save(){
    const result=await model.saveRule(draft,editing??undefined)
    if(result){
      setDraft(emptyDraft(scope))
      setEditing(null);setEditingOpen(false)
    }
  }
  return <div className="table-row-marking" ref={anchorRef}>
    <button type="button" className="table-row-marking-trigger" title="Highlight, chọn nhiều dòng và quy tắc"
      aria-label="Mở highlight và quy tắc" aria-expanded={expanded} aria-haspopup="dialog"
      onClick={event=>{event.stopPropagation();toggleExpanded()}}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 21h16M14 3l7 7-9.5 9.5a3 3 0 0 1-4.2 0l-3-3a3 3 0 0 1 0-4.2L14 3Z"/>
        <path d="m12 5 7 7"/>
      </svg>
    </button>
    {expanded&&typeof document!=='undefined'&&createPortal(<div ref={panelRef}
      className="table-row-marking-dropdown" role="dialog" aria-label="Highlight và đánh dấu bảng"
      style={{top:position.top,right:position.right}}>
    <div className="table-row-marking-toolbar">
      <button type="button" aria-pressed={model.mode} className={model.mode?'active':''}
        disabled={model.busy} onClick={()=>{model.toggleMode();setExpanded(false)}}>Đánh dấu dòng</button>
      <button type="button" aria-expanded={section==='rules'} onClick={openRules}
        disabled={model.busy}>Quy tắc highlight ({model.rules.length})</button>
      {model.mode&&<>
        <span className="table-row-marking-count">{model.selected.length} dòng đã chọn</span>
        <label className="table-row-marking-color">
          <span>Highlight</span>
          <select aria-label="Chọn màu highlight cho các dòng đã chọn"
            defaultValue="" disabled={!model.selected.length||model.busy}
            onChange={e=>{
              if(!e.target.value)return
              void model.markColor(e.target.value==='remove'?null:e.target.value as RowColor)
              e.target.value=''
            }}>
            <option value="">Chọn màu...</option>
            {ROW_COLORS.map(color=><option value={color} key={color}>{ROW_COLOR_LABELS[color]}</option>)}
            <option value="remove">Bỏ highlight</option>
          </select>
        </label>
        <button type="button" disabled={!model.selected.length||model.busy}
          onClick={()=>void model.pin(true)}>Ghim</button>
        <button type="button" disabled={!model.selected.length||model.busy}
          onClick={()=>void model.pin(false)}>Bỏ ghim</button>
        <button type="button" aria-expanded={section==='flag'}
          disabled={!model.selected.length||model.busy}
          onClick={()=>setSection(x=>x==='flag'?'none':'flag')}>Gắn cờ</button>
        <button type="button" disabled={!model.selected.length||model.busy}
          onClick={()=>void model.flag(null)}>Bỏ cờ</button>
        <button type="button" disabled={model.busy} onClick={model.clearSelected}>Bỏ chọn</button>
      </>}
    </div>
    {model.readOnly&&<small className="table-row-marking-preview-note">
      Chế độ xem trước: đánh dấu và quy tắc không ghi vào dữ liệu thật.
    </small>}
    {section==='flag'&&model.mode&&<section className="table-row-marking-panel" aria-label="Gắn cờ các dòng">
      <b>Gắn cờ cho {Math.min(25,model.selected.length)} dòng (tối đa 25/lượt)</b>
      <div className="table-row-marking-fields">
        <label>Loại cờ
          <select value={flagType} onChange={e=>setFlagType(e.target.value as typeof flagType)}>
            <option value="attention">Cần chú ý</option>
            <option value="urgent">Cần xử lý</option>
            <option value="follow_up">Theo dõi</option>
          </select>
        </label>
        <label className="wide">Lý do
          <input value={flagReason} maxLength={300}
            placeholder="Lý do gắn cờ (từ 8 ký tự)" onChange={e=>setFlagReason(e.target.value)}/>
        </label>
        <button type="button" disabled={model.busy||flagReason.trim().length<8}
          onClick={async()=>{if(await model.flag(flagType,flagReason))setSection('none')}}>Lưu cờ</button>
      </div>
    </section>}
    {section==='rules'&&<section className="table-row-marking-panel" aria-label="Quy tắc highlight bảng">
      <div className="table-row-marking-panel-head">
        <b>Quy tắc highlight tự động</b>
        <button type="button" onClick={()=>{setEditing(null);setDraft(emptyDraft(scope));setEditingOpen(x=>!x)}}>
          + Tạo quy tắc
        </button>
      </div>
      {model.rules.map(rule=><div className="table-row-rule-row" key={rule.id}>
        <span className={'table-row-rule-swatch tone-'+rule.color} aria-hidden="true"/>
        <span className="table-row-rule-text"><b>{rule.title}</b>
          <small>{rule.match_mode==='all'?'Tất cả điều kiện':'Một trong các điều kiện'} · Ưu tiên {rule.priority}</small>
        </span>
        <label className="table-row-rule-switch"><input type="checkbox" checked={rule.enabled}
          disabled={model.busy||model.readOnly}
          onChange={()=>void model.saveRule({...rule,enabled:!rule.enabled},rule.id)}/> Bật</label>
        <button type="button" onClick={()=>{
          setEditing(rule.id);setDraft({title:rule.title,enabled:rule.enabled,
            priority:rule.priority,match_mode:rule.match_mode,conditions:rule.conditions,
            color:rule.color});setEditingOpen(true)
        }}>Sửa</button>
        <button type="button" disabled={model.busy||model.readOnly}
          onClick={()=>void model.removeRule(rule.id)}>Xóa</button>
      </div>)}
      {!model.rules.length&&<small>Chưa có quy tắc. Tạo điều kiện theo dữ liệu đang hiển thị.</small>}
      {editingOpen&&<div className="table-row-marking-editor">
        <div className="table-row-marking-fields">
          <label className="wide">Tên quy tắc
            <input value={draft.title} maxLength={80} placeholder="Ví dụ: Đơn bỏ qua kho"
              onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/>
          </label>
          <label>Màu
            <select value={draft.color} onChange={e=>setDraft(d=>({...d,color:e.target.value as RowColor}))}>
              {ROW_COLORS.map(color=><option key={color} value={color}>{ROW_COLOR_LABELS[color]}</option>)}
            </select>
          </label>
          <label>Kết hợp
            <select value={draft.match_mode} onChange={e=>setDraft(d=>({...d,match_mode:e.target.value as 'all'|'any'}))}>
              <option value="all">VÀ — Tất cả</option>
              <option value="any">HOẶC — Ít nhất một</option>
            </select>
          </label>
          <label>Ưu tiên
            <input type="number" min={1} max={999} value={draft.priority}
              onChange={e=>setDraft(d=>({...d,priority:Number(e.target.value)}))}/>
          </label>
        </div>
        {draft.conditions.map((c,i)=><div className="table-row-marking-condition" key={i}>
          <select aria-label={'Trường điều kiện '+(i+1)} value={c.field}
            onChange={e=>editCondition(i,{field:e.target.value,operator:'eq',
              value:supported[e.target.value]?.type==='boolean'?true:
                supported[e.target.value]?.type==='number'?0:''})}>
            {Object.entries(supported).map(([key,f])=><option key={key} value={key}>{f.label}</option>)}
          </select>
          <select aria-label={'Toán tử điều kiện '+(i+1)} value={c.operator}
            onChange={e=>editCondition(i,{operator:e.target.value as HighlightCondition['operator']})}>
            {conditionOperators(c.field).map(op=><option key={op} value={op}>{MARK_OPERATOR_LABELS[op]}</option>)}
          </select>
          {['empty','not_empty'].includes(c.operator)
            ?<span className="table-row-marking-empty">Không cần giá trị</span>
            :supported[c.field]?.type==='boolean'
              ?<select aria-label={'Giá trị điều kiện '+(i+1)}
                value={String(c.value)} onChange={e=>editCondition(i,{value:e.target.value==='true'})}>
                <option value="true">Có</option><option value="false">Không</option>
              </select>
              :<input aria-label={'Giá trị điều kiện '+(i+1)}
                type={supported[c.field]?.type==='number'?'number':'text'}
                value={String(c.value??'')} maxLength={150}
                placeholder="Giá trị..." onChange={e=>editCondition(i,{
                  value:ruleValue(c.field,scope,e.target.value)})}/>}
          <button type="button" aria-label={'Xóa điều kiện '+(i+1)}
            disabled={draft.conditions.length===1}
            onClick={()=>setDraft(d=>({...d,conditions:d.conditions.filter((_,j)=>j!==i)}))}>×</button>
        </div>)}
        <div className="table-row-marking-editor-footer">
          <button type="button" disabled={draft.conditions.length>=6}
            onClick={()=>setDraft(d=>({...d,conditions:[...d.conditions,{
              field:Object.keys(supported)[0],operator:'eq',value:''
            }]}))}>+ Thêm điều kiện</button>
          <span>{previewMatches}/{rows.length} dòng đang tải khớp</span>
          <button type="button" disabled={model.readOnly||model.busy||draft.title.trim().length<3}
            onClick={()=>void save()}>{editing?'Lưu thay đổi':'Lưu quy tắc'}</button>
          <button type="button" onClick={()=>setEditingOpen(false)}>Đóng</button>
        </div>
      </div>}
    </section>}
    </div>,document.body)}
    {model.message&&typeof document!=='undefined'&&createPortal(
      <div className={'table-row-marking-notice '+(model.message.error?'error':'success')}
        role={model.message.error?'alert':'status'}>
        <span>{model.message.text}</span>
        <button type="button" aria-label="Đóng thông báo" onClick={()=>model.notice('')}>×</button>
      </div>,document.body)}
  </div>
}

export function RowMarkingActions({model,rowId,label}:{
  model:TableMarkingModel;rowId:string;label:string
}){
  const mark=model.markMap.get(rowId), flag=model.flagMap.get(rowId)
  const [open,setOpen]=useState(false)
  const [flagType,setFlagType]=useState<'attention'|'urgent'|'follow_up'>('attention')
  const [reason,setReason]=useState('')
  const [position,setPosition]=useState({top:40,right:8})
  const flagButton=useRef<HTMLButtonElement|null>(null)
  const editor=useRef<HTMLDivElement|null>(null)
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{
      if(!flagButton.current?.contains(event.target as Node)&&
         !editor.current?.contains(event.target as Node))setOpen(false)
    }
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('pointerdown',outside)
    window.addEventListener('keydown',escape)
    return ()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape)}
  },[open])
  function editFlag(){
    if(!open){
      setFlagType(flag?.flag_type??'attention')
      setReason(flag?.reason??'')
      const rect=flagButton.current?.getBoundingClientRect()
      if(rect)setPosition({
        top:Math.max(8,Math.min(rect.bottom+5,Math.max(8,window.innerHeight-230))),
        right:Math.max(8,Math.min(window.innerWidth-270,window.innerWidth-rect.right))
      })
    }
    setOpen(value=>!value)
  }
  return <span className="table-row-mark-inline-tools">
    <button type="button" className={'table-row-mark-icon'+(mark?.pinned?' active':'')}
      disabled={model.busy} aria-label={(mark?.pinned?'Bỏ ghim ':'Ghim ')+label}
      aria-pressed={Boolean(mark?.pinned)} title={mark?.pinned?'Bỏ ghim đơn':'Ghim đơn'}
      onClick={event=>{event.stopPropagation();void model.pinRow(rowId,!mark?.pinned)}}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 3 8 3l1 5-3 4v2h12v-2l-3-4 1-5ZM12 14v7"/>
      </svg>
    </button>
    <button type="button" ref={flagButton}
      className={'table-row-mark-icon'+(flag?' flagged':'')}
      aria-label={'Gắn cờ '+label} aria-expanded={open} aria-haspopup="dialog"
      title={flag?'Cờ: '+flag.reason:'Gắn cờ / ghi lý do'}
      onClick={event=>{event.stopPropagation();editFlag()}}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 21V4M5 5c4-3 6 3 10 0l4-2v12c-4 2-7-2-14 0"/>
      </svg>
    </button>
    {open&&typeof document!=='undefined'&&createPortal(<div className="table-row-flag-editor"
      ref={editor} role="dialog" aria-label={'Chỉnh cờ cho '+label}
      style={{top:position.top,right:position.right}}>
      <strong>Cờ đơn {label}</strong>
      <label>Loại cờ
        <select value={flagType} disabled={model.busy||model.readOnly}
          onChange={event=>setFlagType(event.target.value as typeof flagType)}>
          <option value="attention">Cần chú ý</option>
          <option value="urgent">Cần xử lý</option>
          <option value="follow_up">Theo dõi</option>
        </select>
      </label>
      <label>Lý do
        <textarea rows={2} maxLength={300} value={reason}
          disabled={model.busy||model.readOnly}
          onChange={event=>setReason(event.target.value)}/>
      </label>
      {model.readOnly&&<small>Preview chỉ xem, không lưu cờ vào dữ liệu thật.</small>}
      <div className="table-row-flag-actions">
        <button type="button" disabled={model.busy||model.readOnly||reason.trim().length<8}
          onClick={async()=>{if(await model.flagRow(rowId,flagType,reason))setOpen(false)}}>Lưu</button>
        {flag&&<button type="button" disabled={model.busy||model.readOnly}
          onClick={async()=>{if(await model.flagRow(rowId,null))setOpen(false)}}>Bỏ cờ</button>}
        <button type="button" onClick={()=>setOpen(false)}>Đóng</button>
      </div>
    </div>,document.body)}
  </span>
}
