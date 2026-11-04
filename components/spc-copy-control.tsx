'use client'
import { useEffect, useState } from 'react'

type Kind='SPC_ST'|'SPC_F'
export function SpcCopyControl({userId,kind,available}:{userId:string,kind:Kind,available:boolean}){
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  useEffect(()=>{
    if(!feedback)return
    const handle=window.setTimeout(()=>setFeedback(''),5000)
    return ()=>window.clearTimeout(handle)
  },[feedback])
  async function copy(){
    if(busy||!available)return
    setBusy(true)
    setFeedback('')
    try{
      if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable')
      const response=await fetch('/api/users/spc/copy',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user_id:userId,kind}),
      })
      if(!response.ok)throw new Error('copy_denied')
      const result:unknown=await response.json()
      if(!result||typeof result!=='object'||!('secret' in result)
        ||typeof result.secret!=='string'||!result.secret)throw new Error('empty')
      // Kept only in this click handler, never rendered, logged or persisted.
      await navigator.clipboard.writeText(result.secret)
      setFeedback('Đã sao chép')
    }catch{
      setFeedback('Không thể sao chép')
    }finally{
      setBusy(false)
    }
  }
  return <span className="spc-copy-control">
    <button type="button" className="spc-copy-button" disabled={!available||busy} onClick={copy}
      aria-label={(busy?'Đang sao chép ': 'Sao chép ')+kind}
      title={busy?'Đang sao chép '+kind:available?'Sao chép '+kind:'Chưa lưu '+kind}
      aria-busy={busy}>
      <svg className="spc-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="8" width="12" height="12" rx="2"/>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
      </svg>
    </button>
    {feedback&&<small role="status" className="spc-copy-feedback">{feedback}</small>}
  </span>
}
