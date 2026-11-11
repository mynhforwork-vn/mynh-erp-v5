import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root=process.cwd()
const tmp=mkdtempSync(path.join(os.tmpdir(),'warehouse-3items-'))
const output=path.join(root,'qa-warehouse-3items')
mkdirSync(output,{recursive:true})
const component=path.join(root,'components/warehouse-intake-workspace.tsx')
const entryPath=path.join(tmp,'fixture.tsx')
const outfile=path.join(tmp,'bundle.js')
const source=[
  "import React from 'react'",
  "import {createRoot} from 'react-dom/client'",
  "import {WarehouseIntakeWorkspace} from "+JSON.stringify(component),
  "const long='Sản phẩm chăm sóc cá nhân dùng hàng ngày - dạng chai 500ml, phiên bản dài tên để kiểm thử cột không bị tràn'",
  "const rows=Array.from({length:8},(_,i)=>({",
  "  id:'10000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),",
  "  shopee_order_id:'261106SPXITEM'+String(i+1).padStart(3,'0'),",
  "  warehouse_status:i===2?'WAREHOUSE_RECEIVED':i===3?'WAREHOUSE_SKIPPED':'READY_TO_TRANSFER',",
  "  cod:document.documentElement.dataset.scenario==='missing-cod'&&i===0?null:50000*(i+1),order_date:'2026-11-01T12:00:00+07:00',created_at:'2026-11-01T12:02:00+07:00',",
  "  shipping_service:'STANDARD',receive_status:'RECEIVED',order_status:'DELIVERED',",
  "  payment_status:i===0?'PARTIAL':'UNPAID',prepaid_amount:i===0?25000:null,prepaid_source_type:i===0?'DEBIT_CARD':null,prepaid_source_label:i===0?'Ngân hàng thử nghiệm':null,",
  "  receive_batch_details:[{receive_batches:{warehouse_id:i<4?'BG':'HN',received_at:'2026-11-06T08:00:00+07:00',warehouses:{code:i<4?'BG':'HN',name:'Kho nhận',address:i<4?'320 Nguyễn Công Hãng':'164 Hồng Mai'}}}],",
  "  order_items:[{id:'20000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),product_name:long,sku:'SRC-'+i,variant:'Phân loại mẫu 500ml',quantity:2,original_price:50000,final_price:35000,inventory_multiplier:1,product_variant_id:(i===1||i===2||i===3||i===4)?'V-SKU':null,product_variants:(i===1||i===2||i===3||i===4)?{id:'V-SKU',variant_name:'Mẫu',sale_price:90000,products:{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'}}:null},",
  "  {id:'30000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),product_name:'Sữa tắm hương hoa nhài',sku:'SRC-OTHER',variant:'Dạng chai',quantity:1,product_variant_id:(i===1||i===2||i===3||i===4)?'V-SKU':null,product_variants:(i===1||i===2||i===3||i===4)?{id:'V-SKU',variant_name:'Mẫu',products:{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'}}:null}]",
  '}))',
  "function Fixture(){const [status,setStatus]=React.useState('all');const live=document.documentElement.dataset.live==='true';const scenario=document.documentElement.dataset.scenario||'';const sourceRows=scenario==='hn-done'?rows.map((r,i)=>i>=4?{...r,warehouse_status:'WAREHOUSE_RECEIVED'}:r):scenario==='all-done'?rows.map(r=>({...r,warehouse_status:'WAREHOUSE_RECEIVED'})):scenario==='uneven'?rows.map((r,i)=>i>=1&&i<=3?{...r,receive_batch_details:[{receive_batches:{...r.receive_batch_details[0].receive_batches,warehouse_id:'HN',warehouses:{code:'HN',name:'Kho nhận',address:'164 Hồng Mai'}}}]}:r):scenario==='dense-uneven'?rows.map((r,i)=>i===3?{...r,receive_batch_details:[{receive_batches:{...r.receive_batch_details[0].receive_batches,warehouse_id:'HN',warehouses:{code:'HN',name:'Kho nhận',address:'164 Hồng Mai'}}}]}:r):scenario==='bulk'?rows.map((r,i)=>i===0?{...r,order_items:r.order_items.map(item=>({...item,product_variant_id:'V-SKU',product_variants:{id:'V-SKU',variant_name:'Mẫu',sale_price:90000,products:{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'}}}))}:r):scenario==='skip-mixed'?rows.map((r,i)=>i===0?{...r,order_items:r.order_items.map((item,j)=>j===0?{...item,product_variant_id:'V-SKU',product_variants:{id:'V-SKU',variant_name:'Mẫu',sale_price:90000,products:{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'}}}:item)}:r):scenario==='corrected-mapping'?rows.map((r,i)=>i===4?{...r,order_items:r.order_items.map((item,j)=>j===0?{...item,product_variant_id:'V-ALT',inventory_multiplier:3,product_variants:{id:'V-ALT',variant_name:'Chai',sale_price:65000,products:{id:'30000000-0000-4000-8000-000000000002',sku:'ALT-02',name:'SKU bán khác'}}}:item)}:r):scenario==='sparse'?rows.filter((r,i)=>i===0||i===4):scenario==='two-each'?rows.filter((r,i)=>[0,1,4,5].includes(i)):scenario==='three-each'?rows.filter((r,i)=>[0,1,2,4,5,6].includes(i)):scenario==='single-one'?rows.filter((r,i)=>i===0):scenario==='single-two'?rows.filter((r,i)=>i<=1):rows; const filtered=status==='done'?sourceRows.filter(r=>r.warehouse_status!=='READY_TO_TRANSFER'):sourceRows; const itemDecisions=Object.fromEntries([...rows[4].order_items.map((item,i)=>[item.id,{order_item_id:item.id,order_id:rows[4].id,product_variant_id:scenario==='corrected-mapping'&&i===0?'V-ALT':'V-SKU',decision:i===0?'IN':'SKIP',sale_price:scenario==='corrected-mapping'&&i===0?65000:90000,multiplier:scenario==='corrected-mapping'&&i===0?3:1,skip_reason:i===0?null:'Không nhập mẫu',processing_state:'DRAFT'}]),...(scenario==='skip-mixed'?sourceRows[0].order_items.map((item,i)=>[item.id,{order_item_id:item.id,order_id:sourceRows[0].id,product_variant_id:i===0?'V-SKU':null,decision:i===0?'IN':'SKIP',sale_price:i===0?90000:0,multiplier:1,skip_reason:i===0?null:'Không quản lý tồn sản phẩm tặng',processing_state:'DRAFT'}]):[])]); const historySuggestions=scenario==='history'?{[sourceRows[0].order_items[0].id]:[ {variant_id:'V-SKU',sku:'TEST-01',product_name:'Đã map',variant_name:'Mẫu',multiplier:2,history_count:3,match_kind:'exact'}, {variant_id:'V-ALT',sku:'ALT-02',product_name:'SKU bán khác',variant_name:'Chai',multiplier:1,history_count:1,match_kind:'sku_variant'} ]}:{}; return <><header className='page-head tracking-page-head-v2'><div><span className='module-eyebrow'>VẬN HÀNH KHO</span><h1>Nhập kho</h1><p>Theo Kho nhận · Bóc tách SKU · Nhập kho</p></div></header><div className='warehouse-receive-date-toolbar fixture-date'>Tất cả · Hôm nay · Tuần này · 7 ngày · 30 ngày · Tháng này · Năm nay</div><section className='tracking-command-center-v2 warehouse-command-center'><div className='tracking-status-strip-v2 wh-native-status-kpis'>{['Tất cả','Chờ bóc tách','Chờ nhập kho','Đã xử lý'].map((v,i)=><div key={v} className='tracking-status-metric'><span>{v}</span><b>{[8,5,1,2][i]}</b><small>Kho nhận · Bóc tách SKU</small></div>)}</div></section><div className='fixture-command'><button className='fixture-all' onClick={()=>setStatus('all')}>Tất cả</button><button className='fixture-done' onClick={()=>setStatus('done')}>Đã xử lý</button></div><WarehouseIntakeWorkspace rows={filtered} variants={[{id:'V-SKU',variant_name:'Mẫu',sale_price:90000,products:{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'}},{id:'V-ALT',variant_name:'Chai',sale_price:65000,products:{id:'30000000-0000-4000-8000-000000000002',sku:'ALT-02',name:'SKU bán khác'}}]}  suggestions={historySuggestions} itemDecisions={itemDecisions} skuProducts={[{id:'30000000-0000-4000-8000-000000000001',sku:'TEST-01',name:'Đã map'},{id:'30000000-0000-4000-8000-000000000002',sku:'ALT-02',name:'SKU bán khác'}]} auditLogs={[]} previewOnly={!live} simulate={!live} showProcessedOnly={status==='done'}/></>}",
  "createRoot(document.getElementById('root')).render(<Fixture/>)",
].join('\n')
writeFileSync(entryPath,source)
await build({
  entryPoints:[entryPath],outfile,absWorkingDir:root,bundle:true,
  platform:'browser',format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},
  alias:{'@':root},nodePaths:[path.join(root,'node_modules')],
  plugins:[{name:'mock-warehouse-actions',setup(es){
    es.onResolve({filter:/[\\/]lib[\\/]actions[\\/]warehouse$/},()=>({path:'warehouse-actions',namespace:'warehouse-qa'}))
    es.onResolve({filter:/[\\/]lib[\\/]actions[\\/]warehouse-item-decisions$/},()=>({path:'item-actions',namespace:'warehouse-qa'}))
    es.onResolve({filter:/[\\/]lib[\\/]actions[\\/]warehouse-bulk-receive$/},()=>({path:'bulk-actions',namespace:'warehouse-qa'}))
    es.onResolve({filter:/^next\/navigation$/},()=>({path:'next-navigation',namespace:'warehouse-qa'}))
    es.onLoad({filter:/.*/,namespace:'warehouse-qa'},args=>({
      contents:args.path==='next-navigation'
        ? 'export function useRouter(){return {refresh(){window.__refreshCalls=(window.__refreshCalls||0)+1}}}'
        : args.path==='item-actions'
        ? 'export async function saveWarehouseItemDecision(input){window.__warehouseCalls=(window.__warehouseCalls||[]);window.__warehouseCalls.push({name:"save",input});return {product_variant_id:input.variantId||"V-SKU",decision:input.decision,quantity:2,order_item_id:input.orderItemId}} export async function addWarehouseVariantAndMap(input){window.__warehouseCalls=(window.__warehouseCalls||[]);window.__warehouseCalls.push({name:"add_variant",input});return {product_variant_id:"V-NEW-CLASS",order_item_id:input.orderItemId,decision:input.decision}} export async function skipWarehouseItemWithoutSku(input){window.__warehouseCalls=(window.__warehouseCalls||[]);window.__warehouseCalls.push({name:"skip",input});if(window.__skipFail)throw new Error("Đơn không còn ở trạng thái chờ xử lý kho");return {order_item_id:input.orderItemId,decision:"SKIP",product_variant_id:null,quantity:0,skip_reason:input.reason}} export async function finalizeWarehouseItemDecisions(id){window.__warehouseCalls.push({name:"finalize",id});return {warehouse_status:"WAREHOUSE_MIXED",in_items:1,skip_items:1,transaction_count:1}}'
        : args.path==='bulk-actions'
        ? 'export async function bulkReceiveWarehouseOrders(input){window.__bulkCalls=window.__bulkCalls||[];window.__bulkCalls.push(input);if(window.__bulkDelay)await new Promise(resolve=>setTimeout(resolve,180));if(window.__bulkFail)return {succeeded:[],failed:input.orderIds.map(id=>({orderId:id,message:"Đơn không còn ở trạng thái chờ nhập kho"})),legacyOrders:0,itemDecisionOrders:0,stockItemLines:0,skippedItemLines:0};if(window.__bulkPartial){return {succeeded:input.orderIds.slice(0,1),failed:input.orderIds.slice(1).map(id=>({orderId:id,message:"Cần kiểm tra lại trạng thái"})),legacyOrders:1,itemDecisionOrders:0,stockItemLines:2,skippedItemLines:0}}return {succeeded:input.orderIds,failed:[],legacyOrders:input.orderIds.length,itemDecisionOrders:0,stockItemLines:2,skippedItemLines:0}}'
        : 'export async function mapWarehouseOrderItem(){throw new Error("blocked")} export async function receiveOrdersIntoWarehouse(){throw new Error("blocked")} export async function skipWarehouseOrder(){throw new Error("blocked")}',
      loader:'js'
    }))
  }}]
})
// Follow the actual Next.js global CSS import order, then the page-scoped
// warehouse stylesheet. Alphabetical concatenation masked cascade regressions.
const globalCss=readFileSync(path.join(root,'app/globals.css'),'utf8')
const cssFiles=[...globalCss.matchAll(/@import ['"]\.\/styles\/([^'"]+\.css)['"]/g)].map(match=>match[1])
const css=[...cssFiles,'warehouse-intake-preview.css','warehouse-intake-detail-preview.css']
  .map(file=>readFileSync(path.join(root,'app/styles',file),'utf8')).join('\n')
