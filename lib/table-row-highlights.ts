export type TableMarkScope='warehouse_receive'|'purchase_orders'
export type RowColor='yellow'|'blue'|'green'|'purple'|'pink'
export type MarkOperator='eq'|'neq'|'contains'|'gt'|'lt'|'empty'|'not_empty'
export type MarkMode='all'|'any'
export type RowData=Record<string,string|number|boolean|null|undefined>
export type RowMark={row_key:string,pinned:boolean,color:RowColor|null}
export type RowFlag={row_key:string,flag_type:'attention'|'urgent'|'follow_up',reason:string}
export type HighlightCondition={field:string,operator:MarkOperator,value:string|number|boolean|null}
export type HighlightRule={
  id:string,title:string,enabled:boolean,priority:number,match_mode:MarkMode,
  conditions:HighlightCondition[],color:RowColor
}
export const ROW_COLORS:RowColor[]=['yellow','blue','green','purple','pink']
export const ROW_COLOR_LABELS:Record<RowColor,string>={
  yellow:'Vàng nhạt',blue:'Xanh lam nhạt',green:'Xanh lá nhạt',
  purple:'Tím nhạt',pink:'Hồng nhạt',
}
export const HIGHLIGHT_FIELDS:Record<TableMarkScope,Record<string,{label:string,type:'string'|'number'|'boolean'}>>={
  warehouse_receive:{
    warehouse:{label:'Kho nhận',type:'string'},
    status:{label:'Trạng thái kho',type:'string'},
    sku_mapped:{label:'Đã ghép SKU',type:'boolean'},
    quantity:{label:'Tổng số lượng',type:'number'},
    order_date:{label:'Ngày nhận',type:'string'},
  },
  purchase_orders:{
    order_status:{label:'Trạng thái đơn',type:'string'},
    carrier:{label:'Đơn vị vận chuyển',type:'string'},
    sku_mapped:{label:'Đã ghép SKU',type:'boolean'},
    quantity:{label:'Tổng số lượng',type:'number'},
    order_date:{label:'Ngày đặt hàng',type:'string'},
  },
}
export const MARK_OPERATORS:MarkOperator[]=['eq','neq','contains','gt','lt','empty','not_empty']
const MARK_OPERATOR_LABELS:Record<MarkOperator,string>={
  eq:'Bằng',neq:'Khác',contains:'Chứa',gt:'Lớn hơn',lt:'Nhỏ hơn',
  empty:'Để trống',not_empty:'Không trống',
}
export {MARK_OPERATOR_LABELS}
export function norm(value:unknown){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim()
}
function conditionMatches(condition:HighlightCondition,row:RowData){
  const current=row[condition.field],value=condition.value
  if(condition.operator==='empty')return current===null||current===undefined||current===''
  if(condition.operator==='not_empty')return current!==null&&current!==undefined&&current!==''
  if(condition.operator==='contains')return norm(current).includes(norm(value))
  if(condition.operator==='gt'||condition.operator==='lt'){
    if(current===null||current===undefined||current===''||typeof current==='boolean')return false
    const n=Number(current),v=Number(value)
    if(!Number.isFinite(n)||!Number.isFinite(v))return false
    return condition.operator==='gt'?n>v:n<v
  }
  const match=typeof current==='boolean'||typeof value==='boolean'
    ?current===value
    :typeof current==='number'||typeof value==='number'
      ?Number(current)===Number(value)
      :norm(current)===norm(value)
  return condition.operator==='eq'?match:!match
}
export function validateHighlightRule(scope:TableMarkScope,rule:Omit<HighlightRule,'id'>){
  if(!HIGHLIGHT_FIELDS[scope]||rule.title.trim().length<3||rule.title.trim().length>80)
    throw new Error('Tên quy tắc cần từ 3 đến 80 ký tự')
  if(!ROW_COLORS.includes(rule.color)||!Number.isInteger(rule.priority)||
    rule.priority<1||rule.priority>999||!['all','any'].includes(rule.match_mode))
    throw new Error('Màu, thứ tự hoặc cách kết hợp quy tắc không hợp lệ')
  if(!Array.isArray(rule.conditions)||rule.conditions.length<1||rule.conditions.length>6)
    throw new Error('Mỗi quy tắc cần từ 1 đến 6 điều kiện')
  for(const condition of rule.conditions){
    const fields=HIGHLIGHT_FIELDS[scope]
    // Never treat inherited JS object keys (__proto__, constructor, etc.)
    // as whitelisted database fields.
    const def=Object.prototype.hasOwnProperty.call(fields,condition.field)
      ?fields[condition.field]:undefined
    if(!def||!MARK_OPERATORS.includes(condition.operator))throw new Error('Trường hoặc điều kiện chưa được hỗ trợ')
    if(def.type==='boolean'&&
       (!['eq','neq'].includes(condition.operator)||typeof condition.value!=='boolean'))
      throw new Error('Điều kiện Đã ghép SKU cần giá trị Có hoặc Không')
    if(['gt','lt'].includes(condition.operator)&&
       (def.type!=='number'||typeof condition.value!=='number'||!Number.isFinite(condition.value)))
      throw new Error('Điều kiện số cần giá trị hợp lệ')
    if(!['empty','not_empty'].includes(condition.operator)&&
       (condition.value===null||String(condition.value).length>150||
        typeof condition.value==='object'))
      throw new Error('Giá trị lọc không hợp lệ')
  }
}
export function highlightRuleMatches(rule:HighlightRule,row:RowData,scope:TableMarkScope){
  if(!rule.enabled||!Array.isArray(rule.conditions)||rule.conditions.length===0)return false
  // Also validate loaded rules defensively; never evaluate arbitrary field identifiers.
  try{validateHighlightRule(scope,rule)}catch{return false}
  const flags=rule.conditions.map(c=>conditionMatches(c,row))
  return rule.match_mode==='all'?flags.every(Boolean):flags.some(Boolean)
}
export function getRowDecoration(
 scope:TableMarkScope,row:RowData,mark:RowMark|undefined,rules:HighlightRule[]
){
  if(mark?.color&&ROW_COLORS.includes(mark.color))return mark.color
  const match=[...rules].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))
    .find(rule=>highlightRuleMatches(rule,row,scope))
  return match?.color??null
}
