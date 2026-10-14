/**
 * Shared URL codec for account header filters.
 * One selection remains a plain query value for backwards compatibility.
 * Multiple choices use one JSON-encoded query value (safe for commas in data).
 */
export function readAccountFilterValues(raw:unknown):string[]{
  const text=String(Array.isArray(raw)?raw[0]??'':raw??'').trim()
  if(!text||text==='all')return []
  if(text.startsWith('[')){
    try{
      const parsed=JSON.parse(text)
      if(Array.isArray(parsed))return [...new Set(parsed.filter(
        (v):v is string=>typeof v==='string'&&v.trim()!==''
      ))]
    }catch{}
  }
  return [text]
}
export function writeAccountFilterValues(values:string[]):string{
  const unique=[...new Set(values.filter(Boolean))]
  if(!unique.length)return ''
  return unique.length===1?unique[0]:JSON.stringify(unique)
}