const harnessCss=[
  'html,body{margin:0;padding:0;max-width:100%;background:#f5f8fb;font-family:Arial,sans-serif}',
  '#root{box-sizing:border-box;max-width:100%;min-width:0}',
  '.shell.brand-shell-v1{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:100dvh!important;min-height:0!important}',
  '.shell.brand-shell-v1>.main{box-sizing:border-box!important;min-height:0!important;height:100dvh!important;width:calc(100% - 245px)!important;margin-left:245px!important;overflow:hidden!important}',
  '.fixture-date{box-sizing:border-box;flex:0 0 auto;min-height:39px;max-height:39px;border:1px solid #d7e1e9;background:white;font-size:11px;padding:10px;margin-bottom:6px}',
  '.fixture-command{display:flex;gap:6px;flex:0 0 auto;min-height:30px;margin:0 0 5px}',
  '.fixture-command button{border:1px solid #cbd8e3;background:white;border-radius:5px;padding:5px 10px}',
  '@media(max-width:900px){.shell.brand-shell-v1>.main{margin-left:0!important;width:100%!important}}',
].join('\n')
const html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+harnessCss+'</style></head><body><div class="shell brand-shell-v1"><main class="main"><div id="root" class="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen"></div></main></div><script>'+readFileSync(outfile,'utf8')+'</script></body></html>'
async function pickDetailClassification(panel,sku){
  const change=panel.getByRole('button',{name:'Đổi SKU sản phẩm'})
  if(await change.count())await change.click()
  await panel.locator('.warehouse-detail-v2-product-results button').filter({hasText:sku}).first().click()
  assert.equal(await panel.locator('.warehouse-detail-v2-classification-results').count(),1,
    'classification step appears only after product SKU')
  await panel.locator('.warehouse-detail-v2-classification-results button').filter({hasText:sku}).first().click()
}
async function pickInlineClassification(picker,sku,fromHistory=false){
  const change=picker.locator('.warehouse-sku-product-selected > button')
  if(await change.count())await change.click()
  await picker.locator('.warehouse-sku-classification-results').waitFor({state:'hidden',timeout:8000})
  const browserState=await picker.evaluate(el=>({
    text:el.innerText.slice(0,850),
    skuList:el.querySelectorAll('.warehouse-sku-sku-results').length,
    classes:[...el.querySelectorAll('[class*="warehouse-sku"]')].map(x=>x.className).slice(0,20)
  })).catch(error=>({error:String(error)}))
  assert.equal(browserState.skuList,1,
    'after changing SKU, product search step must appear before classification: '+JSON.stringify(browserState))
  await picker.locator('.warehouse-sku-sku-results').waitFor({state:'visible',timeout:8000})
  assert.equal(await picker.count(),1,'changing SKU must keep the picker open')
  const candidates=await picker.locator('.warehouse-sku-sku-results button').allTextContents()
  assert.ok(candidates.some(name=>name.includes(sku)),
    'parent SKU '+sku+' must be available, got '+JSON.stringify(candidates))
  await picker.locator('.warehouse-sku-sku-results button').filter({hasText:sku}).first().click()
  assert.equal(await picker.locator('.warehouse-sku-classification-results').count(),1,
    'classification step appears only after product SKU')
  if(fromHistory&&await picker.locator('.warehouse-inline-sku-history-options>button').count())
    await picker.locator('.warehouse-inline-sku-history-options>button').first().click()
  else
    await picker.locator('.warehouse-sku-classification-results button').filter({hasText:sku}).first().click()
}

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN, args:['--no-sandbox']})
try {
  for(const [width,height] of [[320,568],[360,800],[390,844],[414,896],[568,320],[768,1024],[820,1180],[1024,768],[1180,820],[1280,800],[1366,768],[1440,900],[1536,864],[1920,1080]]){
    const page=await browser.newPage({viewport:{width,height}})
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.setContent(html,{waitUntil:'load'})
    await page.locator('.warehouse-unified-table tbody tr').first().waitFor({timeout:20000})
    const cards=page.locator('.warehouse-unified-group')
    assert.equal(await cards.count(),2,'two real receiving warehouses '+width)
    assert.equal(await page.locator('.warehouse-unified-table .warehouse-order-quick-receive').count(),2,
      'only 2 eligible rows expose quick receipt at '+width)
    assert.equal(await page.locator('.warehouse-unified-table tbody tr').filter({
      has:page.locator('.warehouse-order-quick-receive')
    }).count(),2,'quick action only belongs to eligible order cells at '+width)
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
      'detail panel must stay closed on initial load '+width)
    await page.locator('.warehouse-unified-table tbody tr').first().locator('td[data-col="product"]').click()
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
      'clicking a product/table cell must not open the detail panel '+width)
    await page.locator('.fixture-done').click()
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
      'changing to completed filter must not auto-open details '+width)
    await page.locator('.fixture-all').click()
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
      'returning to all orders must not auto-open details '+width)
    await page.locator('.warehouse-unified-table tbody tr').first().locator('button.table-link').click()
    await page.locator('aside.warehouse-intake-panel').waitFor()
    const list=await page.evaluate(()=>{
      const tables=[...document.querySelectorAll('.warehouse-unified-table')]
      const wraps=[...document.querySelectorAll('.warehouse-unified-table-wrap')]
      const panel=document.querySelector('aside.warehouse-intake-panel')
      const lane=document.querySelector('.warehouse-receive-table-lane')
      const productLines=[...document.querySelectorAll('.warehouse-unified-products .warehouse-unified-product-line')]
      const main=document.querySelector('.brand-shell-v1>.main')
      const screen=document.querySelector('.warehouse-receive-screen')
      const workspace=document.querySelector('.warehouse-intake-preview-layout')
      const groups=[...document.querySelectorAll('.warehouse-unified-group')]
      const mainBottom=main.getBoundingClientRect().bottom-parseFloat(getComputedStyle(main).paddingBottom)
      const rectOf=(element)=>element?.getBoundingClientRect()
      return {
        heights:{
          mainBottom,windowBottom:window.innerHeight,
          mainPaddingBottom:parseFloat(getComputedStyle(main).paddingBottom),
          screenBottom:rectOf(screen)?.bottom,
          workspaceBottom:rectOf(workspace)?.bottom,
          laneBottom:rectOf(lane)?.bottom,
          panelBottom:rectOf(panel)?.bottom,
          panelTop:rectOf(panel)?.top,
          groupBottoms:groups.map(group=>rectOf(group).bottom),
          groupHeights:groups.map(group=>rectOf(group).height),
          dataHeights:wraps.map(wrap=>rectOf(wrap).height),
          scrollHeights:wraps.map(wrap=>wrap.scrollHeight),
          viewHeights:wraps.map(wrap=>wrap.clientHeight)
        },
        productLines:productLines.map(e=>{
          const name=e.querySelector('.warehouse-unified-product-name')
          return {
            whiteSpace:getComputedStyle(name).whiteSpace,
            height:name.getBoundingClientRect().height,
            lineHeight:parseFloat(getComputedStyle(name).lineHeight),
            nameOverflow:getComputedStyle(name).textOverflow,
          }
        }),
        laneWidth:lane?.clientWidth,
        laneOverflow:(lane?.scrollWidth??0)-(lane?.clientWidth??0),
        tableDisplay:tables.map(t=>getComputedStyle(t).display),
        tableGeometry:tables.map(t=>{
          const header=t.tHead?.rows[0]
          const first=header?.cells[0]?.getBoundingClientRect()
          const last=header?.cells[header.cells.length-1]?.getBoundingClientRect()
          const rect=t.getBoundingClientRect()
          return {
            tableLeft:rect.left,tableRight:rect.right,
            firstLeft:first?.left,lastRight:last?.right,
            headerDisplay:t.tHead?getComputedStyle(t.tHead).display:'missing',
            tbodyDisplay:getComputedStyle(t.tBodies[0]).display,
            rowDisplay:getComputedStyle(t.tBodies[0].rows[0]).display,
            cellWidths:[...(header?.cells??[])].map(td=>td.getBoundingClientRect().width),
            productWidth:header?.cells[2]?.getBoundingClientRect().width??0,
          }
        }),
        columnMenus:document.querySelectorAll('.warehouse-unified-group-column-control .managed-column-button').length,
        outsideControls:document.querySelectorAll('.warehouse-unified-toolbar').length,
        headers:tables.map(t=>t.querySelectorAll('th').length),
        rows:tables.map(t=>t.querySelectorAll('tbody tr').length),
        products:tables.map(t=>t.querySelectorAll('.warehouse-unified-products>div').length),
        widths:wraps.map(e=>({client:e.clientWidth,scroll:e.scrollWidth,table:e.querySelector('table')?.getBoundingClientRect().width})),
        pageOverflow:document.documentElement.scrollWidth-window.innerWidth,
        actualShell:document.body.classList.contains('brand-shell-v1')===false &&
          !!document.querySelector('.shell.brand-shell-v1 .warehouse-receive-screen'),
        computedGap:getComputedStyle(document.querySelector('.warehouse-intake-preview-layout')).columnGap,
        laneRight:lane?.getBoundingClientRect().right,
        groupRights:[...document.querySelectorAll('.warehouse-unified-group')].map(e=>e.getBoundingClientRect().right),
        pills:[...document.querySelectorAll('.warehouse-unified-table td[data-col="status"] .status-pill')].map(el=>({
          label:el.textContent?.trim(),
          width:el.clientWidth,
          actual:el.scrollWidth,
          right:el.getBoundingClientRect().right
        })),
        finalColumns:tables.map(t=>{
          const lastIndex=t.tHead.rows[0].cells.length-1
          const header=t.tHead.rows[0].cells[lastIndex]
          const bodyCell=t.tBodies[0].rows[0].cells[lastIndex]
          const wrapper=t.closest('.warehouse-unified-table-wrap')
          const tableRect=t.getBoundingClientRect()
          const wrapRect=wrapper.getBoundingClientRect()
          const lastHeaderRect=header.getBoundingClientRect()
          const lastBodyRect=bodyCell.getBoundingClientRect()
          return {
            tableRight:tableRect.right,wrapperRight:wrapRect.right,
            headerLeft:lastHeaderRect.left,headerRight:lastHeaderRect.right,
            bodyRight:lastBodyRect.right,
            headerWidth:lastHeaderRect.width,
            fullyVisible:lastHeaderRect.right<=wrapRect.right+2 &&
              lastBodyRect.right<=wrapRect.right+2 &&
              lastHeaderRect.left>=wrapRect.left-2
          }
        }),
        statusHeaders:tables.map(t=>{
          const th=t.tHead?.rows[0]?.cells[t.tHead.rows[0].cells.length-1]
          const button=th?.querySelector('button')
          return {
            text:th?.textContent?.trim(),
            displayed:th?.clientWidth,
            needed:button?.scrollWidth,
            right:th?.getBoundingClientRect().right
          }
        }),
        panelLeft:panel?.getBoundingClientRect().left,
        panelRight:panel?.getBoundingClientRect().right,
        panelTabLabels:[...document.querySelectorAll('.warehouse-detail-v2-tabs button')].map(x=>x.textContent?.trim()),
        panelTabShared:!!panel?.classList.contains('mynh-slide-panel') &&
          !!panel.querySelector('.panel-tabs[role="tablist"]'),
        panelTabMetrics:[...document.querySelectorAll('.warehouse-detail-v2-tabs button')].map(button=>({
          background:getComputedStyle(button).backgroundColor,
          fontSize:getComputedStyle(button).fontSize,
          flex:getComputedStyle(button).flex,
          border:getComputedStyle(button).borderBottomWidth,
        })),
        panelHeader:panel?.querySelector('.warehouse-detail-v2-head')?.getBoundingClientRect().height,
        panelMeta:panel?.querySelector('.warehouse-detail-v2-meta')?.getBoundingClientRect().height,
        panelMetaLabels:panel?.querySelector('.warehouse-detail-v2-meta')?.innerText,
        panelFooter:panel?.querySelector('.warehouse-detail-v2-footer')?.getBoundingClientRect().height,
        panelScrollHeight:panel?.querySelector('.warehouse-detail-v2-scroll')?.getBoundingClientRect().height,
        readOnlySubmit:[...document.querySelectorAll('.warehouse-intake-panel button[type="submit"]')].every(b=>b.disabled),
        labels:[...document.querySelectorAll('.warehouse-unified-table .status-pill')].map(e=>e.textContent?.trim()),
      }
    })
    assert.ok(list.headers.every(count=>count===6),'six merged columns preserved '+width+' '+JSON.stringify(list))
    assert.equal(list.rows.reduce((a,b)=>a+b,0),8,'all includes processed and skipped '+width)
    assert.equal(list.products.reduce((a,b)=>a+b,0),16,'all products visible '+width)
    assert.ok(list.labels.includes('Đã bỏ qua kho')&&list.labels.includes('Đã nhập kho'),'processed statuses rendered '+width)
    const merged=await page.locator('.warehouse-unified-table').first().evaluate(table=>({
      headers:[...table.tHead.rows[0].cells].map(cell=>cell.textContent?.trim()??''),
      received:table.querySelector('tbody tr:first-child td[data-col="order"] .warehouse-unified-received-at')?.textContent?.trim(),
      skuCell:table.querySelector('tbody tr:nth-child(2) td[data-col="sku"]')?.innerText,
      skuSale:table.querySelector('tbody tr:nth-child(2) td[data-col="sku"] .warehouse-unified-sku-title')?.textContent,
      pendingValue:table.querySelector('tbody tr:first-child td[data-col="order"] .warehouse-unified-pending-value')?.textContent?.trim(),
      mappedHasValue:!!table.querySelector('tbody tr:nth-child(2) td[data-col="order"] .warehouse-unified-pending-value'),
      processedHasValue:!!table.querySelector('tbody tr:nth-child(3) td[data-col="order"] .warehouse-unified-pending-value'),
      valueAxis:(()=>{
        const order=table.querySelector('tbody tr:first-child td[data-col="order"]')
        return {
          received:order?.querySelector('.warehouse-unified-received-at')?.getBoundingClientRect().left,
          value:order?.querySelector('.warehouse-unified-pending-value')?.getBoundingClientRect().left,
          code:order?.querySelector('.table-link')?.getBoundingClientRect().left,
        }
      })(),
    }))
    assert.ok(merged.headers[0].includes('Ngày nhận')&&merged.headers.length===6,
      'date must share the order column, no separate date column '+width)
    assert.match(merged.received??'',/06\/11\/2026/,
      'received date should appear below each order code '+width)
    assert.ok((merged.skuCell??'').includes('TEST-01')&&(merged.skuSale??'').includes('Đã map'),
      'mapped sale product name must be displayed after SKU '+width)
    assert.match(merged.pendingValue??'',/Giá trị đơn:\s*75[.,]000\s*đ/,
      'partially prepaid order shows full value: 25.000 prepaid + 50.000 COD '+width)
    assert.equal(merged.mappedHasValue,false,
      'mapped order must not show unparsed order-value note '+width)
    assert.equal(merged.processedHasValue,false,
      'processed order must not show unparsed order-value note '+width)
    assert.ok(Math.abs((merged.valueAxis.code??0)-(merged.valueAxis.value??0))<=1.5&&
      Math.abs((merged.valueAxis.received??0)-(merged.valueAxis.value??0))<=1.5,
      'order value, time and code align in the same column '+width+' '+JSON.stringify(merged.valueAxis))
    const originalPrice=await page.locator('.warehouse-unified-table').first()
      .locator('tbody tr:first-child td[data-col="purchase"]').innerText()
    assert.match(originalPrice,/50[.,]000/,
      'Giá gốc must show original price 50.000, not 35.000 after discount '+width)
    assert.ok((merged.headers??[]).some(header=>header.includes('Giá gốc')),
      'main table must label original purchase price Giá gốc '+width)
    assert.ok(list.readOnlySubmit,'write controls must be disabled in preview '+width)
    assert.deepEqual(list.panelTabLabels,['Sản phẩm','Thông tin đơn','Lịch sử'],
      'V2 slidebar must have three functional tabs '+width)
    assert.ok(list.panelTabShared,'V2 must use shared system slidebar tabs '+width)
    assert.ok(list.panelTabMetrics.every(t=>t.background==='rgba(0, 0, 0, 0)'||t.background==='transparent'),
      'Tab has filled background rather than system-standard underline '+width+' '+JSON.stringify(list.panelTabMetrics))
    assert.ok(list.panelMeta>=25 && list.panelMetaLabels?.includes('sản phẩm'),
      'standard order breadcrumb missing below the panel header '+width)
    assert.ok(list.panelHeader>50 && list.panelFooter>35 && list.panelScrollHeight>35,
      'slidebar header, inner scroll, footer are not present '+width)
    assert.equal(list.columnMenus,2,'per-warehouse controls must exist '+width)
    assert.equal(list.outsideControls,0,'remove global search and column toolbar '+width)
    assert.equal(list.productLines.length,16,'each product owns exactly one line '+width)
    assert.ok(list.productLines.every(x=>x.whiteSpace==='nowrap' && x.height<=x.lineHeight+3),
      'product text wrapped to multiple lines '+width+' '+JSON.stringify(list.productLines))
    assert.ok(list.productLines.every(x=>x.nameOverflow==='ellipsis'),'long name must use ellipsis '+width)
    assert.ok(list.actualShell,'Fixture does not reproduce actual ERP .shell.brand-shell-v1 wrapper '+width)
    assert.ok(list.heights.mainPaddingBottom<=9,'ERP main still reserves unused bottom padding '+width+' '+JSON.stringify(list.heights))
    const shortLandscape=width>height&&width<=900&&height<=430
    if(shortLandscape){
      const mainScroll=await page.locator('.brand-shell-v1>.main').evaluate(node=>({
        total:node.scrollHeight,visible:node.clientHeight,
        overflow:getComputedStyle(node).overflowY,
      }))
      assert.ok(mainScroll.total>mainScroll.visible+60&&mainScroll.overflow==='auto',
        'short mobile landscape needs vertical access to the order codes '+width+' '+JSON.stringify(mainScroll))
    }else{
      assert.ok(Math.abs(list.heights.screenBottom-list.heights.mainBottom)<=3,
        'page does not reach main content bottom '+width+' '+JSON.stringify(list.heights))
      assert.ok(Math.abs(list.heights.workspaceBottom-list.heights.mainBottom)<=3,
        'receiving workspace fails to fill remaining page height '+width+' '+JSON.stringify(list.heights))
    }
    assert.ok(Math.abs(list.heights.laneBottom-list.heights.workspaceBottom)<=3,
      'table lane is shorter than the slidebar workspace '+width+' '+JSON.stringify(list.heights))
    if(width>900){
      assert.ok(Math.abs(list.heights.panelBottom-list.heights.mainBottom)<=3,
        'desktop slidebar stops before the end of the available page '+width+' '+JSON.stringify(list.heights))
      // Empty workspace BELOW compact cards is intentional. Never let
      // empty space accumulate INSIDE an open table when content fits.
      if(list.heights.groupBottoms.at(-1)<list.heights.laneBottom-3){
        assert.ok(list.heights.dataHeights.every((h,i)=>h<=list.heights.scrollHeights[i]+4),
          'compact warehouses must not stretch table beyond actual rows '+width+' '+JSON.stringify(list.heights))
      }
      assert.ok(list.heights.groupHeights.every(h=>h>100),
        'warehouse groups became unusably short '+width+' '+JSON.stringify(list.heights))
    }else{
      assert.ok(Math.abs(list.heights.panelBottom-height)<=3,
        'narrow viewport slidebar does not reach full visible screen height '+width+' '+JSON.stringify(list.heights))
    }
    assert.ok(list.widths.every(x=>Math.abs(x.table-x.client)<=3 && x.scroll<=x.client+3),
      'table must exactly auto-fit without horizontal scroll '+width+' '+JSON.stringify(list))
    assert.ok(list.laneOverflow<=3,'lane has horizontal overflow '+width+' '+JSON.stringify(list))
    assert.ok(list.pageOverflow<=3,'document overflow '+width+' '+JSON.stringify(list))
    assert.ok(list.tableDisplay.every(x=>x==='table'),
      'table must remain native table in all viewports '+width+' '+JSON.stringify(list))
    assert.ok(list.tableGeometry.every(x=>x.headerDisplay==='table-header-group'&&
      x.tbodyDisplay==='table-row-group'&&x.rowDisplay==='table-row'),
      'header, body and rows must retain their table structure '+width+' '+JSON.stringify(list.tableGeometry))
    assert.ok(list.tableGeometry.every(x=>x.cellWidths.length===6&&x.cellWidths.every(w=>w>0)),
      'all six columns must occupy measurable table width '+width+' '+JSON.stringify(list.tableGeometry))
    assert.ok(list.tableGeometry.every(x=>Math.abs(x.tableLeft-x.firstLeft)<=3 && Math.abs(x.tableRight-x.lastRight)<=3),
      'Auto Fit leaves unused blank space at table edges '+width+' '+JSON.stringify(list.tableGeometry))
    assert.ok(list.finalColumns.every(x=>x.fullyVisible && x.headerWidth>3 &&
      Math.abs(x.tableRight-x.wrapperRight)<=3),
      'rightmost status column is clipped, beyond container, or table is not full width '+width+' '+JSON.stringify(list.finalColumns))
    if(width>900&&list.panelLeft!==undefined&&list.panelLeft!==null) {
      assert.ok(list.panelLeft-list.laneRight>=7 && list.panelLeft-list.laneRight<=15,
        'desktop gutter must be compact, about 10px '+width+' '+JSON.stringify(list))
      assert.ok(list.groupRights.every(right=>right<=list.laneRight+2),
        'warehouse card extends beyond available table lane '+width+' '+JSON.stringify(list))
      assert.ok(list.groupRights.every(right=>list.panelLeft-right>=7 && list.panelLeft-right<=15),
        'group card must fill available lane with compact spacing '+width+' '+JSON.stringify(list))
      assert.ok(list.panelRight<=width+3,'panel escapes viewport '+width+' '+JSON.stringify(list))
    } else if(width<=900){
      assert.ok(list.laneWidth>=width-30,'mobile/tablet list must own the screen under the overlay '+width+' '+JSON.stringify(list))
      assert.ok(list.panelLeft>=-2&&list.panelRight<=width+2,'mobile/tablet panel escapes viewport '+width+' '+JSON.stringify(list))
    }
    if(list.laneWidth>=700){
      assert.ok(list.statusHeaders.every(h=>h.text?.includes('Trạng thái') && h.needed<=h.displayed+2 && h.right<=list.laneRight+2),
        'last column heading hidden or clipped behind the slidebar '+width+' '+JSON.stringify(list.statusHeaders))
      assert.ok(list.pills.every(p=>p.actual<=p.width+2 && p.right<=list.laneRight+2),
        'status values clipped at the right edge '+width+' '+JSON.stringify(list.pills))
    }
    await page.screenshot({path:path.join(output,width+'-'+height+'-open.png')})
    await page.locator('aside.warehouse-intake-panel .close').click()
    await page.screenshot({path:path.join(output,width+'-'+height+'-closed.png')})
    const afterCloseVertical=await page.locator('.warehouse-intake-preview-layout').evaluate(el=>({
      workspaceBottom:el.getBoundingClientRect().bottom,
      lastGroupBottom:el.querySelector('.warehouse-unified-group:last-of-type')?.getBoundingClientRect().bottom,
      laneBottom:el.querySelector('.warehouse-receive-table-lane')?.getBoundingClientRect().bottom,
    }))
    if(!shortLandscape)assert.ok(Math.abs(afterCloseVertical.workspaceBottom-list.heights.workspaceBottom)<=3,
      'closing slidebar changes overall workspace height '+width+' '+JSON.stringify(afterCloseVertical))
    // Closing the slidebar can reduce line wrapping. Both tables may then
    // fit naturally instead of being stretched to the bottom of the lane.
    if(width>900&&afterCloseVertical.lastGroupBottom<afterCloseVertical.laneBottom-3){
      const compact=await page.locator('.warehouse-unified-table-wrap').evaluateAll(nodes=>
        nodes.every(wrap=>wrap.clientHeight<=wrap.scrollHeight+4))
      assert.ok(compact,'closing slidebar must not create blank table interiors '+width)
    }
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,'close slidebar '+width)
    const closedLaneWidth=await page.locator('.warehouse-receive-table-lane').evaluate(e=>e.clientWidth)
    if(width>900)assert.ok(closedLaneWidth>list.laneWidth+130,
      'closing right slidebar must expand available table area '+width+' '+closedLaneWidth+' vs '+list.laneWidth)
    const afterClose=await page.locator('.warehouse-unified-table-wrap').first().evaluate(e=>{
      const table=e.querySelector('table')
      return {client:e.clientWidth,scroll:e.scrollWidth,table:table?.getBoundingClientRect().width,
        productWidth:table?.tHead?.rows[0]?.cells[2]?.getBoundingClientRect().width}
    })
    assert.ok(afterClose.scroll<=afterClose.client+3,'closed panel table still overflows '+width+' '+JSON.stringify(afterClose))
    assert.ok(Math.abs(afterClose.table-afterClose.client)<=3,
      'table does not expand after slidebar closes '+width+' '+JSON.stringify(afterClose))
    if(width>900){
      assert.ok(afterClose.productWidth>list.tableGeometry[0].productWidth+60,
        'product column must expand to use newly available table width '+width+' '+JSON.stringify(afterClose))
    }
    // Selection/indentation QA on the same Desktop, Tablet and Mobile matrix:
    // native checkbox semantics, a visible custom mark, and one aligned order/date axis.
    const selectionGeometry=await page.locator('.warehouse-unified-table').first().evaluate(table=>{
      const first=table.querySelector('tbody tr td[data-col="order"]')
      const code=first?.querySelector('.warehouse-unified-order .table-link')
      const date=first?.querySelector('.warehouse-unified-received-at')
      const rowSlot=first?.querySelector('.warehouse-bulk-select-control,.warehouse-bulk-select-spacer')
      const headSlot=table.querySelector('thead .warehouse-bulk-select-control')
      return {
        dateLeft:date?.getBoundingClientRect().left,
        codeLeft:code?.getBoundingClientRect().left,
        rowSlotLeft:rowSlot?.getBoundingClientRect().left,
        headSlotLeft:headSlot?.getBoundingClientRect().left,
        hitWidth:rowSlot?.getBoundingClientRect().width,
      }
    })
    assert.ok(Math.abs(selectionGeometry.codeLeft-selectionGeometry.dateLeft)<=1.5,
      'order/date must share a left edge '+width+' '+JSON.stringify(selectionGeometry))
    assert.ok(Math.abs(selectionGeometry.rowSlotLeft-selectionGeometry.headSlotLeft)<=6,
      'header/body checkbox gutters must align '+width+' '+JSON.stringify(selectionGeometry))
    assert.ok(selectionGeometry.hitWidth>=21,
      'bulk checkbox touch target became too small '+width+' '+JSON.stringify(selectionGeometry))
    const bulkTick=page.locator('.warehouse-unified-group').first().locator('tbody .warehouse-bulk-select-checkbox').first()
    await bulkTick.check()
    assert.equal(await bulkTick.isChecked(),true,'select row works '+width)
    // The selection mark animates its background over 120ms: wait for its
    // final visual state instead of sampling the first animation frame.
    await page.waitForFunction(()=>{
      const mark=document.querySelector('.warehouse-unified-group tbody input.warehouse-bulk-select-checkbox:checked + .warehouse-bulk-select-mark')
      return !!mark&&getComputedStyle(mark).backgroundColor==='rgb(67, 139, 130)'
    },null,{timeout:2000})
    await bulkTick.uncheck()
    assert.equal(await bulkTick.isChecked(),false,'unselect row works '+width)
    if(width===1280){
      const bg=page.locator('.warehouse-unified-group').first()
      const hn=page.locator('.warehouse-unified-group').last()
      await bg.locator('.managed-column-button').click()
      assert.equal(await bg.locator('.managed-column-menu').count(),1,'BG menu opens')
      assert.equal(await hn.locator('.managed-column-menu').count(),0,'HN menu must stay closed')
      await bg.locator('.managed-column-row').filter({hasText:'Giá bán'}).locator('input').uncheck()
      assert.equal(await bg.locator('thead th').count(),5,'BG custom visibility takes effect')
      assert.equal(await hn.locator('thead th').count(),6,'HN columns remain independent')
      await bg.locator('.managed-column-row').filter({hasText:'Giá bán'}).locator('input').check()
      await bg.locator('.managed-column-button').click()
    }
    await page.locator('.warehouse-unified-order button.table-link').first().click()
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),1,'open V2 slidebar via order '+width)
    if(width===1280){
      const panel=page.locator('aside.warehouse-detail-v2')
      assert.equal(await panel.locator('.warehouse-detail-v2-product').count(),2,'two items in V2')
      await pickDetailClassification(panel,'TEST-01')
      await panel.getByLabel('Hệ số quy đổi',{exact:true}).fill('2')
      assert.match(await panel.locator('.warehouse-detail-v2-conversion').innerText(),/4/)
      await panel.getByRole('button',{name:'Ghi nhận lựa chọn thử'}).click()
      assert.match(await panel.locator('.warehouse-detail-v2-progress').innerText(),/0\/2 đã có quyết định SKU\/kho/)
      await panel.locator('.warehouse-detail-v2-product').nth(1).click()
      await pickDetailClassification(panel,'TEST-01')
      await panel.getByRole('button',{name:'Bỏ qua kho',exact:true}).click()
      await panel.getByLabel('Lý do bỏ qua kho (bắt buộc)').fill('Sản phẩm không cần nhập kho')
      await panel.getByRole('button',{name:'Ghi nhận lựa chọn thử'}).click()
      await panel.getByRole('button',{name:'Xem lựa chọn dự kiến'}).click()
      assert.equal(await panel.locator('.warehouse-detail-v2-summary strong').count(),2,'mixed decisions are present')
      assert.match(await panel.locator('.warehouse-detail-v2-summary').innerText(),/Nhập kho/)
      assert.match(await panel.locator('.warehouse-detail-v2-summary').innerText(),/Bỏ qua kho/)
      assert.match(await panel.locator('.warehouse-detail-v2-progress').innerText(),/0\/2 đã có quyết định SKU\/kho/)
      await page.screenshot({path:path.join(output,'warehouse-v2-mixed-decisions.png')})
      await panel.getByRole('tab',{name:'Thông tin đơn'}).click()
      const info=panel.locator('.warehouse-detail-v2-order-info')
      assert.equal(await info.locator('.detail-grid.compact-detail-grid').count(),1,'system detail grid used')
      assert.equal(await info.locator('.context-order-items>div').count(),2,'system order product list used')
      assert.match(await info.innerText(),/Giá trị đơn hàng/)
      assert.match(await info.innerText(),/75\.000/)
      assert.match(await info.innerText(),/Loại tài khoản\/thẻ/)
      assert.match(await info.innerText(),/Thẻ ghi nợ/)
      assert.match(await info.innerText(),/Kho nhận thực tế/)
      await info.locator('.warehouse-detail-v2-product-link').first().click()
      assert.match(await panel.locator('.warehouse-detail-v2-progress').innerText(),/0\/2 đã có quyết định SKU\/kho/)
      await panel.getByRole('tab',{name:'Lịch sử'}).click()
      assert.match(await panel.locator('.warehouse-detail-v2-content').innerText(),/Chưa có lịch sử/)
      await panel.getByRole('tab',{name:'Sản phẩm'}).click()
    }
    await page.locator('aside.warehouse-intake-panel .close').click()
    await page.locator('.fixture-done').click()
    const processed=await page.locator('.warehouse-unified-table tbody tr').count()
    assert.equal(processed,2,'processed KPI must show stored and skipped '+width)
    assert.deepEqual(errors,[],'no runtime errors '+width+': '+errors.join('; '))
    console.log('PASS '+width+'x'+height+' · full page height · full slidebar height · internal table scrolling · 6 columns')
    await page.close()
  }

