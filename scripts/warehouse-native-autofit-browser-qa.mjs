import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(), tmp=mkdtempSync(path.join(os.tmpdir(),'mynh-autofit-'));
const output=path.join(root,'qa-warehouse-native-autofit'); mkdirSync(output,{recursive:true});
const component=path.join(root,'components/warehouse-intake-native-design.tsx');
const settings=path.join(root,'components/warehouse-receiving-settings.tsx');
const entry=[
  "import React from 'react'",
  "import {createRoot} from 'react-dom/client'",
  'import {WarehouseIntakeNativeDesign} from '+JSON.stringify(component),
  'import {WarehouseReceivingSettings} from '+JSON.stringify(settings),
  "const title='Dầu gội đầu dành cho nam Clear Men sạch gàu dài suốt ngày với nhiều thông tin phân loại và thương hiệu - mặt hàng nhập kho mùa hè',",
  'rows=Array.from({length:14},(_,i)=>({',
  "  id:'30000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),",
  "  shopee_order_id:'261103C48K1GUU'+String(i+1).padStart(2,'0'),",
  "  order_date:'2026-11-03T15:09:00+07:00', warehouse_status:'READY_TO_TRANSFER', cod: (i+1)*15000,",
  "  receive_batch_details:[{receive_batches:{warehouse_id:i<4?'50000000-0000-0000-0000-000000000002':'50000000-0000-0000-0000-000000000001',received_at:'2026-11-03T15:09:00+07:00',warehouses:{code:i<4?'BG':'HN',name:i<4?'Kho BG':'Kho HN',address:i<4?'320 Nguyễn Công Hãng':'164 Hồng Mai'}}}],",
  "  order_items:[{id:'40000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),sku:'SP-'+i,product_name:title,variant:'Loại 110ml/180ml',quantity:2,original_price:129000,final_price:89000,product_variant_id:null,inventory_multiplier:1}, {id:'90000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),sku:'SP-2-'+i,product_name:'Sữa tắm hương hoa nhài - chai 500ml',variant:'500ml',quantity:1,original_price:65000,final_price:55000,product_variant_id:null,inventory_multiplier:1}]",
  '}))',
  "rows[1].order_items.forEach(item=>{item.product_variant_id='READY-TEST-SKU'})",
  "rows[2].warehouse_status='WAREHOUSE_RECEIVED'",
  "rows[3].warehouse_status='WAREHOUSE_SKIPPED'",
  "const skuVariant={id:'SKU-SALE-EXISTING',variant_name:'110ml',sale_price:155000,products:{sku:'SKU-EXISTING-110',name:'Dầu gội đầu dành cho nam Clear Men'}}",
  "const suggestions={[rows[0].order_items[0].id]:{variant_id:skuVariant.id,sku:'SKU-EXISTING-110',product_name:'Dầu gội đầu dành cho nam Clear Men',variant_name:'110ml',multiplier:2}}",
  "function Harness(){const [phase,setPhase]=React.useState('all');return <><div className='fixture-controls'><button className='fixture-done-kpi' onClick={()=>setPhase('done')}>KPI Đã xử lý</button><button className='fixture-work-kpi' onClick={()=>setPhase('all')}>KPI Tất cả</button><button className='fixture-pending-kpi' onClick={()=>setPhase('pending')}>KPI Chờ bóc tách</button><button className='fixture-ready-kpi' onClick={()=>setPhase('ready')}>KPI Chờ nhập kho</button><WarehouseReceivingSettings warehouses={[{id:'HN',code:'HN',name:'Kho HN',address:'164 Hồng Mai'},{id:'BG',code:'BG',name:'Kho BG',address:'320 Nguyễn Công Hãng'}]} defaultReceivingWarehouseId='HN' previewOnly dockToWorkspace/></div><div className='fixture-shell'><WarehouseIntakeNativeDesign rows={rows} variants={[skuVariant]} suggestions={suggestions} auditLogs={[]} initialPhase={phase}/></div></>}",
  "createRoot(document.getElementById('root')).render(<Harness/>)"
].join('\n');
const entryPath=path.join(tmp,'entry.tsx'), outfile=path.join(tmp,'bundle.js');
writeFileSync(entryPath,entry);
await build({entryPoints:[entryPath],outfile,absWorkingDir:root,bundle:true,platform:'browser',format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root},nodePaths:[path.join(root,'node_modules')],
  // Only the server-action import is mocked; the settings UI is the actual
  // application component and is mounted as a real portaled slidebar.
  plugins:[{name:'mock-server-action',setup(build){
    build.onResolve({filter:new RegExp('^@/lib/actions/warehouse
    build.onLoad({filter:/.*/,namespace:'qa-action'},()=>({contents:'export async function saveReceivingWarehouseSettings(){}',loader:'js'}));
  }}]
});
const cssFiles=readdirSync(path.join(root,'app/styles')).filter(f=>f.endsWith('.css')&&f!=='warehouse-native-design.css');
const css=cssFiles.map(f=>readFileSync(path.join(root,'app/styles',f),'utf8')).join('\n')+'\n'+readFileSync(path.join(root,'app/styles/warehouse-native-design.css'),'utf8');
const shellCss='body{margin:0;background:#f5f7fa;font-family:Arial,sans-serif}.fixture-controls{position:fixed;left:3px;top:3px;z-index:40;display:flex;gap:4px}.fixture-controls button{font-size:9px;border:1px solid #ccd;background:white}.fixture-shell{margin-left:252px;width:calc(100vw - 252px);padding:12px 16px;height:calc(100dvh - 24px);display:flex;min-width:0}.fixture-shell .wh-native{width:100%;height:100%;min-width:0}.fixture-shell .wh-native-workspace{height:calc(100% - 85px);min-height:0}@media(max-width:900px){.fixture-shell{margin-left:0;width:100%;padding:8px;height:100dvh}.fixture-shell .wh-native-workspace{height:calc(100% - 110px)}}';
const html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+shellCss+'</style></head><body class="brand-shell-v1"><div id="root"></div><script>'+readFileSync(outfile,'utf8')+'</script></body></html>';
const executable=process.env.CHROME_BIN||'/usr/bin/chromium';
const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
try{
 for(const [w,h] of [[1536,864],[1440,900],[1366,768],[1280,800],[1024,768],[768,1024],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width:w,height:h}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html,{waitUntil:'load',timeout:60000});
  await page.waitForSelector('.wh-native-table tbody tr.wh-native-data-row td',{timeout:20000});
  async function check(state){
   await page.waitForTimeout(150);
   const result=await page.evaluate(()=>{
    const t=document.querySelector('.wh-native-table'),wr=document.querySelector('.wh-native-table-wrap');
    const rects=Array.from(t.querySelector('tbody tr.wh-native-data-row').querySelectorAll('td')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:getComputedStyle(el).overflowX}});
    const lines=Array.from(t.querySelector('tbody tr.wh-native-data-row').querySelectorAll('.wh-native-product-line')).map(el=>({text:el.textContent,weight:getComputedStyle(el).fontWeight,wrap:getComputedStyle(el).whiteSpace,height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)}));
    const heads=Array.from(document.querySelectorAll('.wh-native-warehouse-head')).map(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth}));
    const listRect=document.querySelector('.wh-native-list').getBoundingClientRect();
    const panels=Array.from(document.querySelectorAll('.wh-native-workspace > aside.mynh-slide-panel')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});
    const fontSize=parseFloat(getComputedStyle(t.querySelector('tbody tr.wh-native-data-row td')).fontSize);
    return {
      table:t.getBoundingClientRect().width,
      wrap:wr.getBoundingClientRect().width,
      contentWidth:wr.scrollWidth,
      available:wr.clientWidth,
      overflow:document.documentElement.scrollWidth-innerWidth,
      cols:rects.length,
      headers:t.querySelectorAll('thead th').length,
      rects,lines,heads,fontSize,geometry:{listRight:listRect.right,panels},
      statusClasses:Array.from(document.querySelectorAll('tr.wh-native-data-row .status-pill')).map(el=>el.className),
      statusLabels:Array.from(document.querySelectorAll('tr.wh-native-data-row .status-pill')).map(el=>el.textContent?.trim()),
    };
   });
   assert.equal(result.cols,7,'all seven columns must remain in '+w+' '+state);
   assert.equal(result.headers,7,'all seven headers must remain in '+w+' '+state);
   assert.ok(result.table>=result.wrap-4,'table is not filling available width '+w+' '+state+' '+JSON.stringify(result));
   if(result.wrap>926){
     assert.ok(result.contentWidth-result.available<6,
       'unnecessary x-scroll when all columns can fit at '+w+' '+state+' '+JSON.stringify(result));
   }
   assert.ok(result.contentWidth>=result.table-3,'table content cut instead of inner scroll '+w+' '+state+' '+JSON.stringify(result));
   const allowedLabels=['Chờ bóc tách','Chờ nhập kho','Đã xử lý'];
   assert.ok(result.statusLabels.every(t=>allowedLabels.includes(t)),
     'unknown order status at '+w+' '+state+': '+result.statusLabels.join(','));
   assert.ok(result.fontSize<=10.1,'table data too large '+w+' '+state+' '+result.fontSize);
   if(result.geometry.panels.length){
     const first=result.geometry.panels[0];
     if(w>900){
       assert.ok(first.left>=result.geometry.listRight-1,'desktop slidebar overlaps table '+w+' '+state);
       assert.ok(first.left-result.geometry.listRight>=10,'desktop table/slidebar gap too small '+w+' '+state);
       assert.ok(first.left-result.geometry.listRight<=18,'excessive desktop table/slidebar gap '+w+' '+state);
     }else{
       // The ERP intentionally uses an overlay/full-width right slidebar on
       // Tablet and Mobile. This is not a Desktop grid collision.
       assert.ok(first.left>=-2 && first.right<=w+2,
         'responsive slidebar escapes viewport '+w+' '+state+' '+JSON.stringify(result.geometry));
       assert.ok(first.width>=Math.min(w,300)-2,'responsive slidebar is too narrow '+w+' '+state);
     }
   }
   if(result.geometry.panels.length===2){
     const [first,second]=result.geometry.panels;
     assert.ok(second.left>=first.right-1,'second slidebar overlaps first '+w+' '+state+' '+JSON.stringify(result.geometry));
     assert.ok(second.left-first.right>=10,'two slidebars need visible separation '+w+' '+state);
     assert.ok(second.left-first.right<=18,'excessive gap between two slidebars '+w+' '+state);
     assert.ok(first.width>=215&&second.width>=215,'dual panels became too narrow '+w+' '+state);
   }
   assert.ok(result.statusClasses.every(c=>c.includes('status-pill')),
     'status tags must use ERP status-pill '+w+' '+state);
   assert.ok(result.heads.every(v=>v.scroll<=v.width+3),'warehouse card header overflows '+w+' '+state+' '+JSON.stringify(result));
   assert.ok(result.overflow<=2,'page overflow '+w+' '+state+' '+JSON.stringify(result));
   for(let i=1;i<result.rects.length;i++)assert.ok(result.rects[i-1].right<=result.rects[i].left+1,'overlapping cells '+w+' '+state);
   assert.ok(result.rects.every(c=>c.overflow==='hidden'),'cell content not clipped '+w+' '+state);
   assert.equal(result.lines.length,2,'each of 2 products must be displayed in '+w+' '+state);
   assert.ok(result.lines.every(v=>v.wrap==='nowrap' && Number(v.weight)<=500),'product line should be regular, nowrap '+w+' '+state);
   assert.ok(result.lines.every(v=>v.height <= v.lineHeight+3),'product label wraps '+w+' '+state);
   assert.ok(result.lines[0].text.includes('Clear Men') && result.lines[1].text.includes('Sữa tắm'),'product data missing '+w+' '+state);
   console.log('PASS '+w+'x'+h+' '+state+' seven columns; table='+Math.round(result.table)+'px, area='+Math.round(result.wrap)+'px, inner-scroll='+Math.round(result.contentWidth-result.available)+'px');
   await page.screenshot({path:path.join(output,w+'-'+state+'.png')});
   return result;
  }
  assert.equal(await page.locator('.wh-native-warehouse-card').count(),2,'BG/HN warehouse cards must be separate');
  const bgCard=page.locator('.wh-native-warehouse-card').filter({hasText:'KHO BG'});
  const hnCard=page.locator('.wh-native-warehouse-card').filter({hasText:'KHO HN'});
  assert.equal(await bgCard.count(),1);
  assert.equal(await hnCard.count(),1);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),2,'default work view excludes completed BG orders');
  assert.equal(await hnCard.locator('tr.wh-native-data-row').count(),10);
  assert.equal(await bgCard.locator('.wh-native-warehouse-metrics > span').count(),5);
  assert.equal(await hnCard.locator('.wh-native-warehouse-metrics > span').count(),5);
  await bgCard.getByRole('button',{name:'Thu gọn KHO BG'}).click();
  assert.equal(await bgCard.locator('.wh-native-table').count(),0,'BG card should collapse independently');
  assert.equal(await hnCard.locator('.wh-native-table').count(),1,'HN must remain expanded');
  await bgCard.getByRole('button',{name:'Mở KHO BG'}).click();
  await hnCard.getByRole('button',{name:'Thu gọn KHO HN'}).click();
  assert.equal(await hnCard.locator('.wh-native-table').count(),0,'HN card should collapse independently');
  assert.equal(await bgCard.locator('.wh-native-table').count(),1,'BG must remain expanded');
  await hnCard.getByRole('button',{name:'Mở KHO HN'}).click();
  assert.equal(await page.locator('.wh-native-phase-tabs').count(),0,'redundant status tabs must not exist');
  assert.equal(await page.locator('.managed-table-meta').count(),0,'redundant order-count row must not exist');
  await page.locator('.fixture-ready-kpi').click();
  await page.waitForTimeout(100);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),1,'ready KPI includes mapped BG order');
  await page.locator('.fixture-done-kpi').click();
  await page.waitForFunction(() => {
    const rows=[...document.querySelectorAll('tr.wh-native-data-row .status-pill')];
    return rows.length===2 && rows.every(el=>el.textContent?.trim()==='Đã xử lý')
  }, null, {timeout:5000});
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),2,'processed KPI shows received and skipped');
  await page.locator('.fixture-work-kpi').click();
  await page.waitForFunction(() => {
    const rows=[...document.querySelectorAll('tr.wh-native-data-row .status-pill')];
    return rows.length===12 && rows.every(el=>el.textContent?.trim()!=='Đã xử lý')
  }, null, {timeout:5000});
  await page.locator('.fixture-pending-kpi').click();
  await page.waitForTimeout(100);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),1,'pending KPI shows unmapped order');
  await page.locator('.fixture-work-kpi').click();
  await page.waitForTimeout(100);
  const closed=await check('closed');
  assert.equal(closed.cols,7);
  await page.locator('.wh-native-order-link').first().click();
  await page.waitForSelector('.wh-native-panel');
  await page.waitForSelector('.wh-native-sku-suggestion[data-source="past-mapping"]');
  await page.locator('.wh-native-sku-suggestion button').click();
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').first().inputValue(),'155000','suggested SKU should prefill live sale price');
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').nth(1).inputValue(),'2','suggestion restores historic multiplier');
  await page.locator('.wh-native-editor input[type="number"]').first().fill('159000');
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').first().inputValue(),'159000','sale price remains editable');
  const opened=await check('open');
  assert.equal(opened.cols,7);
  if(w===1440 || w===1536){
    // Real screenshot configuration: warehouse column hidden in the ERP menu.
    // It must not inherit 1050px Tracking widths or clip the rightmost status.
    await page.locator('.managed-column-button').click();
    await page.locator('.managed-column-row').filter({hasText:'Kho nhận'}).locator('input[type="checkbox"]').uncheck();
    await page.waitForTimeout(170);
    const hiddenResult=await page.evaluate(()=>{
      const table=document.querySelector('.wh-native-table');
      const wrap=document.querySelector('.wh-native-table-wrap');
      const tag=table.querySelector('tr.wh-native-data-row .status-pill');
      const right=tag.getBoundingClientRect().right;
      return {
        cols:table.querySelectorAll('thead th').length,
        tableWidth:table.getBoundingClientRect().width,
        viewportWidth:wrap.clientWidth,
        overflow:wrap.scrollWidth-wrap.clientWidth,
        tagRight:right,wrapRight:wrap.getBoundingClientRect().right,
      };
    });
    assert.equal(hiddenResult.cols,6,'six user-chosen columns must remain after hiding warehouse');
    assert.ok(hiddenResult.overflow<=5,'hidden-column table should fit beside panel: '+JSON.stringify(hiddenResult));
    assert.ok(hiddenResult.tagRight<=hiddenResult.wrapRight-3,'status tag should be fully visible beside panel: '+JSON.stringify(hiddenResult));
    await page.screenshot({path:path.join(output,w+'-six-columns-panel-open.png')});
    await page.locator('.managed-column-row').filter({hasText:'Kho nhận'}).locator('input[type="checkbox"]').check();
    await page.locator('.managed-column-button').click();
  }
  if(w>=1280)assert.ok(opened.table<=closed.table+2,'open panel should shrink widths at '+w);
  if(opened.contentWidth>opened.available+3){
    await page.evaluate(()=>{
      const wrap=document.querySelector('.wh-native-table-wrap');
      wrap.scrollLeft=wrap.scrollWidth-wrap.clientWidth;
    });
    const scroll=await page.locator('.wh-native-table-wrap').first().evaluate(el=>el.scrollLeft);
    assert.ok(scroll>0,'horizontal scrolling is required and must stay inside the table '+w);
  }
  if(w>=1024){
   await page.locator('.whx-settings-wrap > button').click();
   await page.waitForSelector('.wh-native-workspace > aside.wh-native-settings-panel');
   assert.equal(await page.locator('.wh-native-workspace > aside.mynh-slide-panel').count(),2,
     'actual settings and order detail must be separately docked');
   const two=await check('two-panels');
   assert.equal(two.cols,7);
   assert.ok(two.contentWidth>two.available+3,'two real slidebars must use inner table scroll');
   await page.locator('.wh-native-settings-panel [aria-label="Đóng cài đặt Kho nhận"]').click();
   await page.waitForSelector('.wh-native-settings-panel',{state:'detached'});
   await check('second-closed');
   await page.evaluate(()=>{
     const shell=document.querySelector('.fixture-shell');
     shell.style.marginLeft='72px';
     shell.style.width='calc(100vw - 72px)';
   });
   await check('nav-collapsed');
   await page.evaluate(()=>{
     const shell=document.querySelector('.fixture-shell');
     shell.style.marginLeft='252px';
     shell.style.width='calc(100vw - 252px)';
   });
   await check('nav-expanded');
  }
  await page.locator('.wh-native-panel .close').click();
  await page.waitForSelector('.wh-native-panel',{state:'detached'});
  await check('reclosed');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS: actual settings + order slidebars docked; 14px gaps, seven columns, no redundant status toolbar');
}finally{await browser.close()}
)},()=>({path:'warehouse-actions',namespace:'qa-action'}));
    build.onLoad({filter:/.*/,namespace:'qa-action'},()=>({contents:'export async function saveReceivingWarehouseSettings(){}',loader:'js'}));
  }}]
});
const cssFiles=readdirSync(path.join(root,'app/styles')).filter(f=>f.endsWith('.css')&&f!=='warehouse-native-design.css');
const css=cssFiles.map(f=>readFileSync(path.join(root,'app/styles',f),'utf8')).join('\n')+'\n'+readFileSync(path.join(root,'app/styles/warehouse-native-design.css'),'utf8');
const shellCss='body{margin:0;background:#f5f7fa;font-family:Arial,sans-serif}.fixture-controls{position:fixed;left:3px;top:3px;z-index:40;display:flex;gap:4px}.fixture-controls button{font-size:9px;border:1px solid #ccd;background:white}.fixture-shell{margin-left:252px;width:calc(100vw - 252px);padding:12px 16px;height:calc(100dvh - 24px);display:flex;min-width:0}.fixture-shell .wh-native{width:100%;height:100%;min-width:0}.fixture-shell .wh-native-workspace{height:calc(100% - 85px);min-height:0}@media(max-width:900px){.fixture-shell{margin-left:0;width:100%;padding:8px;height:100dvh}.fixture-shell .wh-native-workspace{height:calc(100% - 110px)}}';
const html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+shellCss+'</style></head><body class="brand-shell-v1"><div id="root"></div><script>'+readFileSync(outfile,'utf8')+'</script></body></html>';
const executable=process.env.CHROME_BIN||'/usr/bin/chromium';
const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
try{
 for(const [w,h] of [[1536,864],[1440,900],[1366,768],[1280,800],[1024,768],[768,1024],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width:w,height:h}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html,{waitUntil:'load',timeout:60000});
  await page.waitForSelector('.wh-native-table tbody tr.wh-native-data-row td',{timeout:20000});
  async function check(state){
   await page.waitForTimeout(150);
   const result=await page.evaluate(()=>{
    const t=document.querySelector('.wh-native-table'),wr=document.querySelector('.wh-native-table-wrap');
    const rects=Array.from(t.querySelector('tbody tr.wh-native-data-row').querySelectorAll('td')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:getComputedStyle(el).overflowX}});
    const lines=Array.from(t.querySelector('tbody tr.wh-native-data-row').querySelectorAll('.wh-native-product-line')).map(el=>({text:el.textContent,weight:getComputedStyle(el).fontWeight,wrap:getComputedStyle(el).whiteSpace,height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)}));
    const heads=Array.from(document.querySelectorAll('.wh-native-warehouse-head')).map(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth}));
    const listRect=document.querySelector('.wh-native-list').getBoundingClientRect();
    const panels=Array.from(document.querySelectorAll('.wh-native-workspace > aside.mynh-slide-panel')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});
    const fontSize=parseFloat(getComputedStyle(t.querySelector('tbody tr.wh-native-data-row td')).fontSize);
    return {
      table:t.getBoundingClientRect().width,
      wrap:wr.getBoundingClientRect().width,
      contentWidth:wr.scrollWidth,
      available:wr.clientWidth,
      overflow:document.documentElement.scrollWidth-innerWidth,
      cols:rects.length,
      headers:t.querySelectorAll('thead th').length,
      rects,lines,heads,fontSize,geometry:{listRight:listRect.right,panels},
      statusClasses:Array.from(document.querySelectorAll('tr.wh-native-data-row .status-pill')).map(el=>el.className),
      statusLabels:Array.from(document.querySelectorAll('tr.wh-native-data-row .status-pill')).map(el=>el.textContent?.trim()),
    };
   });
   assert.equal(result.cols,7,'all seven columns must remain in '+w+' '+state);
   assert.equal(result.headers,7,'all seven headers must remain in '+w+' '+state);
   assert.ok(result.table>=result.wrap-4,'table is not filling available width '+w+' '+state+' '+JSON.stringify(result));
   if(result.wrap>926){
     assert.ok(result.contentWidth-result.available<6,
       'unnecessary x-scroll when all columns can fit at '+w+' '+state+' '+JSON.stringify(result));
   }
   assert.ok(result.contentWidth>=result.table-3,'table content cut instead of inner scroll '+w+' '+state+' '+JSON.stringify(result));
   const allowedLabels=['Chờ bóc tách','Chờ nhập kho','Đã xử lý'];
   assert.ok(result.statusLabels.every(t=>allowedLabels.includes(t)),
     'unknown order status at '+w+' '+state+': '+result.statusLabels.join(','));
   assert.ok(result.fontSize<=10.1,'table data too large '+w+' '+state+' '+result.fontSize);
   if(result.geometry.panels.length){
     const first=result.geometry.panels[0];
     if(w>900){
       assert.ok(first.left>=result.geometry.listRight-1,'desktop slidebar overlaps table '+w+' '+state);
       assert.ok(first.left-result.geometry.listRight>=10,'desktop table/slidebar gap too small '+w+' '+state);
       assert.ok(first.left-result.geometry.listRight<=18,'excessive desktop table/slidebar gap '+w+' '+state);
     }else{
       // The ERP intentionally uses an overlay/full-width right slidebar on
       // Tablet and Mobile. This is not a Desktop grid collision.
       assert.ok(first.left>=-2 && first.right<=w+2,
         'responsive slidebar escapes viewport '+w+' '+state+' '+JSON.stringify(result.geometry));
       assert.ok(first.width>=Math.min(w,300)-2,'responsive slidebar is too narrow '+w+' '+state);
     }
   }
   if(result.geometry.panels.length===2){
     const [first,second]=result.geometry.panels;
     assert.ok(second.left>=first.right-1,'second slidebar overlaps first '+w+' '+state+' '+JSON.stringify(result.geometry));
     assert.ok(second.left-first.right>=10,'two slidebars need visible separation '+w+' '+state);
     assert.ok(second.left-first.right<=18,'excessive gap between two slidebars '+w+' '+state);
     assert.ok(first.width>=215&&second.width>=215,'dual panels became too narrow '+w+' '+state);
   }
   assert.ok(result.statusClasses.every(c=>c.includes('status-pill')),
     'status tags must use ERP status-pill '+w+' '+state);
   assert.ok(result.heads.every(v=>v.scroll<=v.width+3),'warehouse card header overflows '+w+' '+state+' '+JSON.stringify(result));
   assert.ok(result.overflow<=2,'page overflow '+w+' '+state+' '+JSON.stringify(result));
   for(let i=1;i<result.rects.length;i++)assert.ok(result.rects[i-1].right<=result.rects[i].left+1,'overlapping cells '+w+' '+state);
   assert.ok(result.rects.every(c=>c.overflow==='hidden'),'cell content not clipped '+w+' '+state);
   assert.equal(result.lines.length,2,'each of 2 products must be displayed in '+w+' '+state);
   assert.ok(result.lines.every(v=>v.wrap==='nowrap' && Number(v.weight)<=500),'product line should be regular, nowrap '+w+' '+state);
   assert.ok(result.lines.every(v=>v.height <= v.lineHeight+3),'product label wraps '+w+' '+state);
   assert.ok(result.lines[0].text.includes('Clear Men') && result.lines[1].text.includes('Sữa tắm'),'product data missing '+w+' '+state);
   console.log('PASS '+w+'x'+h+' '+state+' seven columns; table='+Math.round(result.table)+'px, area='+Math.round(result.wrap)+'px, inner-scroll='+Math.round(result.contentWidth-result.available)+'px');
   await page.screenshot({path:path.join(output,w+'-'+state+'.png')});
   return result;
  }
  assert.equal(await page.locator('.wh-native-warehouse-card').count(),2,'BG/HN warehouse cards must be separate');
  const bgCard=page.locator('.wh-native-warehouse-card').filter({hasText:'KHO BG'});
  const hnCard=page.locator('.wh-native-warehouse-card').filter({hasText:'KHO HN'});
  assert.equal(await bgCard.count(),1);
  assert.equal(await hnCard.count(),1);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),2,'default work view excludes completed BG orders');
  assert.equal(await hnCard.locator('tr.wh-native-data-row').count(),10);
  assert.equal(await bgCard.locator('.wh-native-warehouse-metrics > span').count(),5);
  assert.equal(await hnCard.locator('.wh-native-warehouse-metrics > span').count(),5);
  await bgCard.getByRole('button',{name:'Thu gọn KHO BG'}).click();
  assert.equal(await bgCard.locator('.wh-native-table').count(),0,'BG card should collapse independently');
  assert.equal(await hnCard.locator('.wh-native-table').count(),1,'HN must remain expanded');
  await bgCard.getByRole('button',{name:'Mở KHO BG'}).click();
  await hnCard.getByRole('button',{name:'Thu gọn KHO HN'}).click();
  assert.equal(await hnCard.locator('.wh-native-table').count(),0,'HN card should collapse independently');
  assert.equal(await bgCard.locator('.wh-native-table').count(),1,'BG must remain expanded');
  await hnCard.getByRole('button',{name:'Mở KHO HN'}).click();
  assert.equal(await page.locator('.wh-native-phase-tabs').count(),0,'redundant status tabs must not exist');
  assert.equal(await page.locator('.managed-table-meta').count(),0,'redundant order-count row must not exist');
  await page.locator('.fixture-ready-kpi').click();
  await page.waitForTimeout(100);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),1,'ready KPI includes mapped BG order');
  await page.locator('.fixture-done-kpi').click();
  await page.waitForFunction(() => {
    const rows=[...document.querySelectorAll('tr.wh-native-data-row .status-pill')];
    return rows.length===2 && rows.every(el=>el.textContent?.trim()==='Đã xử lý')
  }, null, {timeout:5000});
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),2,'processed KPI shows received and skipped');
  await page.locator('.fixture-work-kpi').click();
  await page.waitForFunction(() => {
    const rows=[...document.querySelectorAll('tr.wh-native-data-row .status-pill')];
    return rows.length===12 && rows.every(el=>el.textContent?.trim()!=='Đã xử lý')
  }, null, {timeout:5000});
  await page.locator('.fixture-pending-kpi').click();
  await page.waitForTimeout(100);
  assert.equal(await bgCard.locator('tr.wh-native-data-row').count(),1,'pending KPI shows unmapped order');
  await page.locator('.fixture-work-kpi').click();
  await page.waitForTimeout(100);
  const closed=await check('closed');
  assert.equal(closed.cols,7);
  await page.locator('.wh-native-order-link').first().click();
  await page.waitForSelector('.wh-native-panel');
  await page.waitForSelector('.wh-native-sku-suggestion[data-source="past-mapping"]');
  await page.locator('.wh-native-sku-suggestion button').click();
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').first().inputValue(),'155000','suggested SKU should prefill live sale price');
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').nth(1).inputValue(),'2','suggestion restores historic multiplier');
  await page.locator('.wh-native-editor input[type="number"]').first().fill('159000');
  assert.equal(await page.locator('.wh-native-editor input[type="number"]').first().inputValue(),'159000','sale price remains editable');
  const opened=await check('open');
  assert.equal(opened.cols,7);
  if(w===1440 || w===1536){
    // Real screenshot configuration: warehouse column hidden in the ERP menu.
    // It must not inherit 1050px Tracking widths or clip the rightmost status.
    await page.locator('.managed-column-button').click();
    await page.locator('.managed-column-row').filter({hasText:'Kho nhận'}).locator('input[type="checkbox"]').uncheck();
    await page.waitForTimeout(170);
    const hiddenResult=await page.evaluate(()=>{
      const table=document.querySelector('.wh-native-table');
      const wrap=document.querySelector('.wh-native-table-wrap');
      const tag=table.querySelector('tr.wh-native-data-row .status-pill');
      const right=tag.getBoundingClientRect().right;
      return {
        cols:table.querySelectorAll('thead th').length,
        tableWidth:table.getBoundingClientRect().width,
        viewportWidth:wrap.clientWidth,
        overflow:wrap.scrollWidth-wrap.clientWidth,
        tagRight:right,wrapRight:wrap.getBoundingClientRect().right,
      };
    });
    assert.equal(hiddenResult.cols,6,'six user-chosen columns must remain after hiding warehouse');
    assert.ok(hiddenResult.overflow<=5,'hidden-column table should fit beside panel: '+JSON.stringify(hiddenResult));
    assert.ok(hiddenResult.tagRight<=hiddenResult.wrapRight-3,'status tag should be fully visible beside panel: '+JSON.stringify(hiddenResult));
    await page.screenshot({path:path.join(output,w+'-six-columns-panel-open.png')});
    await page.locator('.managed-column-row').filter({hasText:'Kho nhận'}).locator('input[type="checkbox"]').check();
    await page.locator('.managed-column-button').click();
  }
  if(w>=1280)assert.ok(opened.table<=closed.table+2,'open panel should shrink widths at '+w);
  if(opened.contentWidth>opened.available+3){
    await page.evaluate(()=>{
      const wrap=document.querySelector('.wh-native-table-wrap');
      wrap.scrollLeft=wrap.scrollWidth-wrap.clientWidth;
    });
    const scroll=await page.locator('.wh-native-table-wrap').first().evaluate(el=>el.scrollLeft);
    assert.ok(scroll>0,'horizontal scrolling is required and must stay inside the table '+w);
  }
  if(w>=1024){
   await page.locator('.whx-settings-wrap > button').click();
   await page.waitForSelector('.wh-native-workspace > aside.wh-native-settings-panel');
   assert.equal(await page.locator('.wh-native-workspace > aside.mynh-slide-panel').count(),2,
     'actual settings and order detail must be separately docked');
   const two=await check('two-panels');
   assert.equal(two.cols,7);
   assert.ok(two.contentWidth>two.available+3,'two real slidebars must use inner table scroll');
   await page.locator('.wh-native-settings-panel [aria-label="Đóng cài đặt Kho nhận"]').click();
   await page.waitForSelector('.wh-native-settings-panel',{state:'detached'});
   await check('second-closed');
   await page.evaluate(()=>{
     const shell=document.querySelector('.fixture-shell');
     shell.style.marginLeft='72px';
     shell.style.width='calc(100vw - 72px)';
   });
   await check('nav-collapsed');
   await page.evaluate(()=>{
     const shell=document.querySelector('.fixture-shell');
     shell.style.marginLeft='252px';
     shell.style.width='calc(100vw - 252px)';
   });
   await check('nav-expanded');
  }
  await page.locator('.wh-native-panel .close').click();
  await page.waitForSelector('.wh-native-panel',{state:'detached'});
  await check('reclosed');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS: actual settings + order slidebars docked; 14px gaps, seven columns, no redundant status toolbar');
}finally{await browser.close()}
