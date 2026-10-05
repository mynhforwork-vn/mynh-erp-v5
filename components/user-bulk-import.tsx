'use client'

import { useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkImportERPUsers } from '@/lib/actions/core'

const STATUSES=new Set(['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'])

function boolValue(value:string){
  const v=value.trim().toLowerCase()
  return ['1','true','yes','y','x','có','co'].includes(v)
}

export function UserBulkImport(){
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [raw,setRaw]=useState('')
  const [message,setMessage]=useState('')
  const [pending,startTransition]=useTransition()

  const parsed=useMemo(()=>{
    const lines=raw.split(/\r?\n/).map(x=>x.trimEnd()).filter(x=>x.trim())
    const rows=lines.map((line,index)=>{
      const cols=line.split('\t')
      const [username='',phone='',email='',status='Active',mobile='',web='',note='',spc_f='',spc_st='']=cols
      const errors:string[]=[]
      if(cols.length!==9)errors.push(`cần 9 cột, hiện có ${cols.length}`)
      if(!username.trim())errors.push('thiếu Username')
      const normalizedStatus=status.trim()||'Active'
      if(!STATUSES.has(normalizedStatus))errors.push('trạng thái không hợp lệ')
      return {
        line:index+1,
        username:username.trim(),
        phone:phone.trim(),
        email:email.trim(),
        status:normalizedStatus,
        mobile:boolValue(mobile),
        web:boolValue(web),
        note:note.trim(),
        spc_f:spc_f.trim(),
        spc_st:spc_st.trim(),
        errors,
      }
    })

    const seen=new Map<string,number>()
    for(const row of rows){
      const key=row.username.toLowerCase()
      if(!key)continue
      if(seen.has(key)){
        row.errors.push(`trùng Username với dòng ${seen.get(key)}`)
      }else seen.set(key,row.line)
    }
    if(rows.length>200)rows.slice(200).forEach(row=>row.errors.push('vượt giới hạn 200 dòng'))
    return rows
  },[raw])

  const errorCount=parsed.reduce((sum,row)=>sum+row.errors.length,0)
  const valid=parsed.length>0&&parsed.length<=200&&errorCount===0

  function close(){
    if(pending)return
    setOpen(false);setMessage('')
  }

  function submit(){
    if(!valid)return
    setMessage('')
    startTransition(async()=>{
      const result=await bulkImportERPUsers(parsed.map(row=>({
        username:row.username,phone:row.phone,email:row.email,status:row.status,
        mobile:row.mobile,web:row.web,note:row.note,spc_f:row.spc_f,spc_st:row.spc_st,
      })))
      if(!result.ok){setMessage(result.error);return}
      setMessage(`Đã import ${parsed.length} User.`)
      setRaw('')
      router.refresh()
    })
  }

  return <>
    <button className="button" type="button" onClick={()=>setOpen(true)}>Import TSV</button>
    {open&&<div className="sales-action-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
      <div className="sales-action-dialog user-import-dialog" role="dialog" aria-modal="true" aria-label="Import User TSV">
        <div className="sales-action-dialog-head">
          <div><span className="module-eyebrow">IMPORT USER</span><h3>Nhập tối đa 200 User</h3></div>
          <button type="button" onClick={close} aria-label="Đóng">×</button>
        </div>
        <p>Dán 9 cột theo đúng thứ tự: Username · SĐT · Email · Trạng thái · Mobile · Web · Ghi chú · SPC_F · SPC_ST.</p>
        <textarea
          className="user-import-textarea"
          value={raw}
          onChange={e=>setRaw(e.target.value)}
          placeholder={'user01\t098...\tmail@example.com\tActive\t1\t1\tGhi chú\tSPC_F...\tSPC_ST...'}
          rows={9}
        />
        <div className="user-import-summary">
          <span><b>{parsed.length}</b> dòng</span>
          <span className={errorCount?'danger-text':'success-text'}><b>{errorCount}</b> lỗi</span>
          <span>Tối đa 200</span>
        </div>
        {parsed.length>0&&<div className="user-import-preview">
          <table className="table">
            <thead><tr><th>Dòng</th><th>Username</th><th>SĐT</th><th>Status</th><th>Mobile</th><th>Web</th><th>SPC</th><th>Kiểm tra</th></tr></thead>
            <tbody>{parsed.slice(0,20).map(row=><tr key={row.line}>
              <td>{row.line}</td><td><b>{row.username||'—'}</b></td><td>{row.phone||'—'}</td><td>{row.status}</td>
              <td>{row.mobile?'✓':'—'}</td><td>{row.web?'✓':'—'}</td><td>{row.spc_f||row.spc_st?'Có':'—'}</td>
              <td>{row.errors.length?<span className="danger-text">{row.errors.join(' · ')}</span>:<span className="success-text">OK</span>}</td>
            </tr>)}</tbody>
          </table>
          {parsed.length>20&&<small>Đang xem 20/{parsed.length} dòng đầu.</small>}
        </div>}
        {message&&<div className={message.startsWith('Đã import')?'success-text':'error-box compact'}>{message}</div>}
        <div className="form-actions">
          <button className="button" type="button" onClick={close} disabled={pending}>Đóng</button>
          <button className="button primary" type="button" onClick={submit} disabled={!valid||pending}>
            {pending?'Đang import...':`Import ${parsed.length||0} User`}
          </button>
        </div>
      </div>
    </div>}
  </>
}