// Sparse warehouses should take only their actual row height. The extra
// workspace belongs below both cards, never inside a mostly-empty table.
for(const [width,height] of [[390,844],[1280,800],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="sparse">'),{waitUntil:'load'})
  await page.locator('.warehouse-unified-group').first().waitFor()
  const sizes=await page.locator('.warehouse-receive-table-lane').evaluate(lane=>{
    const groups=[...lane.querySelectorAll('.warehouse-unified-group')]
    const laneRect=lane.getBoundingClientRect()
    return {
      laneHeight:laneRect.height,laneBottom:laneRect.bottom,
      lastBottom:groups.at(-1)?.getBoundingClientRect().bottom,
      overflowX:lane.scrollWidth-lane.clientWidth,
      groups:groups.map(group=>{
        const wrap=group.querySelector('.warehouse-unified-table-wrap')
        const table=wrap?.querySelector('table')
        return {
          rows:group.querySelectorAll('tbody tr').length,
          height:group.getBoundingClientRect().height,
          contentHeight:table?.getBoundingClientRect().height,
          wrapHeight:wrap?.getBoundingClientRect().height,
          headHeight:group.querySelector('.warehouse-unified-group-head')?.getBoundingClientRect().height,
          scroll:wrap?.scrollHeight-wrap?.clientHeight,
        }
      })
    }
  })
  assert.deepEqual(sizes.groups.map(g=>g.rows),[1,1],
    'sparse fixture must have one order in each warehouse '+width)
  assert.ok(sizes.groups.every(g=>g.height<Math.max(265,sizes.laneHeight*.62)),
    'one-row warehouse must not become a giant empty half-page '+width+' '+JSON.stringify(sizes))
  assert.ok(sizes.groups.every(g=>g.wrapHeight<=g.contentHeight+5),
    'table must not stretch beyond its real rows '+width+' '+JSON.stringify(sizes))
  assert.ok(sizes.lastBottom<sizes.laneBottom-24,
    'sparse dual warehouses must not be forced to fill available height '+width+' '+JSON.stringify(sizes))
  assert.ok(sizes.overflowX<=3,'sparse layout cannot overflow horizontally '+width)
  await page.screenshot({path:path.join(output,width+'-'+height+'-sparse.png')})
  await page.close()
}
console.log('PASS sparse dual warehouses · natural-height cards at mobile, tablet and desktop')

// Boundary cases: 0, 1, 2 and >=3 real orders. Only 3+ may flex
// into spare lane height; one/two orders must be fully visible, not scroll.
for(const [scenario,countExpected,mode] of [
  ['single-one',1,'one'],['single-two',2,'two'],
  ['two-each',2,'two'],['three-each',3,'many']
]){
  for(const [width,height] of [[390,844],[768,1024],[1280,800]]){
    const page=await browser.newPage({viewport:{width,height}})
    await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="'+scenario+'">'),{waitUntil:'load'})
    await page.locator('.warehouse-unified-table').first().waitFor()
    const geometry=await page.locator('.warehouse-receive-table-lane').evaluate(lane=>{
      const l=lane.getBoundingClientRect()
      return {
        bottom:l.bottom,
        widthOverflow:lane.scrollWidth-lane.clientWidth,
        groups:[...lane.querySelectorAll('.warehouse-unified-group')].map(g=>{
          const box=g.getBoundingClientRect()
          const data=g.querySelector('.warehouse-unified-table-wrap')
          const table=g.querySelector('table')
          return {
            mode:g.getAttribute('data-warehouse-row-mode'),
            count:Number(g.getAttribute('data-warehouse-rows')),
            className:g.className,
            height:box.height,bottom:box.bottom,
            dataHeight:data?.getBoundingClientRect().height??0,
            tableHeight:table?.getBoundingClientRect().height??0,
            compactRowsHeight:(table?.tHead?.getBoundingClientRect().height??0)+
              [...(table?.tBodies[0]?.rows??[])].slice(0,Math.min(Number(g.dataset.warehouseRows),2))
                .reduce((sum,row)=>sum+row.getBoundingClientRect().height,0)+1,
            contentScroll:data?.scrollHeight??0,
            viewScroll:data?.clientHeight??0,
            overflowX:(data?.scrollWidth??0)-(data?.clientWidth??0),
          }
        }),
      }
    })
    const groupCount=scenario.startsWith('single')?1:2
    assert.equal(geometry.groups.length,groupCount,'right number of warehouse groups '+scenario+' '+width)
    assert.ok(geometry.groups.every(g=>g.count===countExpected&&g.mode===mode),
      'warehouse card declares correct row-count mode '+scenario+' '+width+' '+JSON.stringify(geometry))
    assert.ok(geometry.groups.every(g=>g.overflowX<=3)&&geometry.widthOverflow<=3,
      'new row-count modes must not overflow horizontally '+scenario+' '+width)
    if(mode!=='many'){
      assert.ok(geometry.groups.every(g=>Math.abs(g.dataHeight-g.compactRowsHeight)<=3),
        '1/2 orders must show all their rows with no forced empty height '+scenario+' '+width+' '+JSON.stringify(geometry))
      assert.ok(geometry.groups.every(g=>g.contentScroll<=g.viewScroll+4),
        'one/two orders must be fully visible, not hidden behind vertical scrolling '+scenario+' '+width+' '+JSON.stringify(geometry))
      if(groupCount===1)assert.ok(geometry.groups.at(-1).bottom<geometry.bottom-18,
        'a single 1/2-order warehouse must remain compact '+scenario+' '+width+' '+JSON.stringify(geometry))
    }else{
      assert.ok(geometry.groups.every(g=>g.height>=175),
        '3+ rows need usable scrolling/data space '+scenario+' '+width+' '+JSON.stringify(geometry))
      assert.ok(await page.locator('.warehouse-receive-table-lane.warehouse-equal-halves').count()===1,
        'both warehouses with >2 orders must split equally '+scenario+' '+width)
      assert.ok(Math.abs(geometry.groups[0].height-geometry.groups[1].height)<=4,
        'two dense warehouse panels must be equal-height '+scenario+' '+width+' '+JSON.stringify(geometry))
    }
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
      'row-count modes must not auto-open slidebar '+scenario+' '+width)
    await page.screenshot({path:path.join(output,scenario+'-'+width+'-'+height+'.png')})
    await page.close()
  }
}
// Unequal dense order counts must STILL render equal-height BG/HN panels.
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="dense-uneven">'),{waitUntil:'load'})
  const lane=page.locator('.warehouse-receive-table-lane.warehouse-equal-halves')
  await lane.waitFor()
  const boxes=await lane.locator('.warehouse-unified-group').evaluateAll(groups=>
    groups.map(group=>({
      rows:Number(group.dataset.warehouseRows),
      height:group.getBoundingClientRect().height,
      scroll:group.querySelector('.warehouse-unified-table-wrap')?.scrollHeight??0,
      visible:group.querySelector('.warehouse-unified-table-wrap')?.clientHeight??0,
    })))
  assert.deepEqual(boxes.map(x=>x.rows),[3,5],'fixture has 3 BG and 5 HN orders '+width)
  assert.ok(Math.abs(boxes[0].height-boxes[1].height)<=4,
    '3 vs 5 orders must share equal vertical halves '+width+' '+JSON.stringify(boxes))
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'equal panels must not auto-open order slidebar '+width)
  await page.screenshot({path:path.join(output,'dense-uneven-'+width+'-'+height+'.png')})
  await page.close()
}
console.log('PASS warehouse 0/1/2/3+ layout · all 1–2 rows visible · equal dense BG/HN 50/50 · no auto-slidebar')

