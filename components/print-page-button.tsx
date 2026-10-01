'use client'

export function PrintPageButton({label='In'}:{label?:string}){
  return <button className="button small" type="button" onClick={()=>window.print()}>
    {label}
  </button>
}
