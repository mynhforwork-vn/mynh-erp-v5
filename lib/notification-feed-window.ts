/**
 * The first 40 rows are the normal notification feed window.
 * Preserve actionable/unread rows outside that window so that the client
 * can show the SAME population as action_total and unread_total.
 * No extra database query, API request or poll is needed.
 */
export type NoticeWindowItem={
  id:string;is_read:boolean;requires_action:boolean;is_resolved:boolean
}
export function selectNotificationWindow<T extends NoticeWindowItem>(
  rows:T[],pageSize:number,offset:number,includePriority:boolean
){
  const items=rows.slice(offset,offset+pageSize)
  const seen=new Set(items.map(row=>row.id))
  const supplemental_items=includePriority?rows.filter(row=>
    !seen.has(row.id)&&((row.requires_action&&!row.is_resolved)||!row.is_read)
  ):[]
  const action_total=rows.filter(row=>row.requires_action&&!row.is_resolved).length
  const unread_total=rows.filter(row=>!row.is_read).length
  return {items,supplemental_items,action_total,unread_total}
}