// Adaptive warehouse groups: visibility and vertical allocation come from
// ACTIONABLE warehouse rows, not a permanently rendered BG/HN 50/50 layout.
{
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="hn-done">'),{waitUntil:'load'})
  await page.locator('.warehouse-unified-group').first().waitFor()
  assert.deepEqual(await page.locator('.warehouse-unified-group').evaluateAll(nodes=>nodes.map(n=>n.dataset.warehouseCode)),['BG'],
    'warehouse with no active orders must disappear in All')
  assert.equal(await page.locator('.warehouse-unified-table tbody tr').count(),4,
    'the remaining BG group still shows its own rows')
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'a single busy warehouse must not auto-open its order panel')
  await page.locator('.warehouse-unified-table tbody tr').first().locator('button.table-link').click()
  await page.locator('aside.warehouse-intake-panel').waitFor()
  const single=await page.evaluate(()=>{
    const lane=document.querySelector('.warehouse-receive-table-lane').getBoundingClientRect()
    const group=document.querySelector('.warehouse-unified-group').getBoundingClientRect()
    const panel=document.querySelector('.warehouse-intake-panel')?.getBoundingClientRect()
    return {laneBottom:lane.bottom,groupBottom:group.bottom,panelBottom:panel?.bottom}
  })
  assert.ok(Math.abs(single.laneBottom-single.groupBottom)<=3,
    'one remaining warehouse must fill full vertical lane '+JSON.stringify(single))
  assert.ok(Math.abs(single.panelBottom-single.laneBottom)<=3,
    'slidebar and the remaining group must end at the same bottom '+JSON.stringify(single))
  await page.locator('.fixture-done').click()
  await page.locator('.warehouse-unified-table tbody tr').nth(5).waitFor()
  assert.deepEqual(await page.locator('.warehouse-unified-group').evaluateAll(nodes=>nodes.map(n=>n.dataset.warehouseCode)),['BG','HN'],
    'completed KPI must still show warehouses with only completed orders')
  assert.equal(await page.locator('.warehouse-unified-table tbody tr').count(),6,
    'completed KPI must retain all six processed orders')
  await page.locator('.fixture-all').click()
  assert.deepEqual(await page.locator('.warehouse-unified-group').evaluateAll(nodes=>nodes.map(n=>n.dataset.warehouseCode)),['BG'],
    'returning to All must hide empty-action warehouse again')
  await page.screenshot({path:path.join(output,'warehouse-dynamic-single-active.png')})
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="all-done">'),{waitUntil:'load'})
  await page.getByText('Các kho đã hết đơn cần xử lý.',{exact:false}).waitFor()
  assert.equal(await page.locator('.warehouse-unified-group').count(),0,
    'no zero-work warehouse card when all orders are completed')
  assert.equal(await page.locator('.warehouse-intake-panel').count(),0,
    'no stale slidebar for hidden warehouse')
  await page.locator('.fixture-done').click()
  await page.locator('.warehouse-unified-table tbody tr').nth(7).waitFor()
  assert.equal(await page.locator('.warehouse-unified-group').count(),2,
    'completed KPI still allows inspecting both warehouse histories')
  assert.equal(await page.locator('.warehouse-unified-table tbody tr').count(),8,
    'completed KPI must preserve all eight historical orders')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="uneven">'),{waitUntil:'load'})
  const sizes=await page.locator('.warehouse-unified-group').evaluateAll(nodes=>nodes.map(n=>({
    code:n.dataset.warehouseCode,rows:Number(n.dataset.warehouseRows),
    height:n.getBoundingClientRect().height
  })))
  assert.deepEqual(sizes.map(x=>x.rows),[1,7],'expected one BG row and seven HN rows')
  assert.ok(sizes[1].height>sizes[0].height+90,
    'large warehouse must use more vertical space than small warehouse '+JSON.stringify(sizes))
  const geom=await page.locator('.warehouse-receive-table-lane').evaluate(node=>({
    scrollX:node.scrollWidth-node.clientWidth,
    bottom:node.getBoundingClientRect().bottom,
    lastGroupBottom:node.querySelector('.warehouse-unified-group:last-of-type').getBoundingClientRect().bottom
  }))
  assert.ok(geom.scrollX<=3,'uneven warehouse groups must not overflow horizontally')
  assert.ok(geom.lastGroupBottom>=geom.bottom-3,'uneven groups must occupy available page height')
  await page.screenshot({path:path.join(output,'warehouse-dynamic-uneven-heights.png')})
  await page.close()
}
console.log('PASS adaptive groups · hide empty-action warehouse · completed history · 1/7 proportional heights')

