'use client'
import { useState } from 'react'
export function CopyOrderButton({text}:{text:string}){const [done,setDone]=useState(false);return <button className="button small" onClick={async()=>{await navigator.clipboard.writeText(text);setDone(true);setTimeout(()=>setDone(false),1200)}}>{done?'✓ Đã sao chép':'Sao chép thông tin'}</button>}
