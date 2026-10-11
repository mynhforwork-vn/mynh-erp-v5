'use client'

import {useEffect,useRef,useState} from 'react'

// Next.js App Router can replace the server-rendered toolbar on a soft
// navigation while preserving the client table instance. Rebind the portal
// to the current, connected toolbar rather than holding a detached node.
export function usePurchaseToolbarRoot(id:string){
  const [root,setRoot]=useState<HTMLElement|null>(null)
  const current=useRef<HTMLElement|null>(null)
  useEffect(()=>{
    const find=()=>{
      const next=document.getElementById(id)
      if(next===current.current)return
      current.current=next
      setRoot(next)
    }
    find()
    const observer=new MutationObserver(()=>{
      if(!current.current?.isConnected||document.getElementById(id)!==current.current)find()
    })
    observer.observe(document.body,{childList:true,subtree:true})
    window.addEventListener('popstate',find)
    return ()=>{
      observer.disconnect()
      window.removeEventListener('popstate',find)
      current.current=null
    }
  },[id])
  return root
}
