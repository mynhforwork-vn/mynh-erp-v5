// Standalone payment metadata contract. No Supabase writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parsePrepaidMetadata,prepaidSourceLabel} from '../lib/order-prepaid.ts'
const test=(paymentStatus,amount,type,label,isCreate=true)=>
  parsePrepaidMetadata({paymentStatus,amount,sourceType:type,sourceLabel:label,isCreate})
assert.deepEqual(test('PAID','250000','CREDIT_CARD','Visa ****1234'),
  {prepaid_amount:250000,prepaid_source_type:'CREDIT_CARD',prepaid_source_label:'Visa ****1234'})
assert.deepEqual(test('PARTIAL','85000','BANK_ACCOUNT','MB Bank'),
  {prepaid_amount:85000,prepaid_source_type:'BANK_ACCOUNT',prepaid_source_label:'MB Bank'})
assert.deepEqual(test('UNPAID','250000','CREDIT_CARD','Visa ****1234'),
  {prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null})
assert.deepEqual(test('REFUNDED','','',''),{prepaid_amount:null,prepaid_source_type:null,prepaid_source_label:null})
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
assert.match(editor,/\{!showPrepaid&&<div className="order-prepaid-quick-action">/)
assert.match(editor,/<div className="order-prepaid-fields">/)
assert.doesNotMatch(editor,/\{showPrepaid&&<div className="order-prepaid-fields">/)
assert.match(editor,/onClick=\{\(\)=>setPaymentStatus\('PAID'\)\}/)
console.log('ORDER_PREPAID_QA 15 PASS')