// Quick receive is icon-only and writes at most one eligible order directly,
// with no review popup. Preview remains read-only even when the icon is visible.
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html,{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  assert.equal(await bg.locator('.warehouse-order-quick-receive').count(),1,
    'BG exposes one eligible quick icon '+width)
  assert.equal(await bg.locator('tbody tr').first().locator('.warehouse-order-quick-receive').count(),0,
    'unmapped order must never show quick receipt '+width)
  const quick=bg.getByRole('button',{name:/Nhập nhanh đơn/})
  assert.equal(await quick.isDisabled(),true,'Preview must block all quick stock writes '+width)
  assert.equal(await quick.locator('svg').count(),1,'quick receipt displays only an icon '+width)
  assert.equal((await quick.innerText()).trim(),'','quick receipt must not show text '+width)
  assert.equal(await page.locator('[data-warehouse-bulk-popup]').count(),0,
    'quick icon must not open review popup '+width)
  assert.deepEqual(await page.evaluate(()=>window.__bulkCalls||[]),[],
    'read-only Preview must not submit stock action '+width)
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="bulk">'),{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  const quick=bg.getByRole('button',{name:/Nhập nhanh đơn 261106SPXITEM001/})
  assert.equal(await quick.isEnabled(),true,'eligible icon must be clickable in live mock')
  await page.evaluate(()=>{window.__bulkDelay=true})
  await quick.click()
  await page.waitForFunction(()=>document.querySelector('.warehouse-order-quick-receive[aria-busy="true"]')!==null)
  assert.equal(await quick.isDisabled(),true,'second click blocked while request pending')
  await quick.evaluate(button=>button.click())
  await page.getByRole('status').filter({hasText:'Đã nhập kho đơn 261106SPXITEM001'}).waitFor()
  const calls=await page.evaluate(()=>window.__bulkCalls||[])
  assert.equal(calls.length,1,'double click must create just one Server Action request')
  assert.deepEqual(calls[0].orderIds,['10000000-0000-0000-0000-000000000001'],
    'quick receipt must send exactly the clicked order')
  assert.equal(await page.locator('[data-warehouse-bulk-popup]').count(),0,
    'direct quick receipt must never open a review popup')
  assert.equal(await bg.locator('.warehouse-bulk-toolbar').count(),0,
    'direct receipt must not create a bulk selection toolbar')
  assert.ok(await page.evaluate(()=>(window.__refreshCalls||0)>0),
    'successful quick receipt refreshes authoritative order data')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="bulk">'),{waitUntil:'load'})
  await page.evaluate(()=>{window.__bulkFail=true})
  const quick=page.getByRole('button',{name:/Nhập nhanh đơn 261106SPXITEM001/})
  await quick.click()
  await page.getByRole('alert').filter({hasText:'Đơn không còn ở trạng thái chờ nhập kho'}).waitFor()
  assert.equal(await quick.isEnabled(),true,'failed quick receipt must allow deliberate retry')
  assert.equal(await page.locator('[data-warehouse-bulk-popup]').count(),0,
    'backend validation failure must not create a popup')
  assert.equal(await page.evaluate(()=>(window.__refreshCalls||0)),0,
    'failed quick receipt must not report a successful refresh')
  await page.evaluate(()=>{window.__bulkFail=false})
  await quick.click()
  await page.getByRole('status').filter({hasText:'Đã nhập kho đơn 261106SPXITEM001'}).waitFor()
  const calls=await page.evaluate(()=>window.__bulkCalls||[])
  assert.equal(calls.length,2,'retry must call Server Action once after initial failed attempt')
  await page.close()
}
console.log('PASS quick receive icon · preview read-only · direct one-order action · no modal · guarded repeat · failure/retry')

