import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {build} from 'esbuild'
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root=process.cwd(),tmp=mkdtempSync(path.join(os.tmpdir(),'receipt-sku-ui-'))
const entry=path.join(tmp,'app.tsx'),outfile=path.join(tmp,'bundle.js')
const component=path.join(root,'components/warehouse-received-sku-correction.tsx')
writeFileSync(entry,[
 "import React from 'react'",
 "import {createRoot} from 'react-dom/client'",
 "import {WarehouseReceivedSkuCorrection} from "+JSON.stringify(component),
 "const products=[{id:'p-1',sku:'ABC-01',name:'Sữa tắm'},{id:'p-2',sku:'BCD-02',name:'Kem dưỡng'}]",
 "const variants=[{id:'v-1',variant_name:'Đỏ',sale_price:90000,products:{id:'p-1',sku:'ABC-01',name:'Sữa tắm'}},{id:'v-2',variant_name:'Xanh',sale_price:110000,products:{id:'p-2',sku:'BCD-02',name:'Kem dưỡng'}}]",
 "createRoot(document.getElementById('root')).render(<WarehouseReceivedSkuCorrection orderItemId='item-1' previousVariantId='v-2' previousMultiplier={1} products={products} variants={variants} previewOnly={Boolean(window.__previewOnly)} onSuccess={result=>{window.__success=result}}/>)"
].join('\n'))
await build({entryPoints:[entry],outfile,absWorkingDir:root,bundle:true,
 platform:'browser',format:'iife',jsx:'automatic',
 define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root},
 nodePaths:[path.join(root,'node_modules')],
 plugins:[{name:'mock-correction-rpc',setup(build){
  build.onResolve({filter:/[\\/]lib[\\/]actions[\\/]warehouse-received-sku-correction$/},
   ()=>({path:'actions',namespace:'correction-qa'}))
  build.onLoad({filter:/.*/,namespace:'correction-qa'},()=>({
   contents:[
    "export async function previewReceivedSkuCorrection(orderItemId,targetVariantId,multiplier){",
    "(window.__calls??=[]).push({name:'preview',orderItemId,targetVariantId,multiplier});",
    "const blocked=!!window.__blockSale;",
    "return {order_id:'order-1',order_item_id:orderItemId,warehouse_id:'BG',",
    "old_decision:'IN',old_variant_id:'v-2',old_multiplier:1,old_sale_price:110000,",
    "old_quantity:2,source_balance:5,new_variant_id:targetVariantId,new_sku:'ABC-01',",
    "new_product_name:'Sữa tắm',new_variant_name:'Đỏ',new_sale_price:90000,",
    "new_multiplier:multiplier,new_quantity:2*multiplier,sale_history:blocked?1:0,",
    "transfer_history:0,receipt_found:true,fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',",
    "can_correct:!blocked}}",
    "export async function confirmReceivedSkuCorrection(input){",
    "(window.__calls??=[]).push({name:'confirm',input});",
    "return {id:'correction-1',warehouse_status:'WAREHOUSE_RECEIVED',",
    "old_quantity:2,new_quantity:2*input.multiplier}}"
   ].join(''),
   loader:'js'
  }))
 }}]
})
const script=readFileSync(outfile,'utf8')
const style=readFileSync(path.join(root,'app/styles/warehouse-intake-detail-preview.css'),'utf8')
const html='<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;max-width:100%;overflow-x:hidden;font-family:Arial,sans-serif}#root{box-sizing:border-box;width:min(400px,100%);padding:10px}.button{border:1px solid #cbdde5;padding:7px;border-radius:5px;background:#fff}.button.primary{background:#267465;color:#fff}</style><style>'+style+'</style></head><body><div id="root"></div><script>'+script+'</script></body></html>'
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:['--no-sandbox']})
try{
 for(const [width,height] of [[320,568],[390,844],[568,320],[768,1024],[1366,768],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.setContent(html,{waitUntil:'load'})
  await page.getByRole('button',{name:'Điều chỉnh SKU đã nhập kho'}).click()
  assert.equal(await page.getByRole('group',{name:'Chọn phân loại SKU'}).count(),0,
    'classification must wait for SKU selection '+width)
  await page.getByLabel('Tìm SKU sản phẩm để điều chỉnh').fill('ABC-01')
  await page.getByRole('group',{name:'Chọn SKU sản phẩm'}).getByRole('button',{name:/ABC-01/}).click()
  assert.equal(await page.getByRole('group',{name:'Chọn phân loại SKU'}).getByRole('button').count(),1,
    'only classifications of the selected SKU '+width)
  await page.getByRole('group',{name:'Chọn phân loại SKU'}).getByRole('button',{name:/Đỏ/}).click()
  await page.getByLabel('Hệ số SKU mới').fill('3')
  await page.getByRole('button',{name:'Xem trước điều chỉnh'}).click()
  await page.getByText('Đối soát trước khi điều chỉnh').waitFor()
  assert.equal(await page.getByRole('button',{name:'Xác nhận điều chỉnh SKU'}).isDisabled(),true,
   'note mandatory before stock corrections')
  await page.getByPlaceholder('Nêu nguyên nhân ghép sai SKU').fill('Đối chiếu và sửa liên kết sản phẩm đã nhập')
  await page.getByRole('button',{name:'Xác nhận điều chỉnh SKU'}).click()
  await page.waitForFunction(()=>window.__calls?.some(c=>c.name==='confirm'))
  const calls=await page.evaluate(()=>window.__calls)
  assert.equal(calls.find(c=>c.name==='confirm').input.multiplier,3)
  assert.equal(calls.find(c=>c.name==='confirm').input.targetVariantId,'v-1')
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  assert.ok(overflow<=2,'no horizontal overflow '+width+' px '+overflow)
  assert.deepEqual(errors,[],'console runtime at '+width)
  await page.close()
 }
 const blocked=await browser.newPage({viewport:{width:390,height:844}})
 await blocked.setContent(html,{waitUntil:'load'})
 await blocked.evaluate(()=>window.__blockSale=true)
 await blocked.getByRole('button',{name:'Điều chỉnh SKU đã nhập kho'}).click()
 await blocked.getByRole('group',{name:'Chọn SKU sản phẩm'}).getByRole('button',{name:/ABC-01/}).click()
 await blocked.getByRole('group',{name:'Chọn phân loại SKU'}).getByRole('button',{name:/Đỏ/}).click()
 await blocked.getByRole('button',{name:'Xem trước điều chỉnh'}).click()
 await blocked.getByText('SKU đã có lịch sử bán/chuyển kho').waitFor()
 assert.equal(await blocked.getByRole('button',{name:'Xác nhận điều chỉnh SKU'}).isDisabled(),true,
   'sale-linked SKU blocks correction')
 await blocked.close()
 const demo=await browser.newPage({viewport:{width:390,height:844}})
 await demo.addInitScript(()=>{window.__previewOnly=true})
 await demo.setContent(html,{waitUntil:'load'})
 await demo.getByRole('button',{name:'Điều chỉnh SKU đã nhập kho'}).click()
 await demo.getByText('Chế độ xem trước: chỉ thử chọn SKU và phân loại').waitFor()
 await demo.getByRole('group',{name:'Chọn SKU sản phẩm'}).getByRole('button',{name:/ABC-01/}).click()
 await demo.getByRole('group',{name:'Chọn phân loại SKU'}).getByRole('button',{name:/Đỏ/}).click()
 assert.equal(await demo.getByRole('button',{name:'Xem trước điều chỉnh'}).isDisabled(),true,
  'preview must not call production preview/confirmation RPC')
 assert.equal((await demo.evaluate(()=>window.__calls||[])).length,0,
  'preview must not write or read live stock')
 await demo.close()
 console.log('PASS: received SKU correction 6 breakpoints, SKU first, classification scope, preview-only lock, reason, blocked sales, mock confirmation')
}finally{await browser.close()}
