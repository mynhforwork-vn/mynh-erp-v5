import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(), tmp=mkdtempSync(path.join(os.tmpdir(),'mynh-autofit-'));
const output=path.join(root,'qa-warehouse-native-autofit'); mkdirSync(output,{recursive:true});
const component=path.join(root,'components/warehouse-intake-native-design.tsx');
const entry=[
  "import React from 'react'",
  "import {createRoot} from 'react-dom/client'",
  'import {WarehouseIntakeNativeDesign} from '+JSON.stringify(component),
  "const title='Dầu gội đầu dành cho nam Clear Men sạch gàu dài suốt ngày với nhiều thông tin phân loại và thương hiệu - mặt hàng nhập kho mùa hè',",
  'rows=Array.from({length:14},(_,i)=>({',
  "  id:'30000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),",
  "  shopee_order_id:'261103C48K1GUU'+String(i+1).padStart(2,'0'),",
  "  order_date:'2026-11-03T15:09:00+07:00', warehouse_status:'READY_TO_TRANSFER', cod: (i+1)*15000,",
  "  receive_batch_details:[{receive_batches:{warehouse_id:'10000000-0000-0000-0000-000000000001',received_at:'2026-11-03T15:09:00+07:00',warehouses:{code:'HN',name:'Hà Nội',address:'164 Hồng Mai'}}}],",
  "  order_items:[{id:'40000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),sku:'SP-'+i,product_name:title,variant:'Loại 110ml/180ml',quantity:2,original_price:129000,final_price:89000,product_variant_id:null,inventory_multiplier:1}]",
  '}))',
  "createRoot(document.getElementById('root')).render(<div className='fixture-shell'><WarehouseIntakeNativeDesign rows={rows} variants={[]} auditLogs={[]}/></div>)"
].join('\n');
const entryPath=path.join(tmp,'entry.tsx'), outfile=path.join(tmp,'bundle.js');
writeFileSync(entryPath,entry);
await build({entryPoints:[entryPath],outfile,absWorkingDir:root,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root},nodePaths:[path.join(root,'node_modules')]});
const cssFiles=readdirSync(path.join(root,'app/styles')).filter(f=>f.endsWith('.css')&&f!=='warehouse-native-design.css');
const css=cssFiles.map(f=>readFileSync(path.join(root,'app/styles',f),'utf8')).join('\n')+'\n'+readFileSync(path.join(root,'app/styles/warehouse-native-design.css'),'utf8');
const shellCss='body{margin:0;background:#f5f7fa;font-family:Arial,sans-serif}.fixture-shell{margin-left:252px;width:calc(100vw - 252px);padding:12px 16px;height:calc(100dvh - 24px);display:flex;min-width:0}.fixture-shell .wh-native{width:100%;height:100%;min-width:0}.fixture-shell .wh-native-workspace{height:calc(100% - 85px);min-height:0}@media(max-width:900px){.fixture-shell{margin-left:0;width:100%;padding:8px;height:100dvh}.fixture-shell .wh-native-workspace{height:calc(100% - 110px)}}';
const html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+shellCss+'</style></head><body class="brand-shell-v1"><div id="root"></div><script>'+readFileSync(outfile,'utf8')+'</script></body></html>';
const executable=process.env.CHROME_BIN||'/usr/bin/chromium';
const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
try{
 for(const [w,h] of [[1440,900],[1280,800],[1024,768],[768,1024],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width:w,height:h}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html,{waitUntil:'load',timeout:60000});
  await page.waitForSelector('.wh-native-table tbody tr td',{timeout:20000});
  async function check(state){
   await page.waitForTimeout(150);
   const result=await page.evaluate(()=>{
    const t=document.querySelector('.wh-native-table'),wr=document.querySelector('.wh-native-table-wrap');
    const rects=Array.from(t.querySelector('tbody tr').querySelectorAll('td')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:getComputedStyle(el).overflowX}});
    return {mode:t.className.match(/wh-native-table-(wide|compact|narrow)/)?.[1],table:t.getBoundingClientRect().width,wrap:wr.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth-innerWidth,cols:rects.length,rects};
   });
   assert.ok(result.table<=result.wrap+2,'table exceeds wrapper '+w+' '+state+' '+JSON.stringify(result));
   assert.ok(result.overflow<=2,'page overflow '+w+' '+state+' '+JSON.stringify(result));
   for(let i=1;i<result.rects.length;i++)assert.ok(result.rects[i-1].right<=result.rects[i].left+1,'overlapping cells '+w+' '+state);
   assert.ok(result.rects.every(c=>c.overflow==='hidden'),'cell content not clipped '+w+' '+state);
   console.log('PASS '+w+'x'+h+' '+state+' '+result.mode+' '+result.cols+' columns');
   await page.screenshot({path:path.join(output,w+'-'+state+'.png')});
   return result;
  }
  const closed=await check('closed');
  if(w>=1280)assert.equal(closed.mode,'wide');
  await page.locator('.wh-native-order-link').first().click();
  await page.waitForSelector('.wh-native-panel');
  const opened=await check('open');
  if(w>=1024)assert.notEqual(opened.mode,'wide','panel did not auto-fit '+w);
  if(w<=390)assert.equal(opened.mode,'narrow');
  await page.locator('.wh-native-panel .close').click();
  await page.waitForSelector('.wh-native-panel',{state:'detached'});
  await check('reclosed');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS browser autofit layout at 6 viewport sizes');
}finally{await browser.close()}
