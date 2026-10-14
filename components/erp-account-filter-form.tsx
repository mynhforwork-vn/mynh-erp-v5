'use client'

import {useRouter} from 'next/navigation'
import type {FormEvent,ReactNode} from 'react'

/** Bộ lọc Tài khoản chuyển tuyến nội bộ, giữ nguyên tài liệu và vị trí cuộn. */
export function ERPAccountFilterForm({children,className=''}:{
  children:ReactNode
  className?:string
}){
  const router=useRouter()
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const data=new FormData(event.currentTarget)
    const query=new URLSearchParams()
    for(const [key,value] of data.entries()){
      if(typeof value==='string'&&value.trim())query.append(key,value)
    }
    const params=query.toString()
    router.push('/purchase/accounts'+(params?'?'+params:''),{scroll:false})
  }
  return <form className={className} action="/purchase/accounts" method="GET" onSubmit={submit}>
    {children}
  </form>
}
