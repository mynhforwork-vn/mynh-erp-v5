import assert from 'node:assert/strict'
import {build} from 'esbuild'
import path from 'node:path'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import os from 'node:os'
const entry=path.join(process.cwd(),'lib/table-row-highlights.ts')
const dir=mkdtempSync(path.join(os.tmpdir(),'table-marking-rule-'))
const outfile=path.join(dir,'rules.mjs')
await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile})
const {
 getRowDecoration,highlightRuleMatches,validateHighlightRule
}=await import(pathToFileURL(outfile).href)
const mk=(id,priority,conditions,color,match_mode='all')=>({
 id,title:'Kiểm thử '+id,enabled:true,priority,match_mode,conditions,color
})
const data={warehouse:'BG',status:'Đã nhập kho',sku_mapped:false,quantity:3,order_date:'2026-11-12'}
const slow=mk('slow',20,[{field:'warehouse',operator:'eq',value:'BG'}],'blue')
const fast=mk('fast',1,[{field:'status',operator:'contains',value:'DA NHAP KHO'}],'green')
assert.equal(getRowDecoration('warehouse_receive',data,undefined,[slow,fast]),'green',
  'lower numeric priority wins')
assert.equal(getRowDecoration('warehouse_receive',data,
 {row_key:'abc',pinned:false,color:'pink'},[slow,fast]),'pink',
 'manual highlight overrides automatic rules')
const mixed=mk('mixed',3,[
 {field:'warehouse',operator:'eq',value:'HN'},
 {field:'sku_mapped',operator:'eq',value:false}
],'yellow','any')
assert.equal(highlightRuleMatches(mixed,data,'warehouse_receive'),true,
 'OR accepts one matching condition')
const all=mk('all',3,mixed.conditions,'purple')
assert.equal(highlightRuleMatches(all,data,'warehouse_receive'),false,
 'AND requires all conditions')
const qty=mk('quantity',3,[{field:'quantity',operator:'gt',value:2}],'blue')
assert.equal(highlightRuleMatches(qty,data,'warehouse_receive'),true)
assert.equal(highlightRuleMatches(qty,{...data,quantity:null},'warehouse_receive'),false)
const bad=mk('unsafe',5,[{field:'__proto__',operator:'contains',value:'x'}],'green')
assert.throws(()=>validateHighlightRule('warehouse_receive',bad),/Trường/)
assert.equal(getRowDecoration('warehouse_receive',data,undefined,[bad]),null,
 'unknown field is safely ignored')
const tooMany=mk('too many',5,Array.from({length:7},()=>({
 field:'status',operator:'eq',value:'Đã nhập kho'
})),'yellow')
assert.throws(()=>validateHighlightRule('warehouse_receive',tooMany),/6 điều kiện/)
const invisible={...fast,enabled:false}
assert.equal(getRowDecoration('warehouse_receive',data,undefined,[invisible]),null)
console.log('PASS: row highlights manual priority, AND/OR, Vietnamese accent, typed comparisons and rule validation')
