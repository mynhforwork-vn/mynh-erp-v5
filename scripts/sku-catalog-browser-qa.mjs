import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {build} from 'esbuild'
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root=process.cwd(),tmp=mkdtempSync(path.join(os.tmpdir(),'sku-catalog-qa-'))
const entry=path.join(tmp,'entry.tsx'),bundle=path.join(tmp,'bundle.js')
const source=[
 "import React from 'react'",
 "import {createRoot} from 'react-dom/client'",
 "import {WarehouseSkuCatalog} from "+JSON.stringify(path.join(root,'components/warehouse-sku-catalog.tsx')),
 "const rows=[",
 "{id:'00000000-0000-4000-8000-000000000001',productId:'10000000-0000-4000-8000-000000000001',sku:'ABC-01',productName:'Sữa tắm',variantName:'Đỏ',salePrice:99000,isActive:true,mergedInto:null,balances:[{warehouseId:'1',warehouse:'BG',quantity:3},{warehouseId:'2',warehouse:'HN',quantity:2}]},",
 "{id:'00000000-0000-4000-8000-000000000002',productId:'10000000-0000-4000-8000-000000000001',sku:'ABC-01',productName:'Sữa tắm',variantName:'Xanh',salePrice:109000,isActive:true,mergedInto:null,balances:[]},",
 "{id:'00000000-0000-4000-8000-000000000003',productId:'10000000-0000-4000-8000-000000000002',sku:'BCD-02',productName:'Kem dưỡng',variantName:'Mặc định',salePrice:159000,isActive:true,mergedInto:null,balances:[{warehouseId:'1',warehouse:'BG',quantity:8}]},",
 "{id:'00000000-0000-4000-8000-000000000004',productId:'10000000-0000-4000-8000-000000000003',sku:'CAT-03',productName:'Đã gộp',variantName:'Mặc định',salePrice:12000,isActive:false,mergedInto:'00000000-0000-4000-8000-000000000003',balances:[]}",
 "]",
 "const live=document.documentElement.dataset.live==='true'",
 "createRoot(document.getElementById('root')).render(<WarehouseSkuCatalog rows={rows} canEdit={live} canMerge={live} loadError={null}/>)"
].join('\n')
writeFileSync(entry,source)
await build({
 entryPoints:[entry],outfile:bundle,absWorkingDir:root,bundle:true,
 platform:'browser',format:'iife',jsx:'automatic',
 define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root},
 nodePaths:[path.join(root,'node_modules')],
 plugins:[{name:'mock-sku-catalog-actions',setup(es){
  es.onResolve({filter:/[\\/]lib[\\/]actions[\\/]sku-catalog$/},()=>({path:'actions',namespace:'qa'}))
  es.onResolve({filter:/^next\/navigation$/},()=>({path:'next',namespace:'qa'}))
  es.onLoad({filter:/.*/,namespace:'qa'},arg=>({
   contents:arg.path==='next'
    ? 'export function useRouter(){return {refresh(){window.__refresh=(window.__refresh||0)+1}}}'
    : "export async function editSkuClassification(input){(window.__calls??=[]).push({name:'edit',input});return {}}"
      +" export async function addSkuClassification(input){(window.__calls??=[]).push({name:'add',input});return {}}"
      +" export async function previewSkuMerge(sourceId,targetId){(window.__calls??=[]).push({name:'preview',sourceId,targetId});return {source:{id:sourceId,sku:'ABC-01',name:'Sữa tắm',variant:'Đỏ',price:99000},target:{id:targetId,sku:'BCD-02',name:'Kem dưỡng',variant:'Mặc định',price:159000},warehouses:[{warehouse_id:'1',warehouse:'BG',quantity:3},{warehouse_id:'2',warehouse:'HN',quantity:2}],quantity:5,open_orders:0,drafts:0,pending_transfers:0,sale_history:0,negative_balances:0,fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',can_merge:true}}"
      +" export async function confirmSkuMerge(input){(window.__calls??=[]).push({name:'merge',input});return {quantity_moved:5}}",
   loader:'js'
  }))
 }}]
})
const css=readFileSync(path.join(root,'app/styles/warehouse-sku-catalog.css'),'utf8')
const frameCss='html,body{margin:0;padding:0;width:100%;max-width:100%;background:#f6f9fb;font-family:Arial,sans-serif}#root{box-sizing:border-box;width:100%;max-width:100%;padding:12px}.whx-page{box-sizing:border-box;min-width:0}.button{border:1px solid #abc;padding:7px;border-radius:5px}.button.primary{background:#296e68;color:#fff}'
const js=readFileSync(bundle,'utf8')
const html=live=>'<html lang="vi" data-live="'+live+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+frameCss+css+'</style></head><body><div id="root" class="whx-page"></div><script>'+js+'</script></body></html>'
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:['--no-sandbox']})
try{
 for(const [width,height] of [[320,568],[390,844],[568,320],[768,1024],[1024,768],[1366,768],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.setContent(html(false),{waitUntil:'load'})
  await page.locator('.sku-catalog-table').waitFor()
  assert.equal(await page.locator('.sku-catalog-table tbody tr').count(),3,'active SKU count '+width)
  const excess=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  assert.ok(excess<=2,'horizontal viewport overflow at '+width+': '+excess)
  await page.getByLabel('Lọc phân loại').selectOption('Đỏ')
  assert.equal(await page.locator('.sku-catalog-table tbody tr').count(),1,'category filter '+width)
  await page.getByLabel('Lọc phân loại').selectOption('Tất cả')
  await page.getByLabel('Tìm SKU trong danh mục').fill('BCD')
  assert.equal(await page.locator('.sku-catalog-table tbody tr').count(),1,'search '+width)
  await page.getByLabel('Tìm SKU trong danh mục').fill('')
  await page.getByRole('button',{name:'Xem và quản lý SKU ABC-01 phân loại Đỏ'}).click()
  await page.getByRole('dialog',{name:'Chi tiết SKU ABC-01'}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Lưu chỉnh sửa'}).isDisabled(),true,'readonly '+width)
  assert.equal(await page.getByRole('button',{name:'Gộp SKU'}).count(),0,'admin only '+width)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.sku-catalog-drawer').count(),0,'Escape closes '+width)
  assert.deepEqual(errors,[],'no page errors '+width)
  await page.close()
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 await page.setContent(html(true),{waitUntil:'load'})
 await page.getByRole('button',{name:'Xem và quản lý SKU ABC-01 phân loại Đỏ'}).click()
 await page.getByRole('button',{name:'Thêm phân loại'}).first().click()
 await page.getByLabel('Phân loại mới').fill('Size XL')
 await page.getByLabel('Giá bán').fill('155000')
 await page.getByRole('button',{name:'Thêm phân loại'}).last().click()
 await page.waitForFunction(()=>window.__calls?.some(c=>c.name==='add'))
 let calls=await page.evaluate(()=>window.__calls)
 assert.equal(calls.find(c=>c.name==='add').input.variantName,'Size XL')
 await page.getByRole('button',{name:'Xem và quản lý SKU ABC-01 phân loại Đỏ'}).click()
 await page.getByRole('button',{name:'Gộp SKU'}).click()
 await page.getByRole('group',{name:'Chọn SKU đích'}).getByRole('button',{name:/BCD-02/}).click()
 await page.getByRole('button',{name:'Xem trước gộp SKU'}).click()
 await page.getByText('Đối soát trước khi gộp').waitFor()
 assert.equal(await page.getByRole('button',{name:'Xác nhận gộp SKU'}).isDisabled(),true)
 await page.getByRole('checkbox',{name:/Tôi xác nhận hai phân loại/}).check()
 await page.getByLabel('Lý do gộp').fill('Hai phân loại trùng mã đã đối soát')
 await page.getByLabel('Xác nhận mã SKU nguồn').fill('ABC-01')
 await page.getByRole('button',{name:'Xác nhận gộp SKU'}).click()
 await page.waitForFunction(()=>window.__calls?.some(c=>c.name==='merge'))
 calls=await page.evaluate(()=>window.__calls)
 assert.equal(calls.find(c=>c.name==='merge').input.confirmation,'ABC-01')
 assert.equal(calls.find(c=>c.name==='merge').input.sameUnit,true)
 await page.close()
 console.log('PASS: SKU catalog 7 responsive sizes, search/filter, readonly, drawer, add variant and reviewed merge')
}finally{await browser.close()}