// Missing required payment data is not silently converted to 0 đ.
{
  const page=await browser.newPage({viewport:{width:390,height:844}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="missing-cod">'),{waitUntil:'load'})
  const first=page.locator('.warehouse-unified-group[data-warehouse-code="BG"] tbody tr').first()
  await first.waitFor()
  const value=await first.locator('.warehouse-unified-pending-value').innerText()
  assert.equal(value.replace(/\s+/g,' ').trim(),'Giá trị đơn: Chưa đủ dữ liệu',
    'missing COD in partially prepaid order must show unknown total, not zero')
  await page.close()
}
console.log('PASS canonical order value · 14 viewports · partially paid total · unknown data preserved')

// Item SKIP requires no SKU, does not create a fake variant or stock entry.
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html,{waitUntil:'load'})
  const first=page.locator('.warehouse-unified-group[data-warehouse-code="BG"] tbody tr').first()
  const skuCell=first.locator('td[data-col="sku"]')
  const statusCell=first.locator('td[data-col="status"]')
  assert.equal(await skuCell.locator('.warehouse-inline-item-skip-trigger').count(),2,
    'per-product skip buttons sit beside SKU matching in SKU column '+width)
  assert.equal(await statusCell.locator('button').count(),0,
    'status column contains no skip action '+width)
  const pair=skuCell.locator('.warehouse-inline-sku-pair').first()
  const match=pair.locator('.warehouse-inline-sku-trigger')
  const skip=pair.getByRole('button',{name:/Bỏ qua kho sản phẩm/})
  assert.equal((await skip.innerText()).trim(),'',
    'skip action is icon-only without visible text '+width)
  assert.equal(await skip.locator('svg').count(),1,
    'skip icon is still visible and accessible '+width)
  const [matchBox,skipBox,skuBox]=await Promise.all([match.boundingBox(),skip.boundingBox(),skuCell.boundingBox()])
  assert.ok(skipBox&&Math.abs(skipBox.width-18)<=1&&Math.abs(skipBox.height-18)<=1,
    'skip icon has the same compact 18px control at all widths '+width)
  assert.ok(matchBox&&skipBox&&skuBox&&
    skipBox.x>=matchBox.x+matchBox.width-1&&
    Math.abs(skipBox.y+skipBox.height/2-(matchBox.y+matchBox.height/2))<=4&&
    skipBox.x+skipBox.width<=skuBox.x+skuBox.width+2,
    'skip aligns beside Chờ ghép without spilling into next column '+width+' '+JSON.stringify({matchBox,skipBox,skuBox}))
  await skip.click()
  const dialog=page.getByRole('dialog',{name:'Bỏ qua kho sản phẩm'})
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button',{name:'Xác nhận bỏ qua'}).isDisabled(),true,
    'Preview item skip remains read-only '+width)
  await dialog.getByLabel('Lý do bỏ qua sản phẩm').fill('Quà tặng không quản lý tồn')
  assert.equal(await dialog.getByRole('button',{name:'Xác nhận bỏ qua'}).isDisabled(),true,
    'read-only Preview does not write even with a valid reason '+width)
  assert.equal(await skuCell.locator('.warehouse-inline-item-skip-trigger').count(),2,
    'each unmapped product has a SKU-adjacent skip action '+width)
  assert.deepEqual(await page.evaluate(()=>window.__warehouseCalls??[]),[],
    'opening the skip dialog must never trigger an action '+width)
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(),0,'Esc closes the skip dialog '+width)
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  const first=page.locator('.warehouse-unified-group[data-warehouse-code="BG"] tbody tr').first()
  await first.getByRole('button',{name:/Bỏ qua kho sản phẩm/}).first().click()
  const dialog=page.getByRole('dialog',{name:'Bỏ qua kho sản phẩm'})
  assert.equal(await dialog.getByRole('button',{name:'Xác nhận bỏ qua'}).isDisabled(),true,
    'reason is required before per-item skip')
  await dialog.getByLabel('Lý do bỏ qua sản phẩm').fill('Sản phẩm biếu tặng không nhập tồn')
  await dialog.getByRole('button',{name:'Xác nhận bỏ qua'}).click()
  await page.getByRole('status').filter({hasText:'Đã lưu bỏ qua kho'}).waitFor()
  const calls=await page.evaluate(()=>({actions:window.__warehouseCalls??[],stock:window.__bulkCalls??[]}))
  assert.equal(calls.actions.length,1,'exactly one item skip action')
  assert.equal(calls.actions[0].name,'skip')
  assert.equal(calls.actions[0].input.orderItemId,'20000000-0000-0000-0000-000000000001')
  assert.equal(calls.actions[0].input.reason,'Sản phẩm biếu tặng không nhập tồn')
  assert.equal(calls.actions[0].input.variantId,undefined,'skip must not require mapped variant')
  assert.equal(calls.actions[0].input.newSku,undefined,'skip must not fabricate a SKU')
  assert.equal(calls.stock.length,0,'item skip saves no stock')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="skip-mixed">'),{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  const first=bg.locator('tbody tr').first()
  assert.equal(await first.locator('td[data-col="sku"]').innerText().then(x=>x.includes('Bỏ qua kho')),true,
    'saved no-SKU skip displays its actual decision')
  assert.equal(await first.getByRole('button',{name:/Bỏ qua kho sản phẩm/}).count(),0,
    'saved skipped product must not show another skip control')
  const selector=first.getByRole('checkbox')
  assert.equal(await selector.count(),1,'mixed order with no-SKU SKIP is ready to process')
  await selector.check()
  const toolbar=bg.locator('.warehouse-bulk-toolbar')
  assert.match(await toolbar.innerText(),/1 đơn được chọn/)
  await toolbar.getByRole('button',{name:/Xem trước nhập hàng loạt/}).click()
  const popup=page.locator('[role="dialog"][data-warehouse-bulk-popup="BG"]')
  await popup.waitFor()
  assert.match(await popup.innerText(),/Bỏ qua kho/,'one item is skipped')
  assert.match(await popup.innerText(),/2 → 2/,'only mapped purchase line creates stock units')
  assert.equal(await popup.getByRole('button',{name:/Xác nhận nhập/}).isDisabled(),true,
    'read-only Preview never writes a mixed order')
  await page.close()
}
console.log('PASS item-level no-SKU SKIP · 4 viewports · reason required · mixed order preview · zero fake stock')

// Bulk receipt QA: non-destructive Preview confirmation and saved V2 mixed
// decisions, then a live-mode mock with partial success and retry visibility.
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html,{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  const hn=page.locator('.warehouse-unified-group[data-warehouse-code="HN"]')
  assert.equal(await bg.locator('.warehouse-bulk-shortcut').count(),1,
    'BG bulk receipt shortcut must be discoverable')
  assert.equal(await hn.locator('.warehouse-bulk-shortcut').count(),1,
    'V2 saved decisions must be eligible for batch processing')
  await hn.locator('.warehouse-bulk-shortcut').click()
  const review=page.locator('[role="dialog"][data-warehouse-bulk-popup="HN"]')
  await review.waitFor()
  assert.match(await review.innerText(),/Kiểm tra trước khi ghi tồn/)
  assert.match(await review.innerText(),/1\s*dòng bỏ qua/)
  assert.match(await review.innerText(),/Bỏ qua kho/)
  assert.match(await review.innerText(),/SKU bán ghép/)
  assert.match(await review.innerText(),/Giá gốc\/SP/)
  assert.match(await review.innerText(),/Giá bán\/SP/)
  assert.match(await review.innerText(),/35\\.000|35,000|35000|Chưa có/)
  assert.equal(await review.getByRole('checkbox').count(),0,
    'Preview popup must not require an extra checked-agreement step')
  assert.equal(await review.getByRole('button',{name:/Xác nhận nhập/}).isDisabled(),true,
    'Preview must never allow the stock submission')
  await page.screenshot({path:path.join(output,'warehouse-bulk-preview-v2-skip.png')})
  await review.getByRole('button',{name:'Hủy'}).click()
  assert.equal(await page.locator('[role="dialog"][data-warehouse-bulk-popup="HN"]').count(),0,'cancel bulk popup')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="bulk">'),{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  await bg.locator('.warehouse-bulk-shortcut').click()
  const review=page.locator('[role="dialog"][data-warehouse-bulk-popup="BG"]')
  await review.waitFor()
  assert.match(await bg.locator('.warehouse-bulk-toolbar').innerText(),/2 đơn được chọn/)
  assert.equal(await review.locator('.warehouse-bulk-review-table').count(),1,
    'one flat table only; no accordion per order')
  assert.equal(await review.locator('.warehouse-bulk-review-table thead th').count(),7,
    'bulk preview retains 7 comparison columns')
  assert.equal(await review.locator('.warehouse-bulk-review-table tbody tr').count(),4,
    'all product lines shown without opening an order')
  const orderCells=await review.locator('.warehouse-bulk-order-cell').evaluateAll(cells=>
    cells.map(cell=>({rowspan:cell.rowSpan,text:cell.querySelector('button')?.textContent?.trim()})))
  assert.equal(orderCells.length,2,'order code appears exactly once per order')
  assert.deepEqual(orderCells.map(cell=>cell.rowspan),[2,2],
    'each code must span its own two product lines')
  assert.equal(new Set(orderCells.map(cell=>cell.text)).size,2,
    'different orders must keep separate codes even with identical products')
  assert.deepEqual(await review.locator('tbody tr').evaluateAll(rows=>
    rows.map(row=>row.dataset.reviewOrder).reduce((acc,id)=>{
      acc[id]=(acc[id]??0)+1;return acc
    },{})),Object.fromEntries(await review.locator('.warehouse-bulk-order-cell').evaluateAll(cells=>
      cells.map(cell=>[cell.parentElement?.dataset.reviewOrder,2]))),
    'each product row must remain linked to its original order')
  assert.match(await review.innerText(),/2 đơn nhập toàn bộ/)
  assert.equal(await review.getByRole('checkbox').count(),0,
    'Live popup must not show the redundant agreement checkbox')
  assert.equal(await review.getByRole('button',{name:'Xác nhận nhập 2 đơn'}).isEnabled(),true,
    'Live confirmation should be ready after reviewing eligible orders, without extra checkbox')
  await page.evaluate(()=>{window.__bulkPartial=true})
  await review.getByRole('button',{name:'Xác nhận nhập 2 đơn'}).click()
  await page.getByText('1 đơn đã xử lý thành công',{exact:false}).waitFor()
  const calls=await page.evaluate(()=>({calls:window.__bulkCalls||[],refresh:window.__refreshCalls||0}))
  assert.equal(calls.calls.length,1,'only one batched Server Action call')
  assert.equal(calls.calls[0].orderIds.length,2,'two selected orders passed to one action')
  assert.ok(calls.refresh>0,'successful batch requests refresh stored order state')
  assert.match(await bg.locator('.warehouse-bulk-toolbar').innerText(),/1 đơn được chọn/,
    'only failed orders remain selected after partial batch receipt')
  assert.match(await page.locator('.warehouse-bulk-feedback').innerText(),/1 đơn chưa xử lý/)
  await page.screenshot({path:path.join(output,'warehouse-bulk-partial-result.png')})
  await page.close()
}
// The bulk preview must remain operable as part of the native table workspace
// on narrow portrait/landscape devices, not just a Desktop-only action.
for(const [width,height] of [[360,800],[568,320]]){
  const page=await browser.newPage({viewport:{width,height}})
  // Two visually similar BG orders while remaining strictly Preview read-only.
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="bulk">'),{waitUntil:'load'})
  // The detail slidebar must remain closed until a code is clicked;
  // bulk selection does not require opening or dismissing it.
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'bulk preview on mobile must start with no unsolicited slidebar '+width)
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  await bg.locator('.warehouse-bulk-shortcut').click()
  const review=page.locator('[role="dialog"][data-warehouse-bulk-popup="BG"]')
  await review.waitFor()
  const horizontal=await page.evaluate(()=>({
    document:document.documentElement.scrollWidth-window.innerWidth,
    lane:document.querySelector('.warehouse-receive-table-lane').scrollWidth-
      document.querySelector('.warehouse-receive-table-lane').clientWidth,
  }))
  assert.ok(horizontal.document<=3 && horizontal.lane<=3,
    'bulk review causes horizontal overflow at '+width+'x'+height+': '+JSON.stringify(horizontal))
  assert.ok(await review.getByRole('button',{name:/Xác nhận nhập/}).isDisabled(),
    'Preview must block bulk writes even on mobile '+width)
  assert.equal(await review.locator('.warehouse-bulk-review-table').count(),1,
    'mobile popup must remain one table '+width)
  assert.equal(await review.locator('.warehouse-bulk-order-cell').count(),2,
    'mobile order code appears once per order '+width)
  const mobileTable=await review.locator('.warehouse-bulk-review').evaluate(node=>({
    scrollX:node.scrollWidth-node.clientWidth,
    viewportX:document.documentElement.scrollWidth-window.innerWidth,
    tableDisplay:getComputedStyle(node.querySelector('table')).display,
    tbodyDisplay:getComputedStyle(node.querySelector('tbody')).display,
  }))
  assert.equal(mobileTable.tableDisplay,'table','mobile must preserve single actual table '+width)
  assert.equal(mobileTable.tbodyDisplay,'table-row-group','mobile must preserve native tbody '+width)
  assert.ok(mobileTable.scrollX>150,'mobile popup must allow horizontal swipe inside table '+width)
  assert.ok(mobileTable.viewportX<=3,'mobile popup must not overflow whole document '+width)
  await page.screenshot({path:path.join(output,'warehouse-bulk-'+width+'-'+height+'.png')})
  await review.getByRole('button',{name:'Hủy'}).click({timeout:10000})
  assert.equal(await page.locator('[role="dialog"][data-warehouse-bulk-popup="BG"]').count(),0,
    'bulk popup must be dismissible on mobile '+width)
  await page.close()
}
console.log('PASS bulk mobile review · 360x800 and 568x320 · no horizontal overflow')

