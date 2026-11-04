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
      aria-label={'Sao chép '+kind} title={available?'Sao chép vào bộ nhớ tạm':'Chưa lưu '+kind}>
      {busy?'Đang sao chép…':'Sao chép '+kind}
    </button>
    {feedback&&<small role="status" className="spc-copy-feedback">{feedback}</small>}
  </span>
}
