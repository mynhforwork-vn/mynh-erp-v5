import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { build } from 'esbuild'
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs'
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
  "  cod:50000*(i+1),order_date:'2026-11-01T12:00:00+07:00',",
  "  receive_batch_details:[{receive_batches:{warehouse_id:i<4?'BG':'HN',received_at:'2026-11-06T08:00:00+07:00',warehouses:{code:i<4?'BG':'HN',name:'Kho nhận',address:i<4?'320 Nguyễn Công Hãng':'164 Hồng Mai'}}}],",
  "  order_items:[{id:'20000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),product_name:long,sku:'SRC-'+i,variant:'Phân loại mẫu 500ml',quantity:2,original_price:50000,final_price:35000,inventory_multiplier:1,product_variant_id:(i===1||i===2||i===3||i===4)?'V-SKU':null,product_variants:(i===1||i===2||i===3||i===4)?{id:'V-SKU',variant_name:'Mẫu',sale_price:90000,products:{sku:'TEST-01',name:'Đã map'}}:null},",
  "  {id:'30000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),product_name:'Sữa tắm hương hoa nhài',sku:'SRC-OTHER',variant:'Dạng chai',quantity:1,product_variant_id:(i===1||i===2||i===3||i===4)?'V-SKU':null,product_variants:(i===1||i===2||i===3||i===4)?{id:'V-SKU',variant_name:'Mẫu',products:{sku:'TEST-01',name:'Đã map'}}:null}]",
  '}))',
  "function Fixture(){const [status,setStatus]=React.useState('all'); const filtered=status==='done'?rows.filter(r=>r.warehouse_status!=='READY_TO_TRANSFER'):rows; return <div className='fixture-app'><div className='fixture-command'><button className='fixture-all' onClick={()=>setStatus('all')}>Tất cả</button><button className='fixture-done' onClick={()=>setStatus('done')}>Đã xử lý</button></div><WarehouseIntakeWorkspace rows={filtered} variants={[]} suggestions={{}} auditLogs={[]} previewOnly/></div>}",
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
    es.onLoad({filter:/.*/,namespace:'warehouse-qa'},()=>({
      contents:'export async function mapWarehouseOrderItem(){throw new Error("blocked")} export async function receiveOrdersIntoWarehouse(){throw new Error("blocked")} export async function skipWarehouseOrder(){throw new Error("blocked")}',
      loader:'js'
    }))
  }}]
})
const cssFiles=readdirSync(path.join(root,'app/styles')).filter(file=>file.endsWith('.css'))
const css=cssFiles.map(file=>readFileSync(path.join(root,'app/styles',file),'utf8')).join('\n')
const harnessCss=[
  'html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden;background:#f5f8fb;font-family:Arial,sans-serif}',
  '#root{box-sizing:border-box;max-width:100%;min-width:0}',
  '.fixture-app{box-sizing:border-box;width:calc(100% - 245px);height:calc(100dvh - 24px);margin-left:245px;padding:9px 14px;min-width:0;display:flex;flex-direction:column}',
  '.fixture-command{display:flex;gap:6px;flex:0 0 auto;min-height:34px}',
  '.fixture-command button{border:1px solid #cbd8e3;background:white;border-radius:5px;padding:5px 10px}',
  '.fixture-app .warehouse-intake-preview-layout{flex:1;min-height:0}',
  '@media(max-width:900px){.fixture-app{margin-left:0;width:100%;padding:7px;height:calc(100dvh - 16px)}}',
].join('\n')
const html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+harnessCss+'</style></head><body class="brand-shell-v1"><div id="root" class="tracking-screen-v2 whx-page warehouse-receive-screen"></div><script>'+readFileSync(outfile,'utf8')+'</script></body></html>'
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN, args:['--no-sandbox']})
try {
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1024,768],[1280,800],[1366,768],[1440,900],[1536,864]]){
    const page=await browser.newPage({viewport:{width,height}})
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.setContent(html,{waitUntil:'load'})
    await page.locator('.warehouse-unified-table tbody tr').first().waitFor({timeout:20000})
    const cards=page.locator('.warehouse-unified-group')
    assert.equal(await cards.count(),2,'two real receiving warehouses '+width)
    const list=await page.evaluate(()=>{
      const tables=[...document.querySelectorAll('.warehouse-unified-table')]
      const wraps=[...document.querySelectorAll('.warehouse-unified-table-wrap')]
      const panel=document.querySelector('aside.warehouse-intake-panel')
      const lane=document.querySelector('.warehouse-receive-table-lane')
      return {
        headers:tables.map(t=>t.querySelectorAll('th').length),
        rows:tables.map(t=>t.querySelectorAll('tbody tr').length),
        products:tables.map(t=>t.querySelectorAll('.warehouse-unified-products>div').length),
        widths:wraps.map(e=>({client:e.clientWidth,scroll:e.scrollWidth,table:e.querySelector('table')?.getBoundingClientRect().width})),
        pageOverflow:document.documentElement.scrollWidth-window.innerWidth,
        laneRight:lane?.getBoundingClientRect().right,
        panelLeft:panel?.getBoundingClientRect().left,
        panelRight:panel?.getBoundingClientRect().right,
        readOnlySubmit:[...document.querySelectorAll('.warehouse-intake-panel button[type="submit"]')].every(b=>b.disabled),
        labels:[...document.querySelectorAll('.warehouse-unified-table .status-pill')].map(e=>e.textContent?.trim()),
      }
    })
    assert.ok(list.headers.every(count=>count===7),'seven columns preserved '+width+' '+JSON.stringify(list))
    assert.equal(list.rows.reduce((a,b)=>a+b,0),8,'all includes processed and skipped '+width)
    assert.equal(list.products.reduce((a,b)=>a+b,0),16,'all products visible '+width)
    assert.ok(list.labels.includes('Đã bỏ qua kho')&&list.labels.includes('Đã nhập kho'),'processed statuses rendered '+width)
    assert.ok(list.readOnlySubmit,'write controls must be disabled in preview '+width)
    assert.ok(list.widths.every(x=>x.table>=x.client-3 && x.scroll>=x.client),'table must fill lane or scroll internally '+width)
    assert.ok(list.pageOverflow<=3,'document overflow '+width+' '+JSON.stringify(list))
    if(width>900&&list.panelLeft!==undefined&&list.panelLeft!==null) {
      assert.ok(list.panelLeft-list.laneRight>=10,'desktop panel overlaps table '+width+' '+JSON.stringify(list))
      assert.ok(list.panelRight<=width+3,'panel escapes viewport '+width+' '+JSON.stringify(list))
    }
    await page.screenshot({path:path.join(output,width+'-'+height+'-open.png')})
    await page.locator('aside.warehouse-intake-panel .close').click()
    await page.screenshot({path:path.join(output,width+'-'+height+'-closed.png')})
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),0,'close slidebar '+width)
    await page.locator('.warehouse-unified-order button.table-link').first().click()
    assert.equal(await page.locator('aside.warehouse-intake-panel').count(),1,'open original slidebar via order '+width)
    await page.locator('aside.warehouse-intake-panel .close').click()
    await page.locator('.fixture-done').click()
    const processed=await page.locator('.warehouse-unified-table tbody tr').count()
    assert.equal(processed,2,'processed KPI must show stored and skipped '+width)
    assert.deepEqual(errors,[],'no runtime errors '+width+': '+errors.join('; '))
    console.log('PASS '+width+'x'+height+' 7 columns · 2 warehouses · 8 orders (2 processed) · old slidebar · no document overflow')
    await page.close()
  }
}finally{await browser.close()}
console.log('8/8 responsive warehouse fixture QA PASS. These are mocked fixtures, not authenticated production data.')