console.log('PASS bulk warehouse Preview safety · V2 SKIP summary · partial success retained')

// Correcting a wrong DRAFT SKU must be possible from the table, with the
// saved price/factor/decision prefilled, without opening order detail or stock.
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html,{waitUntil:'load'})
  const hn=page.locator('.warehouse-unified-group[data-warehouse-code="HN"]')
  const edit=hn.getByRole('button',{name:/Sửa ghép SKU TEST-01/}).first()
  await edit.waitFor()
  assert.equal(await edit.locator('svg').count(),1,
    'existing SKU uses a small visible edit pencil '+width)
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'SKU editing does not auto-open the order slidebar '+width)
  await edit.click()
  const dialog=page.getByRole('dialog',{name:'Sửa ghép SKU'})
  await dialog.waitFor()
  assert.match(await dialog.locator('.warehouse-sku-browser-results button.active').first().innerText(),/TEST-01/,
    'saved variant takes precedence over history '+width)
  assert.equal(await dialog.getByLabel('Giá bán ghép nhanh').inputValue(),'90000',
    'saved sale price is prefilled '+width)
  assert.equal(await dialog.getByLabel('Hệ số ghép nhanh').inputValue(),'1',
    'saved inventory multiplier is prefilled '+width)
  assert.equal(await dialog.getByRole('button',{name:'Nhập kho',exact:true}).getAttribute('aria-pressed'),'true',
    'saved IN decision remains prefilled '+width)
  await pickInlineClassification(dialog,'ALT-02')
  assert.equal(await dialog.getByLabel('Giá bán ghép nhanh').inputValue(),'65000',
    'manually changing SKU picks its catalog price without a write '+width)
  assert.equal(await dialog.getByRole('button',{name:'Nhập kho',exact:true}).getAttribute('aria-pressed'),'true',
    'correcting a draft IN mapping does not force a new decision '+width)
  assert.equal(await dialog.getByRole('button',{name:'Lưu thay đổi'}).isDisabled(),true,
    'read-only Preview never saves a remapping '+width)
  assert.deepEqual(await page.evaluate(()=>window.__warehouseCalls??[]),[],
    'opening and inspecting a remap cannot create stock or SKU writes '+width)
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(),0,'Escape closes correction editor '+width)
  const finalized=page.locator('tbody tr').filter({hasText:'261106SPXITEM003'})
  assert.equal(await finalized.locator('.warehouse-inline-sku-edit-trigger').count(),0,
    'a finalized order must not offer SKU correction '+width)
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  const hn=page.locator('.warehouse-unified-group[data-warehouse-code="HN"]')
  const edit=hn.getByRole('button',{name:/Sửa ghép SKU TEST-01/}).first()
  await edit.click()
  const dialog=page.getByRole('dialog',{name:'Sửa ghép SKU'})
  await pickInlineClassification(dialog,'ALT-02')
  await dialog.getByLabel('Hệ số ghép nhanh').fill('3')
  await dialog.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.getByRole('status').filter({hasText:'Đã cập nhật ghép SKU'}).waitFor()
  const state=await page.evaluate(()=>({
    calls:window.__warehouseCalls??[],
    stock:window.__bulkCalls??[],
    refresh:window.__refreshCalls??0
  }))
  assert.equal(state.calls.length,1,'exactly one update RPC is invoked')
  assert.equal(state.calls[0].name,'save')
  assert.equal(state.calls[0].input.orderItemId,'20000000-0000-0000-0000-000000000005')
  assert.equal(state.calls[0].input.variantId,'V-ALT','wrong SKU replaced by explicit new selection')
  assert.equal(state.calls[0].input.salePrice,65000,'updated sale price matches chosen SKU')
  assert.equal(state.calls[0].input.multiplier,3,'updated conversion factor is saved')
  assert.equal(state.calls[0].input.decision,'IN','existing warehouse choice retained')
  assert.equal(state.calls[0].input.newSku,null,'fixing a mapping never creates a fake new product')
  assert.deepEqual(state.stock,[],'remapping draft never writes warehouse inventory')
  assert.ok(state.refresh>0,'successful correction refreshes authoritative server data')
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'correction must not open the detail slidebar')
  await page.close()
}
{
  // Simulates the next server render after refresh / reload with the corrected
  // persisted decision returned from Supabase, not stale local input.
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="corrected-mapping">'),{waitUntil:'load'})
  const corrected=page.getByRole('button',{name:/Sửa ghép SKU ALT-02/}).first()
  await corrected.waitFor()
  await corrected.click()
  const dialog=page.getByRole('dialog',{name:'Sửa ghép SKU'})
  assert.match(await dialog.locator('.warehouse-sku-browser-results button.active').first().innerText(),/ALT-02/)
  assert.equal(await dialog.getByLabel('Giá bán ghép nhanh').inputValue(),'65000')
  assert.equal(await dialog.getByLabel('Hệ số ghép nhanh').inputValue(),'3')
  await page.close()
}
console.log('PASS saved SKU remap · 4 responsive viewports · DRAFT edits · finalized lock · no stock · refreshed mapping')

// One parent SKU may have multiple distinct sellable variants, each with
// independently entered pricing. Existing variants keep their catalog prices.
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html,{waitUntil:'load'})
  await page.locator('.warehouse-inline-sku-trigger:not(.warehouse-inline-sku-edit-trigger)').first().click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.getByRole('button',{name:'Thêm phân loại'}).click()
  await picker.getByLabel('Giá bán ghép nhanh').waitFor({state:'hidden',timeout:8000})
  assert.equal(await picker.getByLabel('Tên phân loại mới của SKU cũ').count(),0,
    'classification step is hidden until SKU selected '+width)
  if(await picker.getByRole('button',{name:'Đổi SKU gốc'}).count()){
    assert.equal(await picker.locator('.warehouse-sku-product-selected').count(),1,
      'selected SKU uses compact one-line summary')
    await picker.getByRole('button',{name:'Đổi SKU gốc'}).click()
  }
  await picker.locator('.warehouse-sku-browser-results button').filter({hasText:'TEST-01'}).first().click()
  await picker.getByLabel('Giá bán ghép nhanh').waitFor({state:'visible',timeout:8000})
  assert.equal(await picker.getByLabel('Giá bán ghép nhanh').inputValue(),'',
    'new classification price must not inherit old SKU variant price')
  assert.equal(await picker.locator('.warehouse-sku-product-selected').count(),1,
    'product list collapses after selection')
  await picker.getByLabel('Tên phân loại mới của SKU cũ').fill('Mẫu')
  assert.match(await picker.getByRole('alert').innerText(),/Phân loại này đã tồn tại/,
    'duplicate classification warned at source '+width)
  assert.equal(await picker.getByRole('button',{name:'Lưu ghép SKU'}).isDisabled(),true,
    'cannot create existing classification twice '+width)
  await picker.getByLabel('Tên phân loại mới của SKU cũ').fill('Màu đỏ')
  await picker.getByLabel('Giá bán ghép nhanh').fill('145000')
  await picker.getByRole('button',{name:'Nhập kho',exact:true}).click()
  assert.equal(await picker.getByRole('button',{name:'Lưu ghép SKU'}).isDisabled(),true,
    'read-only Preview must not create even a valid classification '+width)
  const rect=await picker.boundingBox()
  assert.ok(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&
    rect.y+rect.height<=height+1,'variant picker fits viewport '+width)
  assert.deepEqual(await page.evaluate(()=>window.__warehouseCalls??[]),[],
    'Preview classification is non-mutating '+width)
  await page.keyboard.press('Escape')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  await page.locator('.warehouse-inline-sku-trigger:not(.warehouse-inline-sku-edit-trigger)').first().click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.getByRole('button',{name:'Thêm phân loại'}).click()
  if(await picker.getByRole('button',{name:'Đổi SKU gốc'}).count()){
    assert.equal(await picker.locator('.warehouse-sku-product-selected').count(),1,
      'selected SKU uses compact one-line summary')
    await picker.getByRole('button',{name:'Đổi SKU gốc'}).click()
  }
  await picker.locator('.warehouse-sku-browser-results button').filter({hasText:'TEST-01'}).first().click()
  await picker.getByLabel('Giá bán ghép nhanh').waitFor({state:'visible',timeout:8000})
  assert.equal(await picker.getByLabel('Giá bán ghép nhanh').inputValue(),'',
    'new classification price must not inherit old SKU variant price')
  assert.equal(await picker.locator('.warehouse-sku-product-selected').count(),1,
    'product list collapses after selection')
  await picker.getByLabel('Tên phân loại mới của SKU cũ').fill('Màu xanh')
  await picker.getByLabel('Giá bán ghép nhanh').fill('159000')
  await picker.getByRole('button',{name:'Nhập kho',exact:true}).click()
  await picker.getByRole('button',{name:'Lưu ghép SKU'}).click()
  await page.getByRole('status').filter({hasText:'Đã lưu ghép SKU cho đơn'}).waitFor()
  const state=await page.evaluate(()=>({
    calls:window.__warehouseCalls??[],refresh:window.__refreshCalls??0,
    stock:window.__bulkCalls??[]
  }))
  assert.equal(state.calls.length,1)
  assert.equal(state.calls[0].name,'add_variant','new variant uses its atomic RPC')
  assert.equal(state.calls[0].input.productId,'30000000-0000-4000-8000-000000000001',
    'parent SKU is existing, not recreated')
  assert.equal(state.calls[0].input.variantName,'Màu xanh')
  assert.equal(state.calls[0].input.salePrice,159000,'new sale price independent of existing variant')
  assert.equal(state.calls[0].input.decision,'IN')
  assert.deepEqual(state.stock,[],'adding classification never writes inventory')
  assert.ok(state.refresh>0,'new classification mapping revalidates database view')
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'adding classification inline must not open detail slidebar')
  await page.close()
}
{
  // The order-code slidebar also supports creating a new classification,
  // but never by clicking a product cell.
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  await page.locator('tbody tr').first().locator('button.table-link').click()
  const detail=page.locator('aside.warehouse-intake-panel')
  await detail.waitFor()
  await detail.getByRole('button',{name:'Thêm phân loại'}).click()
  await detail.getByLabel('Nhập phân loại mới của SKU cũ').waitFor({state:'hidden',timeout:8000})
  if(await detail.getByRole('button',{name:'Đổi SKU gốc'}).count())
    await detail.getByRole('button',{name:'Đổi SKU gốc'}).click()
  await detail.locator('.warehouse-detail-v2-sku-results button').filter({hasText:'TEST-01'}).first().click()
  assert.equal(await detail.locator('.warehouse-detail-v2-product-selected').count(),1,
    'order detail collapses selected SKU into a single line')
  await detail.getByLabel('Nhập phân loại mới của SKU cũ').fill('Size XL')
  const fields=detail.locator('.warehouse-detail-v2-numeric input')
  await fields.first().fill('179000')
  await detail.getByRole('button',{name:'Lưu bóc tách và quyết định'}).click()
  await detail.getByRole('status').filter({hasText:'Đã lưu SKU'}).waitFor()
  const calls=await page.evaluate(()=>window.__warehouseCalls??[])
  assert.equal(calls.length,1)
  assert.equal(calls[0].name,'add_variant','detail editor must call the same safe RPC')
  assert.equal(calls[0].input.variantName,'Size XL')
  assert.equal(calls[0].input.salePrice,179000)
  assert.equal(await page.evaluate(()=>(window.__bulkCalls??[]).length),0)
  await page.close()
}
console.log('PASS one SKU · new priced classification · duplicate guard · 4 responsive sizes · inline and detail · no stock')


