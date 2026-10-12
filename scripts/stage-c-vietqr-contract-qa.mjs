import assert from 'node:assert/strict'
import {buildVietQRUrl,buildTransferDescription} from '../lib/vietqr.ts'
const sample={bank_id:'970436',bank_name:'QA',account_no:'0123456789',account_name:'QA USER',qr_template:'compact2'}
const results=[]
function check(label,value){results.push({label,pass:Boolean(value)});console.log('VIETQR_CONTRACT_CHECK '+JSON.stringify({label,pass:Boolean(value)}))}
for(const [reference,amount] of [
  ['POS-261012-000123',123000],
  ['PT-261012-000045',500000],
  ['SPX-12345-ABCD',1],
]){
  const displayed=buildTransferDescription(null,reference)
  const url=new URL(buildVietQRUrl(sample,amount,displayed))
  check('Exact displayed reference '+reference,url.searchParams.get('addInfo')===displayed)
  check('Exact amount '+reference,url.searchParams.get('amount')===String(amount))
  check('Bank QR URL stays HTTPS '+reference,url.protocol==='https:'&&url.hostname==='img.vietqr.io')
}
const sanitized=buildTransferDescription(null,'POS-26 / Hóa đơn #123')
const qr=new URL(buildVietQRUrl(sample,123000,sanitized))
check('No hyphen changed to whitespace',qr.searchParams.get('addInfo')===sanitized)
check('Missing bank account refuses QR',buildVietQRUrl({...sample,account_no:''},123000,sanitized)==='')
check('Zero transfer omits amount',!new URL(buildVietQRUrl(sample,0,sanitized)).searchParams.has('amount'))
check('Negative transfer omits amount',!new URL(buildVietQRUrl(sample,-250,sanitized)).searchParams.has('amount'))
const bad=results.filter(x=>!x.pass)
console.log('VIETQR_CONTRACT_SUMMARY '+JSON.stringify({checks:results.length,passed:results.length-bad.length,failed:bad.length}))
assert.equal(bad.length,0,'QR reference must match visible transfer description')
