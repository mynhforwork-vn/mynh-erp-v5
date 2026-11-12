import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {build} from 'esbuild'
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=process.cwd(),tmp=mkdtempSync(path.join(os.tmpdir(),'mark-rows-'))
const input=path.join(tmp,'app.tsx'),bundle=path.join(tmp,'bundle.js')
const markup=String.raw`import React from 'react'
import {createRoot} from 'react-dom/client'
import {TableMarkingToolbar,RowMarkingActions,useTableRowMarking} from '${root}/components/table-row-marking'
const orderIds=[
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000003'
]
const fixture=[
 {id:orderIds[0],data:{warehouse:'BG',status:'Đã nhập kho',sku_mapped:true,quantity:2,order_date:'2026-11-12'}},
 {id:orderIds[1],data:{warehouse:'BG',status:'Bỏ qua kho',sku_mapped:false,quantity:1,order_date:'2026-11-11'}},
 {id:orderIds[2],data:{warehouse:'HN',status:'Dự kiến nhập',sku_mapped:false,quantity:5,order_date:'2026-11-10'}}
]
function Screen(){
 const marks=useTableRowMarking('warehouse_receive',fixture,true,Boolean(window.__preview))
 const sorted=[...fixture].sort((a,b)=>Number(Boolean(marks.markMap.get(b.id)?.pinned))-Number(Boolean(marks.markMap.get(a.id)?.pinned)))
 return <main><TableMarkingToolbar model={marks} scope="warehouse_receive" rows={fixture}/>
  <table aria-label="Danh sách đơn đánh dấu">
   <thead><tr><th>Chọn</th><th>Mã đơn</th><th>Trạng thái</th></tr></thead>
   <tbody>{sorted.map((row,i)=><tr key={row.id} data-row-key={row.id}
     data-mark-color={marks.getDecoration(row.id)||undefined}>
     <td>{marks.mode&&<input type="checkbox" checked={marks.selectedSet.has(row.id)}
       aria-label={'Đánh dấu dòng '+(i+1)}
       onChange={()=>marks.toggle(row.id)}/>}</td>
     <td><button type="button" onClick={()=>window.__opened=(window.__opened||0)+1}>
       {row.id.slice(-4)}</button>
       <RowMarkingActions model={marks} rowId={row.id} label={row.id.slice(-4)}/></td>
     <td>{row.data.status}</td>
   </tr>)}</tbody>
  </table>
 </main>
}
createRoot(document.getElementById('root')).render(<Screen/>)
`;
writeFileSync(input,markup.replace('${root}',root))
await build({
 entryPoints:[input],outfile:bundle,absWorkingDir:root,bundle:true,format:'iife',platform:'browser',
 jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},nodePaths:[path.join(root,'node_modules')],
 plugins:[{name:'mock-mark-requests',setup(plugin){
  plugin.onResolve({filter:/[\/]lib[\/]actions[\/]table-row-markings$/},()=>
    ({path:'mock',namespace:'mark-qa'}))
  plugin.onLoad({filter:/.*/,namespace:'mark-qa'},()=>({loader:'js',contents:String.raw`
const store=()=>window.__markStore??(window.__markStore={marks:[],flags:[],rules:[],calls:[]})
export async function loadTableRowMarkings(){const s=store();return {marks:[...s.marks],flags:[...s.flags],rules:[...s.rules]}}
export async function batchSetTableRowMarks(scope,ids,change){
 const s=store();s.calls.push({name:'marks',ids,change})
 ids.forEach(id=>{
   let prior=s.marks.find(m=>m.row_key===id)||{row_key:id,pinned:false,color:null}
   let next={...prior,...change};
   s.marks=s.marks.filter(m=>m.row_key!==id)
   if(next.pinned||next.color)s.marks.push(next)
 })
 return ids.length
}
export async function batchSetTableRowFlags(scope,ids,flagType,reason){
 const s=store();s.calls.push({name:'flags',ids,flagType,reason})
 ids.forEach(id=>{
   s.flags=s.flags.filter(f=>f.row_key!==id)
   if(flagType)s.flags.push({row_key:id,flag_type:flagType,reason})
 })
 return ids.length
}
export async function saveTableHighlightRule(scope,rule,id){
 const s=store();s.calls.push({name:'rule',rule,id})
 s.rules=s.rules.filter(x=>x.id!==id)
 s.rules.push({...rule,id:id||'e2000000-0000-4000-8000-000000000099'})
}
export async function deleteTableHighlightRule(scope,id){
 const s=store();s.rules=s.rules.filter(r=>r.id!==id)
}
`}))
 }}]
})
const script=readFileSync(bundle,'utf8')
const styles=readFileSync(path.join(root,'app/styles/table-row-markings.css'),'utf8')
assert.match(styles,/with-row-mark-actions[^\n]*col\.p1-order-col-order/,
 'purchase order width must be reserved for inline icons')
