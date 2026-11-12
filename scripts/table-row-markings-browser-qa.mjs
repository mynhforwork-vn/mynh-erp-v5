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
const legacyStyles=readFileSync(path.join(root,'app/styles/p1-purchase-tables.css'),'utf8')+
  '\n'+readFileSync(path.join(root,'app/styles/warehouse-intake-preview.css'),'utf8')
const markingStyles=readFileSync(path.join(root,'app/styles/table-row-markings.css'),'utf8')
const styles=legacyStyles+'\n'+markingStyles
assert.match(markingStyles,/display:table!important/,
 'row marking styles must retain native table structure')
assert.doesNotMatch(markingStyles,/display:grid!important/,
 'row marking must not convert table rows to cards')
assert.doesNotMatch(markingStyles,/overflow-x:auto!important/,
 'row marking stylesheet must not add horizontal scrolling')
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
  await page.getByRole('button',{name:'Chọn dòng'}).click()
  await page.getByRole('checkbox',{name:'Đánh dấu dòng 1'}).check()
  await page.getByRole('checkbox',{name:'Đánh dấu dòng 2'}).check()
  await page.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
  assert.equal(await page.getByText('2 dòng đã chọn').count(),1)
  const layout=await page.getByRole('button',{name:'Tô Vàng nhạt'}).evaluate(node=>{
    const swatch=node.getBoundingClientRect()
    const dropdown=node.closest('.table-row-marking-dropdown')
    const menu=dropdown?.getBoundingClientRect()
    const group=node.closest('.table-row-marking-toolbar')?.getBoundingClientRect()
    return {
      viewport:{w:innerWidth,h:innerHeight},
      swatch:{x:swatch.x,y:swatch.y,width:swatch.width,height:swatch.height},
      menu:menu?{x:menu.x,y:menu.y,width:menu.width,height:menu.height,scrollHeight:dropdown?.scrollHeight,scrollTop:dropdown?.scrollTop}:null,
      group:group?{x:group.x,y:group.y,width:group.width,height:group.height}:null
    }
  })
  assert.ok(layout.swatch.x>=0&&layout.swatch.x+layout.swatch.width<=layout.viewport.w&&
    layout.swatch.y>=0&&layout.swatch.y+layout.swatch.height<=layout.viewport.h,
    'color palette must be clickable at '+width+' '+JSON.stringify(layout))
  await page.getByRole('button',{name:'Tô Vàng nhạt'}).click()
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
  await page.getByRole('button',{name:'Quy tắc (0)'}).click()
  await page.getByRole('button',{name:'+ Tạo quy tắc'}).click()
  await page.getByPlaceholder('Ví dụ: Đơn bỏ qua kho').fill('Ưu tiên kho BG')
  await page.getByRole('combobox',{name:'Trường điều kiện 1'}).selectOption('warehouse')
  await page.getByRole('textbox',{name:'Giá trị điều kiện 1'}).fill('BG')
  await page.getByRole('button',{name:'Lưu quy tắc'}).click()
  await page.getByText('Ưu tiên kho BG').waitFor()
  assert.equal(await page.getByText('2/3 dòng khớp').count(),0,
   'saved editor should close after creating rule')
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  assert.ok(overflow<=2,'mobile/tablet/desktop no page overflow '+width+' diff='+overflow)
  assert.deepEqual(errors,[],'browser runtime '+width)
  await page.close()
 }

 // Preserve semantic table structure; every cell remains present at each breakpoint.
 // A visual layout test on the actual signed-in Preview is still required before release.
 for(const width of [320,390,568,768,900,1366]){
  const page=await browser.newPage({viewport:{width,height:844}})
  const fields=['number','order','username','device','time','product','cod','tracking','voucher','status']
  const receiptCols=['order','sku','product','purchase','sale','status']
  const htmlLayout='<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>body{margin:0;font-family:Arial,sans-serif}.brand-shell-v1{width:100%}.order-table-card{width:100%}.warehouse-receive-table-lane{container:warehouse-lane / inline-size;width:100%}table{width:100%;table-layout:fixed;border-collapse:collapse}td,th{padding:3px;border:1px solid #ddd}</style>'+
    '<style>'+styles+'</style></head><body><div class="brand-shell-v1">'+
    '<div class="order-table-card"><table class="table order-table mynh-p1-semantic-table with-row-mark-actions">'+
    '<thead><tr>'+fields.map(f=>'<th>'+f+'</th>').join('')+'</tr></thead><tbody><tr>'+
    fields.map(f=>'<td data-order-col="'+f+'" class="'+(f==='order'?'p1-order-identity-cell':'')+'">'+
      (f==='order'?'<a class="table-link">261011BPY3F7P4</a>':'Giá trị '+f)+'</td>').join('')+
    '</tr></tbody></table></div><div class="warehouse-receive-screen"><div class="warehouse-receive-table-lane">'+
    '<div class="warehouse-unified-table-wrap"><table class="warehouse-unified-table">'+
    '<thead><tr>'+receiptCols.map(f=>'<th>'+f+'</th>').join('')+'</tr></thead><tbody><tr>'+
    receiptCols.map(f=>'<td data-col="'+f+'">'+
      (f==='order'?'<button class="table-link">261011BPY3F7P4</button>':'Giá trị '+f)+'</td>').join('')+
    '</tr></tbody></table></div></div></div></div></body></html>'
  await page.setContent(htmlLayout,{waitUntil:'load'})
  const state=await page.evaluate(()=>{
    const purchase=document.querySelector('.order-table-card table')
    const wh=document.querySelector('.warehouse-unified-table')
    return {
      purchaseCells:purchase.querySelectorAll('tbody td[data-order-col]').length,
      warehouseCells:wh.querySelectorAll('tbody td[data-col]').length,
      purchaseTable:getComputedStyle(purchase).display,
      warehouseTable:getComputedStyle(wh).display,
      purchaseRow:getComputedStyle(purchase.querySelector('tbody tr')).display,
      warehouseRow:getComputedStyle(wh.querySelector('tbody tr')).display,
      purchaseCell:getComputedStyle(purchase.querySelector('tbody td')).display,
      warehouseCell:getComputedStyle(wh.querySelector('tbody td')).display,
      codeWrap:getComputedStyle(purchase.querySelector('td[data-order-col="order"] .table-link')).whiteSpace,
      missing:[...document.querySelectorAll('tbody td')].filter(el=>getComputedStyle(el).display==='none').length
    }
  })
  assert.equal(state.purchaseCells,10,'all purchase columns retained '+width)
  assert.equal(state.warehouseCells,6,'all warehouse columns retained '+width)
  assert.equal(state.missing,0,'no hidden data cells '+width)
  assert.equal(state.purchaseTable,'table','purchase must remain a native table '+width)
  assert.equal(state.warehouseTable,'table','warehouse must remain a native table '+width)
  assert.equal(state.purchaseRow,'table-row','purchase must retain tr '+width)
  assert.equal(state.warehouseRow,'table-row','warehouse must retain tr '+width)
  assert.equal(state.purchaseCell,'table-cell','purchase must retain td '+width)
  assert.equal(state.warehouseCell,'table-cell','warehouse must retain td '+width)
  assert.equal(state.codeWrap,'nowrap','order code stays on one line '+width)
  await page.close()
 }

 const readonly=await browser.newPage({viewport:{width:375,height:812}})
 await readonly.setContent(html(true),{waitUntil:'load'})
 await readonly.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
 await readonly.getByRole('button',{name:'Chọn dòng'}).click()
 await readonly.getByRole('checkbox',{name:'Đánh dấu dòng 1'}).check()
 await readonly.getByRole('button',{name:'Mở highlight và quy tắc'}).click()
 await readonly.getByRole('button',{name:'Tô Xanh lam nhạt'}).click()
 await readonly.waitForFunction(()=>document.querySelectorAll('tr[data-mark-color="blue"]').length===1)
 await readonly.getByRole('button',{name:'Ghim',exact:true}).click()
 await readonly.waitForFunction(()=>document.querySelectorAll('button.table-row-mark-icon.active').length===1)
 await readonly.getByRole('button',{name:'Quy tắc (0)'}).click()
 await readonly.getByRole('button',{name:'+ Tạo quy tắc'}).click()
 await readonly.getByPlaceholder('Ví dụ: Đơn bỏ qua kho').fill('Đơn HN')
 await readonly.getByRole('combobox',{name:'Trường điều kiện 1'}).selectOption('warehouse')
 await readonly.getByRole('textbox',{name:'Giá trị điều kiện 1'}).fill('HN')
 await readonly.waitForFunction(()=>document.querySelectorAll('tr[data-mark-color="yellow"]').length===1)
 await readonly.getByRole('button',{name:'Áp dụng thử'}).click()
 await readonly.getByText('Đơn HN').waitFor()
 await readonly.waitForFunction(()=>document.querySelectorAll('tr[data-mark-color="yellow"]').length===1)
 assert.equal((await readonly.evaluate(()=>window.__markStore?.calls||[])).length,0,
   'read-only preview must not call any write API')
 await readonly.close()
 console.log('PASS: one-click colors, live draft rule highlight and local read-only trials without writes, 6 viewports')
}finally{await browser.close()}
