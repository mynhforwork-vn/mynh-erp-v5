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
const styles=legacyStyles+'\n'+readFileSync(path.join(root,'app/styles/table-row-markings.css'),'utf8')
assert.match(styles,/with-row-mark-actions/,
 'purchase order table must retain the inline icon layout')
assert.match(styles,/@container marked-order-lane \(max-width:980px\)/,
 'narrow purchase lanes must render all cells as complete records')
assert.match(styles,/@container warehouse-lane \(max-width:950px\)/,
 'narrow warehouse lanes must render all cells as complete records')
assert.match(styles,/overflow-x:hidden!important/,
 'warehouse and purchase tables must never scroll horizontally')
assert.doesNotMatch(styles,/overflow-x:auto!important/,
 'highlight styles must not introduce horizontal scrolling')
assert.match(styles,/white-space:nowrap!important/,
 'full order ID must stay on one line')
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

 // Layout regression: no data field may disappear from an order simply
 // because there is no room for all columns in a single horizontal strip.
 for(const width of [320,390,568,768,900]){
  const page=await browser.newPage({viewport:{width,height:844}})
  const fields=['number','order','username','device','time','product','cod','tracking','voucher','status']
  const labels={number:'STT',order:'Mã đơn',username:'User',device:'Thiết bị',time:'Ngày đặt',
    product:'Sản phẩm',cod:'COD',tracking:'Vận chuyển',voucher:'Voucher',status:'Xử lý'}
  const orderCell=field=>field==='order'
    ?'<a class="table-link" href="#">261011BPY3F7P4</a><span class="table-row-mark-inline-tools"><button class="table-row-mark-icon">📌</button><button class="table-row-mark-icon">⚑</button></span>'
    :field==='product'?'Sản phẩm đã đặt với tên hiển thị đầy đủ trên danh sách dữ liệu':labels[field]
  const receiptCols=['order','sku','product','purchase','sale','status']
  const receiptLabels={order:'Mã đơn / Ngày nhận',sku:'SKU bán',product:'Sản phẩm mua',
    purchase:'Giá gốc',sale:'Giá bán',status:'Trạng thái'}
  const receiptValue={order:'<div class="warehouse-unified-order"><div class="warehouse-unified-order-details"><div class="warehouse-unified-order-inline"><button class="table-link">261011BPY3F7P4</button><span class="table-row-mark-inline-tools"><button class="table-row-mark-icon">📌</button><button class="table-row-mark-icon">⚑</button></span></div></div></div>',
    sku:'SKU-ABCD-0001',product:'Sản phẩm mua với tên đủ dài để kiểm tra khả năng hiển thị',purchase:'120.000 ₫',sale:'145.000 ₫',status:'Đã nhận'}
  const markup='<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}*,*::before,*::after{box-sizing:border-box}.brand-shell-v1{width:100%;max-width:100%}.order-table-card{width:100%;max-width:100%}.warehouse-receive-table-lane{container:warehouse-lane / inline-size;width:100%}.warehouse-unified-table-wrap{width:100%;max-width:100%;overflow-x:hidden}table{width:100%;table-layout:fixed;border-collapse:collapse}td,th{padding:5px;border:1px solid #ddd}</style><style>'+
   styles+'</style></head><body><div class="brand-shell-v1"><div class="order-table-card"><table class="table order-table mynh-p1-semantic-table with-row-mark-actions"><colgroup>'+
   fields.map(()=>'<col/>').join('')+'</colgroup><thead><tr>'+fields.map(f=>'<th>'+labels[f]+'</th>').join('')+'</tr></thead><tbody><tr>'+
   fields.map(f=>'<td data-order-col="'+f+'" class="'+(f==='order'?'p1-order-identity-cell':'')+'">'+orderCell(f)+'</td>').join('')+
   '</tr></tbody></table></div><div class="warehouse-receive-screen"><div class="warehouse-receive-table-lane"><div class="warehouse-unified-table-wrap" data-row-marking="true"><table class="warehouse-unified-table" data-row-marking="true"><colgroup>'+
   receiptCols.map(()=>'<col/>').join('')+'</colgroup><thead><tr>'+receiptCols.map(f=>'<th data-col="'+f+'">'+receiptLabels[f]+'</th>').join('')+'</tr></thead><tbody><tr>'+
   receiptCols.map(f=>'<td data-col="'+f+'" data-label="'+receiptLabels[f]+'">'+receiptValue[f]+'</td>').join('')+
   '</tr></tbody></table></div></div></div></div></body></html>'
  await page.setContent(markup,{waitUntil:'load'})
  const state=await page.evaluate(()=>{
    const purchase=document.querySelector('.order-table-card')
    const warehouse=document.querySelector('.warehouse-unified-table-wrap')
    const code=purchase.querySelector('td[data-order-col="order"] .table-link')
    const stockCode=warehouse.querySelector('td[data-col="order"] .table-link')
    return {
      purchaseCells:purchase.querySelectorAll('tbody td[data-order-col]').length,
      warehouseCells:warehouse.querySelectorAll('tbody td[data-col]').length,
      hidden:[...document.querySelectorAll('tbody td')].filter(el=>getComputedStyle(el).display==='none').length,
      widthOver:document.documentElement.scrollWidth-innerWidth,
      purchaseOver:purchase.scrollWidth-purchase.clientWidth,
      warehouseOver:warehouse.scrollWidth-warehouse.clientWidth,
      purchaseNoWrap:getComputedStyle(code).whiteSpace==='nowrap',
      warehouseNoWrap:getComputedStyle(stockCode).whiteSpace==='nowrap',
      orderDisplayed:code.getBoundingClientRect().width>0&&stockCode.getBoundingClientRect().width>0,
      purchaseLayout:getComputedStyle(purchase.querySelector('tbody tr')).display,
      warehouseLayout:getComputedStyle(warehouse.querySelector('tbody tr')).display,
    }
  })
  assert.equal(state.purchaseCells,10,'purchase retains ALL ten cells at '+width)
  assert.equal(state.warehouseCells,6,'warehouse retains ALL six cells at '+width)
  assert.equal(state.hidden,0,'no data cell hidden at '+width)
  assert.ok(state.widthOver<=2&&state.purchaseOver<=2&&state.warehouseOver<=2,
    'no horizontal scroll at '+width+' '+JSON.stringify(state))
  assert.ok(state.purchaseNoWrap&&state.warehouseNoWrap&&state.orderDisplayed,
    'order numbers stay on one line at '+width)
  assert.equal(state.purchaseLayout,'grid','purchase uses complete responsive records at '+width)
  assert.equal(state.warehouseLayout,'grid','warehouse uses complete responsive records at '+width)
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