// Inline SKU draft: the best stored historic match is proposed in the table;
// operators explicitly confirm it with ONE button. No suggestion means an
// actionable create/search UI but no fabricated draft.
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html,{waitUntil:'load'})
  assert.ok(await page.locator('.warehouse-inline-sku-trigger').count()>0,
    'SKU without matching history can still open a create/search picker')
  assert.equal(await page.locator('.warehouse-inline-sku-confirm').count(),0,
    'no historical evidence means no one-click draft confirmation')
  await page.locator('.warehouse-inline-sku-trigger').first().click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.waitFor()
  assert.match(await picker.innerText(),/Chưa có lịch sử ghép tương tự/)
  assert.ok(await picker.getByRole('button',{name:'Tạo SKU mới'}).isVisible())
  await page.keyboard.press('Escape')
  await page.close()
}
for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="history">'),{waitUntil:'load'})
  const bg=page.locator('.warehouse-unified-group[data-warehouse-code="BG"]')
  const draft=bg.locator('.warehouse-inline-sku-trigger:not(.warehouse-inline-sku-edit-trigger)').filter({hasText:'TEST-01'})
  assert.equal(await draft.count(),1,'one ranked old SKU is prefilled as a draft '+width)
  assert.equal(await bg.locator('.warehouse-inline-sku-confirm').count(),1,
    'only the mapped-history draft gets one-click confirmation '+width)
  assert.equal(await bg.locator('td[data-col="sku"] .warehouse-inline-sku-pair').first()
    .locator('.warehouse-inline-item-skip-trigger').count(),1,
    'historically suggested SKU offers skip beside its confirm icon '+width)
  const quick=bg.getByRole('button',{name:/Xác nhận ghép SKU TEST-01/})
  assert.equal(await quick.isDisabled(),true,'read-only Preview blocks one-click save '+width)
  assert.deepEqual(await page.evaluate(()=>window.__warehouseCalls??[]),[],
    'history draft must never auto-save '+width)
  await draft.click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.waitFor()
  assert.equal(await picker.locator('.warehouse-inline-sku-history-options>button').count(),1,
    'only classifications belonging to chosen SKU are shown '+width)
  assert.equal(await picker.getByLabel('Giá bán ghép nhanh').inputValue(),'90000',
    'best-ranked old SKU is prefilled from catalog '+width)
  assert.equal(await picker.getByLabel('Hệ số ghép nhanh').inputValue(),'2',
    'conversion from historical mapping is prefilled '+width)
  assert.equal(await picker.getByRole('button',{name:'Nhập kho',exact:true}).getAttribute('aria-pressed'),'true',
    'IN is an unsaved default decision, never a stock import '+width)
  const bounds=await picker.boundingBox()
  assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&
    bounds.y+bounds.height<=height+1,
    'picker remains inside viewport '+width+'x'+height+' '+JSON.stringify(bounds))
  assert.equal(await picker.getByRole('button',{name:'Lưu ghép SKU'}).isDisabled(),true,
    'Preview never performs a database write '+width)
  await pickInlineClassification(picker,'ALT-02',true)
  assert.equal(await picker.getByLabel('Giá bán ghép nhanh').inputValue(),'65000',
    'operator can explicitly switch to another old matching SKU '+width)
  const saveRect=await picker.getByRole('button',{name:'Lưu ghép SKU'}).boundingBox()
  assert.ok(saveRect&&saveRect.y>=0&&saveRect.y+saveRect.height<=height+1,
    'footer remains in viewport when expanded '+width)
  await page.keyboard.press('Escape')
  assert.equal(await picker.count(),0,'Escape closes SKU picker '+width)
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="history">'),{waitUntil:'load'})
  const quick=page.getByRole('button',{name:/Xác nhận ghép SKU TEST-01/})
  await quick.click()
  await page.getByRole('status').filter({hasText:'Đã lưu ghép SKU TEST-01'}).waitFor()
  const calls=await page.evaluate(()=>({save:window.__warehouseCalls??[],stock:window.__bulkCalls??[],refresh:window.__refreshCalls??0}))
  assert.equal(calls.save.length,1,'one-click match invokes the save action just once')
  assert.equal(calls.save[0].name,'save')
  assert.equal(calls.save[0].input.variantId,'V-SKU','top-ranked SKU is the saved draft')
  assert.equal(calls.save[0].input.salePrice,90000,'catalog sale price is not guessed')
  assert.equal(calls.save[0].input.multiplier,2,'historical conversion is retained')
  assert.equal(calls.save[0].input.decision,'IN','saved decision is proposed IN only, no stock movement')
  assert.equal(calls.stock.length,0,'SKU confirmation must never create inventory')
  assert.ok(calls.refresh>0,'successful SKU save refreshes the table')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="history">'),{waitUntil:'load'})
  await page.locator('.warehouse-inline-sku-trigger:not(.warehouse-inline-sku-edit-trigger)').filter({hasText:'TEST-01'}).click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await pickInlineClassification(picker,'ALT-02',true)
  await picker.getByRole('button',{name:'Lưu ghép SKU'}).click()
  await page.getByRole('status').filter({hasText:'Đã lưu ghép SKU cho đơn'}).waitFor()
  const calls=await page.evaluate(()=>window.__warehouseCalls??[])
  assert.equal(calls.length,1)
  assert.equal(calls[0].input.variantId,'V-ALT','alternate old mapping may be manually selected')
  assert.equal(calls[0].input.decision,'IN','explicit click confirms the current draft')
  assert.equal(await page.evaluate(()=>(window.__bulkCalls??[]).length),0)
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  await page.locator('.warehouse-inline-sku-trigger').first().click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.getByRole('button',{name:'Tạo SKU mới'}).click()
  await picker.getByLabel('Mã SKU bán mới ghép nhanh').fill('NEW-SKU-QA-01')
  assert.equal(await picker.getByLabel('Tên SKU mới ghép nhanh').inputValue().then(x=>x.length>0),true)
  assert.equal(await picker.getByLabel('Giá bán ghép nhanh').inputValue(),'',
    'new SKU price must be provided explicitly, not guessed from history')
  await picker.getByLabel('Giá bán ghép nhanh').fill('75000')
  await picker.getByRole('button',{name:'Nhập kho',exact:true}).click()
  await picker.getByRole('button',{name:'Lưu ghép SKU'}).click()
  await page.getByRole('status').filter({hasText:'Đã lưu ghép SKU cho đơn'}).waitFor()
  const calls=await page.evaluate(()=>window.__warehouseCalls??[])
  assert.equal(calls.length,1,'new SKU saves through same existing Server Action')
  assert.equal(calls[0].input.variantId,null)
  assert.equal(calls[0].input.newSku,'NEW-SKU-QA-01')
  assert.equal(calls[0].input.newName?.length>0,true)
  assert.equal(calls[0].input.salePrice,75000)
  assert.equal(calls[0].input.decision,'IN')
  assert.equal(await page.evaluate(()=>(window.__bulkCalls??[]).length),0,
    'new SKU creation must not change inventory balances')
  await page.close()
}
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true" data-scenario="history">'),{waitUntil:'load'})
  await page.locator('.warehouse-inline-sku-trigger:not(.warehouse-inline-sku-edit-trigger)').filter({hasText:'TEST-01'}).click()
  const picker=page.getByRole('dialog',{name:'Ghép SKU nhanh'})
  await picker.getByRole('button',{name:'Bỏ qua kho',exact:true}).click()
  assert.equal(await picker.getByRole('button',{name:'Lưu ghép SKU'}).isDisabled(),true,
    'SKIP still requires a reason')
  await picker.getByLabel('Lý do bỏ qua ghép nhanh').fill('Không nhập sản phẩm mẫu')
  await picker.getByRole('button',{name:'Lưu ghép SKU'}).click()
  await page.getByRole('status').filter({hasText:'Đã lưu ghép SKU cho đơn'}).waitFor()
  const calls=await page.evaluate(()=>window.__warehouseCalls??[])
  assert.equal(calls[0].input.decision,'SKIP')
  assert.equal(calls[0].input.skipReason,'Không nhập sản phẩm mẫu')
  assert.equal(await page.evaluate(()=>(window.__bulkCalls??[]).length),0)
  await page.close()
}
console.log('PASS inline SKU draft · one-click confirmation · new SKU · alternatives · Preview read-only · no stock writes')

// Prior SKU history: two conflicting saved mappings are shown separately.
// Choosing one changes ONLY the client draft; save/persistence stays explicit.
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-scenario="history">'),{waitUntil:'load'})
  assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,
    'history suggestions must not auto-open details')
  await page.locator('.warehouse-unified-table tbody tr').first().locator('button.table-link').click()
  const panel=page.locator('.warehouse-intake-panel')
  await panel.locator('.warehouse-detail-v2-product-results').waitFor()
  assert.equal(await panel.locator('.warehouse-detail-v2-classification-results').count(),0,
    'historical classifications remain hidden until parent SKU is chosen')
  assert.match(await panel.locator('.warehouse-detail-v2-product-results').innerText(),
    /Đã có gợi ý ghép từ lịch sử/, 'history markers are shown on parent SKUs')
  assert.match(await panel.locator('.warehouse-detail-v2-progress').innerText(),/0\/2 đã có quyết định SKU\/kho/)
  await pickDetailClassification(panel,'ALT-02')
  assert.match(await panel.locator('.warehouse-detail-v2-classification-results button.active').first().innerText(),
    /ALT-02[\s\S]*1 đơn trước đã ghép/, 'history is scoped to selected product classification')
  assert.equal(await panel.getByLabel('Hệ số quy đổi').inputValue(),'1',
    'suggestion should carry prior saved conversion multiplier')
  assert.equal(await panel.getByLabel('Giá bán (sửa được)').inputValue(),'65000',
    'catalog sale price is prefilled for manual edit, not persisted automatically')
  assert.match(await panel.locator('.warehouse-detail-v2-progress').innerText(),/0\/2 đã có quyết định SKU\/kho/,
    'clicking historical SKU suggestion must NOT claim a saved mapping')
  assert.deepEqual(await page.evaluate(()=>window.__warehouseCalls??[]),[],
    'suggestions may not call server actions or write stock')
  await page.screenshot({path:path.join(output,'warehouse-sku-history-choices.png')})
  await page.close()
}
console.log('PASS history suggestions · multiple candidates · manual select · no auto-write')

// A second independent browser scenario exercises the live Server Action
// bridge with stubbed RPCs. It never contacts Supabase.
{
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  await page.setContent(html.replace('<html lang="vi">','<html lang="vi" data-live="true">'),{waitUntil:'load'})
  assert.equal(await page.locator('aside.warehouse-detail-v2').count(),0,
    'live details must also remain closed before order-code click')
  await page.locator('.warehouse-unified-table tbody tr').first().locator('button.table-link').click()
  const panel=page.locator('aside.warehouse-detail-v2')
  await panel.locator('.warehouse-detail-v2-product').first().waitFor()
  assert.equal(await panel.getByRole('button',{name:'Ghi nhận lựa chọn thử'}).count(),0,
    'live mode must not expose simulator save button')
  await pickDetailClassification(panel,'TEST-01')
  await panel.getByRole('button',{name:'Lưu bóc tách và quyết định'}).click()
  await panel.getByText('Đã lưu SKU, giá và quyết định kho.',{exact:false}).waitFor()
  await panel.locator('.warehouse-detail-v2-product').nth(1).click()
  await pickDetailClassification(panel,'TEST-01')
  await panel.getByRole('button',{name:'Bỏ qua kho',exact:true}).click()
  await panel.getByLabel('Lý do bỏ qua kho (bắt buộc)').fill('Không nhập kho')
  await panel.getByRole('button',{name:'Lưu bóc tách và quyết định'}).click()
  await panel.getByRole('button',{name:'Chốt xử lý kho'}).click()
  await panel.getByRole('button',{name:'Xác nhận ghi tồn kho'}).click()
  await panel.getByText('Đã chốt xử lý kho.',{exact:false}).waitFor()
  const calls=await page.evaluate(()=>({calls:window.__warehouseCalls||[],refreshes:window.__refreshCalls||0}))
  assert.deepEqual(calls.calls.map(x=>x.name),['save','save','finalize'],
    'live UI must call two persisted saves then one atomic finalization')
  assert.deepEqual(calls.calls.slice(0,2).map(x=>x.input.decision),['IN','SKIP'],
    'live UI must preserve independent per-item decisions')
  assert.ok(calls.refreshes>=3,'live saves/finalize must refresh authoritative server data')
  assert.equal(await panel.getByRole('button',{name:'Chốt xử lý kho'}).count(),0,
    'processed order must not offer a second stock receipt')
  await page.screenshot({path:path.join(output,'warehouse-v2-live-action-mock.png')})
  await page.close()
  console.log('PASS 1280x800 live action bridge · save per item ×2 · atomic finalize ×1 (mock)')
}
}finally{await browser.close()}

console.log('14/14 responsive warehouse fixture QA PASS. These are mocked fixtures, not authenticated production data.')
