import type { ReactNode } from 'react'

export function SystemSlidebar({children,className=''}:{children:ReactNode;className?:string}){
  return <aside className={'system-slidebar-v1 '+className} data-system-slidebar="true">{children}</aside>
}