assert.match(styles,/warehouse-row-marking-scroll/,
 'warehouse table must scroll locally when lanes shrink')
const base='html,body{margin:0;max-width:100%;overflow-x:hidden;font-family:Arial,sans-serif;color:#365d70}main{max-width:970px;margin:auto;padding:10px}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #e6eef2;text-align:left}tr[data-mark-color=yellow]>td{background:#fff8e3}tr[data-mark-color=blue]>td{background:#eaf4ff}'
const html=(readonly=false)=>'<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+base+styles+'</style></head><body><div id="root"></div><script>window.__preview='+JSON.stringify(readonly)+';</script><script>'+script+'</script></body></html>'
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:['--no-sandbox']})
try{
 for(const [width,height] of [[320,568],[390,844],[568,320],[768,1024],[1366,768],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.setContent(html(),{waitUntil:'load'})
  const iconSize=await page.getByRole('button',{name:'Ghim 0001'}).evaluate(node=>{
    const rect=node.getBoundingClientRect()
    const svg=node.querySelector('svg')?.getBoundingClientRect()
    return {buttonWidth:rect.width,buttonHeight:rect.height,svgWidth:svg?.width||0}
  })
  assert.ok(iconSize.buttonWidth<=20&&iconSize.buttonHeight<=22&&iconSize.svgWidth<=11,
    'row pin/flag icon must remain compact '+width+' '+JSON.stringify(iconSize))
  await page.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
  await page.getByRole('button',{name:'Đánh dấu dòng'}).click()
  await page.getByRole('checkbox',{name:'Đánh dấu dòng 1'}).check()
  await page.getByRole('checkbox',{name:'Đánh dấu dòng 2'}).check()
  await page.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
  assert.equal(await page.getByText('2 dòng đã chọn').count(),1)
  await page.getByLabel('Chọn màu highlight cho các dòng đã chọn').selectOption('yellow')
  await page.waitForFunction(()=>document.querySelectorAll('tr[data-mark-color="yellow"]').length===2)
  const calls=await page.evaluate(()=>window.__markStore?.calls||[])
  assert.deepEqual(calls.filter(c=>c.name==='marks')[0]?.ids.length,2)
  await page.getByRole('button',{name:'Ghim',exact:true}).click()
  await page.waitForFunction(()=>document.querySelectorAll('button.table-row-mark-icon.active').length===2)
  await page.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
  await page.getByRole('button',{name:'Bỏ ghim 0001'}).click()
  await page.waitForFunction(()=>document.querySelectorAll('button.table-row-mark-icon.active').length===1)
  await page.getByRole('button',{name:'Gắn cờ 0001'}).click()
  const flagEditor=page.getByRole('dialog',{name:'Chỉnh cờ cho 0001'})
  await flagEditor.getByRole('textbox',{name:'Lý do'}).fill('Đơn cần kiểm tra trước khi xuất kho')
  await flagEditor.getByRole('button',{name:'Lưu',exact:true}).click()
  await page.waitForFunction(()=>document.querySelectorAll('button.table-row-mark-icon.flagged').length===1)
  await page.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
  await page.getByRole('button',{name:'Quy tắc highlight (0)'}).click()
  await page.getByRole('button',{name:'+ Tạo quy tắc'}).click()
  await page.getByPlaceholder('Ví dụ: Đơn bỏ qua kho').fill('Ưu tiên kho BG')
  await page.getByRole('combobox',{name:'Trường điều kiện 1'}).selectOption('warehouse')
  await page.getByRole('textbox',{name:'Giá trị điều kiện 1'}).fill('BG')
  await page.getByRole('button',{name:'Lưu quy tắc'}).click()
  await page.getByText('Ưu tiên kho BG').waitFor()
  assert.equal(await page.getByText('2/3 dòng đang tải khớp').count(),0,
   'saved editor should close after creating rule')
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  assert.ok(overflow<=2,'mobile/tablet/desktop no page overflow '+width+' diff='+overflow)
  assert.deepEqual(errors,[],'browser runtime '+width)
  await page.close()
 }
 const readonly=await browser.newPage({viewport:{width:375,height:812}})
 await readonly.setContent(html(true),{waitUntil:'load'})
 await readonly.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
 await readonly.getByRole('button',{name:'Đánh dấu dòng'}).click()
 await readonly.getByRole('checkbox',{name:'Đánh dấu dòng 1'}).check()
 await readonly.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
 assert.equal(await readonly.getByRole('button',{name:'Ghim',exact:true}).isDisabled(),false)
 await readonly.getByRole('button',{name:'Ghim',exact:true}).click()
 await readonly.getByText('Chế độ xem trước chỉ cho kiểm tra giao diện').waitFor()
 assert.equal((await readonly.evaluate(()=>window.__markStore?.calls||[])).length,0,
   'read-only preview cannot call writes')
 await readonly.close()
 console.log('PASS: multi-row highlights, pins, rules, six responsive viewports, preview write protection')
}finally{await browser.close()}
