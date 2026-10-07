'use client'

import { useEffect,useState } from 'react'

const KEY='mynh-desktop-sidebar-collapsed-v1'

export function SidebarCollapseToggle(){
  const [collapsed,setCollapsed]=useState(false)

  useEffect(()=>{
    const shell=document.querySelector('.brand-shell-v1')
    if(!shell)return
    const saved=window.localStorage.getItem(KEY)==='1'
    setCollapsed(saved)
    shell.classList.toggle('desktop-sidebar-collapsed',saved)
    return ()=>shell.classList.remove('desktop-sidebar-collapsed')
  },[])

  function toggle(){
    const next=!collapsed
    setCollapsed(next)
    window.localStorage.setItem(KEY,next?'1':'0')
    document.querySelector('.brand-shell-v1')?.classList.toggle('desktop-sidebar-collapsed',next)
  }

  return <button
    type="button"
    className="sidebar-collapse-toggle"
    onClick={toggle}
    aria-label={collapsed?'Mở rộng thanh điều hướng':'Thu nhỏ thanh điều hướng'}
    title={collapsed?'Mở rộng thanh điều hướng':'Thu nhỏ thanh điều hướng'}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed?<path d="m9 6 6 6-6 6"/>:<path d="m15 6-6 6 6 6"/>}
    </svg>
  </button>
}
