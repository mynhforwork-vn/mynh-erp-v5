export const ROW_MARK_COLORS=['yellow','blue','green','purple','pink'] as const
export type RowMarkColor=(typeof ROW_MARK_COLORS)[number]
export type MatchMode='ALL'|'ANY'
export type RowRuleField='warehouse'|'status'|'sku_missing'|'item_count'
export type RowRuleOperator='eq'|'neq'|'contains'|'gt'|'lt'|'empty'|'not_empty'
export type RowRuleCondition={field:RowRuleField;op:RowRuleOperator;value:string}
export type RowHighlightRule={
 id:string;title:string;enabled:boolean;priority:number;match_mode:MatchMode;
 color:RowMarkColor;conditions:RowRuleCondition[]
}
export type HighlightRow={id:string;warehouse:string;status:string;sku_missing:boolean;item_count:number}
export type RowMark={row_id:string;pinned:boolean;color:RowMarkColor|null}
const conditionsFields=new Set<RowRuleField>(['warehouse','status','sku_missing','item_count'])
const conditionOps=new Set<RowRuleOperator>(['eq','neq','contains','gt','lt','empty','not_empty'])
const colors=new Set<string>(ROW_MARK_COLORS)
export function validColor(color:unknown):color is RowMarkColor{
 return typeof color==='string'&&colors.has(color)
}
export function validateRuleInput(value:unknown):{
 title:string;enabled:boolean;priority:number;match_mode:MatchMode;
 color:RowMarkColor;conditions:RowRuleCondition[]
}{
 if(!value||typeof value!=='object')throw Error('Quy tắc highlight không hợp lệ')
 const v=value as Record<string,unknown>
 const title=String(v.title??'').trim()
 if(title.length<2||title.length>70)throw Error('Tên quy tắc phải từ 2 đến 70 ký tự')
 if(!validColor(v.color))throw Error('Chọn màu highlight hợp lệ')
 if(typeof v.enabled!=='boolean'||!Number.isInteger(v.priority)||
  (v.priority as number)<1||(v.priority as number)>100||
  !['ALL','ANY'].includes(String(v.match_mode)))throw Error('Thiết lập quy tắc không hợp lệ')
 if(!Array.isArray(v.conditions)||v.conditions.length<1||v.conditions.length>6)
  throw Error('Mỗi quy tắc cần từ 1 đến 6 điều kiện')
 const conditions=v.conditions.map(raw=>{
  if(!raw||typeof raw!=='object')throw Error('Điều kiện highlight không hợp lệ')
  const v=raw as Record<string,unknown>
  if(!conditionsFields.has(v.field as RowRuleField)||!conditionOps.has(v.op as RowRuleOperator))
   throw Error('Trường hoặc phép so sánh không được hỗ trợ')
  if(typeof v.value!=='string'||v.value.length>100)
   throw Error('Giá trị điều kiện quá dài')
  if(['gt','lt'].includes(v.op as string)&&v.field!=='item_count')
   throw Error('Phép so sánh số chỉ áp dụng cho số sản phẩm')
  if(v.field==='item_count'&&!['empty','not_empty'].includes(String(v.op))&&
   !Number.isFinite(Number(v.value)))throw Error('Số sản phẩm phải là số')
  if(v.field==='sku_missing'&&!['empty','not_empty'].includes(String(v.op))&&
   !['true','false'].includes(v.value))throw Error('Điều kiện thiếu SKU phải là có hoặc không')
  return {field:v.field as RowRuleField,op:v.op as RowRuleOperator,value:v.value}
 })
 return {title,enabled:v.enabled as boolean,priority:v.priority as number,
  match_mode:v.match_mode as MatchMode,color:v.color as RowMarkColor,conditions}
}
const norm=(x:unknown)=>String(x??'').trim().toLocaleLowerCase('vi')
export function conditionMatches(row:HighlightRow,c:RowRuleCondition){
 const actual=norm(row[c.field])
 const expected=norm(c.value)
 switch(c.op){
  case 'empty':return !actual
  case 'not_empty':return !!actual
  case 'eq':return actual===expected
  case 'neq':return actual!==expected
  case 'contains':return actual.includes(expected)
  case 'gt':return Number(actual)>Number(expected)
  case 'lt':return Number(actual)<Number(expected)
 }
}
export function ruleMatches(row:HighlightRow,rule:RowHighlightRule){
 if(!rule.enabled)return false
 const tests=rule.conditions.map(c=>conditionMatches(row,c))
 return rule.match_mode==='ALL'?tests.every(Boolean):tests.some(Boolean)
}
export function resolveRowMark(row:HighlightRow,manual:RowMark|null|undefined,rules:RowHighlightRule[]){
 if(manual?.color)return manual.color
 const matching=rules.filter(r=>ruleMatches(row,r)).sort((a,b)=>
  a.priority-b.priority||a.id.localeCompare(b.id))
 return matching[0]?.color??null
}
