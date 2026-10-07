'use client'

import Link from 'next/link'
import { useEffect,useRef,useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function UserIcon(){
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3"/>
    <path d="M5 20c.6-4.3 3-6.5 7-6.5s6.4 2.2 7 6.5"/>
  </svg>
}
function KeyIcon(){
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="15" r="4"/>
    <path d="m11 12 9-9M16 7l2 2M14 9l2 2"/>
  </svg>
}
function LogoutIcon(){
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 4H5v16h5"/>
    <path d="M14 8l4 4-4 4M18 12H9"/>
  </svg>
}
function DotsIcon(){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>
  </svg>
}

function initials(email:string){
  const base=email.split('@')[0]?.trim()||'U'
  const parts=base.split(/[._\-\s]+/).filter(Boolean)
  if(parts.length>=2)return (parts[0][0]+parts[1][0]).toUpperCase()
  return base.slice(0,2).toUpperCase()
}

export function SidebarAccountMenu({email,role}:{email:string;role:string}){
  const [open,setOpen]=useState(false)
  const root=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    if(!open)return
    const onPointer=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false)
    }
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setOpen(false)
    }
    window.addEventListener('pointerdown',onPointer)
    window.addEventListener('keydown',onKey)
    return()=>{
      window.removeEventListener('pointerdown',onPointer)
      window.removeEventListener('keydown',onKey)
    }
  },[open])

  async function logout(){
    await createClient().auth.signOut()
    location.href='/login'
  }

  return <div className="sidebar-account-menu" ref={root}>
    <button
      type="button"
      className={'sidebar-account-trigger'+(open?' open':'')}
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={()=>setOpen(v=>!v)}
    >
      <span className="sidebar-user-avatar" aria-hidden="true">{initials(email)}</span>
      <span className="sidebar-user-copy">
        <b title={email}>{email}</b>
        <small>{role}</small>
      </span>
      <span className="sidebar-user-more"><DotsIcon/></span>
    </button>

    {open&&<div className="sidebar-account-popover" role="menu">
      <div className="sidebar-account-popover-head">
        <span className="sidebar-user-avatar large">{initials(email)}</span>
        <div>
          <b>{email}</b>
          <span>{role}</span>
        </div>
      </div>

      <div className="sidebar-account-popover-items">
        <Link href="/account" role="menuitem" onClick={()=>setOpen(false)}>
          <UserIcon/><span>Thông tin tài khoản</span>
        </Link>
        <Link href="/account#password" role="menuitem" onClick={()=>setOpen(false)}>
          <KeyIcon/><span>Đổi mật khẩu</span>
        </Link>
        <button type="button" role="menuitem" onClick={logout}>
          <LogoutIcon/><span>Đăng xuất</span>
        </button>
      </div>
    </div>}
  </div>
}
