// Standalone payment metadata contract. No Supabase writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parsePrepaidMetadata,prepaidSourceLabel,resolveOrderCod,resolveOrderValue} from '../lib/order-prepaid.ts'
const test=(paymentStatus,amount,type,label,isCreate=true)=>
  parsePrepaidMetadata({paymentStatus,amount,sourceType:type,sourceLabel:label,isCreate})
assert.deepEqual(test('PAID','250000','CREDIT_CARD','Visa ****1234'),
  {prepaid_amount:250000,prepaid_source_type:'CREDIT_CARD',prepaid_source_label:'Visa ****1234'})
assert.deepEqual(test('PARTIAL','85000','BANK_ACCOUNT','MB Bank'),
  {prepaid_amount:85000,prepaid_source_type:'BANK_ACCOUNT',prepaid_source_label:'MB Bank'})
assert.deepEqual(test('UNPAID','250000','CREDIT_CARD','Visa ****1234'),
  {prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null})
assert.deepEqual(test('REFUNDED','250000','CREDIT_CARD','Visa ****1234'),
  {prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null})
assert.deepEqual(test('PAID','','','',false),{prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null})
assert.equal(prepaidSourceLabel('CREDIT_CARD'),'Thẻ tín dụng')
for(const args of [
 ['PAID','','CREDIT_CARD',''],
 ['PAID','100000','',''],
 ['PARTIAL','-1','BANK_ACCOUNT',''],
 ['PAID','100000.5','BANK_ACCOUNT',''],
 ['PAID','100000','CREDIT_CARD','4111111111111111'],
 ['PAID','100000','INVALID','']
]) assert.throws(()=>test(...args))
const editor=fs.readFileSync('components/order-editor-form.tsx','utf8')
assert.match(editor,/\{showPrepaid&&<div className="order-prepaid-fields">/)
assert.match(editor,/Thanh toán & giá trị đơn hàng/)
assert.match(editor,/order-value-summary/)
for(const path of ['app/(erp)/orders/page.tsx','components/context-order-panel.tsx','components/order-account-detail-panel.tsx','app/(erp)/users/page.tsx']){
  assert.match(fs.readFileSync(path,'utf8'),/resolveOrderValue/)
}
assert.equal(resolveOrderValue({paymentStatus:'PAID',prepaidAmount:250000,cod:9000}),250000)
assert.equal(resolveOrderValue({paymentStatus:'PARTIAL',prepaidAmount:125000,cod:35000}),160000)
assert.equal(resolveOrderValue({paymentStatus:'UNPAID',cod:35000}),35000)
assert.equal(resolveOrderValue({paymentStatus:'PENDING',cod:0}),0)
assert.equal(resolveOrderValue({paymentStatus:'REFUNDED',cod:35000}),35000)
assert.equal(resolveOrderValue({paymentStatus:'PAID',prepaidAmount:null,cod:0}),null)
assert.equal(resolveOrderValue({paymentStatus:'PARTIAL',prepaidAmount:null,cod:35000}),null)
assert.match(editor,/paymentStatus==='PAID'\|\|paymentStatus==='PARTIAL'/)
assert.doesNotMatch(editor,/order-prepaid-quick-action/)
assert.match(editor,/paymentStatus==='PAID'\s*\? <input type="hidden" name="cod" value="0"\/>/)
assert.match(editor,/order-cod-section/)
assert.match(editor,/name="cod" inputMode="decimal" required/)
const actions=fs.readFileSync('lib/actions/core.ts','utf8')
assert.equal((actions.match(/p_cod:resolveOrderCod\(/g)??[]).length,2)
assert.equal(resolveOrderCod('PAID','199000'),0)
assert.equal(resolveOrderCod('PAID',null),0)
assert.equal(resolveOrderCod('PARTIAL','25000'),25000)
assert.equal(resolveOrderCod('UNPAID','0'),0)
assert.equal(resolveOrderCod('PENDING','25000'),25000)
assert.equal(resolveOrderCod('REFUNDED','16000'),16000)
for(const status of ['UNPAID','PARTIAL','PENDING','REFUNDED']){
  assert.throws(()=>resolveOrderCod(status,''),/Vui lòng nhập COD/)
}
assert.throws(()=>resolveOrderCod('PARTIAL','-1'))
assert.throws(()=>resolveOrderCod('UNPAID','abc'))
console.log('ORDER_PREPAID_QA 41 PASS')
