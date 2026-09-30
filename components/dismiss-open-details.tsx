'use client'

import { useEffect } from 'react'

export function DismissOpenDetails(){
  useEffect(()=>{
    function closeOutside(event:PointerEvent){
      const target=event.target as Node|null
      document.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details=>{
        if(target&&details.contains(target))return
        details.removeAttribute('open')
      })
    }

    function closeOnEscape(event:KeyboardEvent){
      if(event.key!=='Escape')return
      document.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details=>{
        details.removeAttribute('open')
      })
    }

    document.addEventListener('pointerdown',closeOutside)
    document.addEventListener('keydown',closeOnEscape)
    return ()=>{
      document.removeEventListener('pointerdown',closeOutside)
      document.removeEventListener('keydown',closeOnEscape)
    }
  },[])

  return null
}
