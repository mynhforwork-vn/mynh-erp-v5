import assert from 'node:assert/strict'
import {parseShopeeOrderText,formatParsedOrderSummary} from '../lib/shopee-order-text-parser.ts'
import {sample as pendingSample} from './fixtures/shopee-pending-payment-sample.mjs'

// Tất cả thông tin người nhận dưới đây đều là dữ liệu QA giả lập.
// Không tạo/lưu đơn trên Supabase trong bài test này.
const markdown=`MÃ ĐƠN HÀNG. 261011QA12345|Đơn hàng đã hủy
##
[Xem chi tiết Hủy đơn](https://shopee.vn/user/purchase/cancellation/12345)
odp_accessibility_component_41
Địa chỉ nhận hàng
Nhanh
Người Nhận QA
(+84) 900 123 456
Nhà mẫu - Ng200 Đường QA, Phường Bạch Mai, Thành phố Hà Nội
[Đã hủy](https://cf.shopee.vn/file/canceled_3x)
14:52 11-10-2026
**Đã hủy**
Đơn hàng đã bị hủy
[Đặt hàng thành công](https://cf.shopee.vn/file/order_placed_3x)
14:23 11-10-2026
**Đặt hàng thành công**
Đơn hàng đã được đặt
svg
**Cửa hàng QA**
svgchat
[svgXem Shop](https://shopee.vn/qa-store?entryPoint=OrderDetail)
[Hộp Bánh Cá Marine Boy full Vị - Shop Siêu Thị Lan Chi](https://shopee.vn/example-i.1080579265.24006077822)
[Phân loại hàng: 1 hộp](https://shopee.vn/example-i.1080579265.24006077822)
[x1](https://shopee.vn/example-i.1080579265.24006077822)
[21.000₫](https://shopee.vn/example-i.1080579265.24006077822)
[image](https://down-vn.img.susercontent.com/file/placeholder)
[Dầu Đậu Nành Simply Nguyên chất chai 1 Lít](https://shopee.vn/example-i.1080579265.29968085900)
[x1](https://shopee.vn/example-i.1080579265.29968085900)
[81.900₫](https://shopee.vn/example-i.1080579265.29968085900)
Tổng tiền hàng
102.900₫
Phí vận chuyển
1.000₫
Giảm giá phí vận chuyển
svg
-1.000₫
Voucher từ Shopee
-100.000₫
Thành tiền
2.900₫
Vui lòng thanh toán **2.900₫** khi nhận hàng.
Phương thức Thanh toán
Thanh toán khi nhận hàng`

let passed=0
function check(name,actual,expected){assert.deepEqual(actual,expected,name);passed++}
const plain=markdown.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/\*\*/g,'')
for(const [kind,input] of [['markdown',markdown],['plain',plain],['escaped-lines',markdown.replaceAll('\n',String.fromCharCode(92)+'\n')]]){
  const p=parseShopeeOrderText(input)
  check(kind+' order id with pipe',p.shopee_order_id,'261011QA12345')
  check(kind+' currently cancelled, not placed/delivered',p.detected_status,'CANCELLED')
  check(kind+' date placed',p.order_date_local,'2026-10-11T14:23')
  check(kind+' date cancelled',p.cancelled_date_local,'2026-10-11T14:52')
  check(kind+' recipient ignores speed/shipping label',p.recipient_name,'Người Nhận QA')
  check(kind+' VN phone',p.recipient_phone,'0900123456')
  check(kind+' preserve address Ng200',p.recipient_address,'Nhà mẫu - Ng200 Đường QA, Phường Bạch Mai, Thành phố Hà Nội')
  check(kind+' recipient confidence',p.confidence.recipient,true)
  check(kind+' 2 products',p.products.length,2)
  check(kind+' first product name',p.products[0].product_name,'Hộp Bánh Cá Marine Boy full Vị - Shop Siêu Thị Lan Chi')
  check(kind+' first variant',p.products[0].variant,'1 hộp')
  check(kind+' second product name',p.products[1].product_name,'Dầu Đậu Nành Simply Nguyên chất chai 1 Lít')
  check(kind+' second variant absent',p.products[1].variant,'')
  check(kind+' qty',[...p.products.map(x=>x.quantity)],[1,1])
  check(kind+' original prices',p.products.map(x=>x.original_price),[21000,81900])
  check(kind+' final prices not invented',p.products.map(x=>x.final_price),[null,null])
  check(kind+' total goods',p.total_goods,102900)
  check(kind+' shipping',p.shipping_fee,1000)
  check(kind+' shipping discount',p.shipping_discount,1000)
  check(kind+' voucher discount',p.shopee_voucher_discount,100000)
  check(kind+' original total remains 2900',p.original_total,2900)
  check(kind+' no collectible COD',p.cod,0)
  check(kind+' no COD confidence',p.confidence.cod,false)
  check(kind+' original COD method',p.payment_method,'COD')
  check(kind+' never paid',p.payment_status,'UNPAID')
  check(kind+' missing tracking remains empty',p.tracking_number,undefined)
  check(kind+' two vouchers',p.vouchers.map(v=>[v.voucher_type,v.voucher_tag]),[['Vận chuyển','Phí vận chuyển'],['Shopee','Shopee']])
  check(kind+' no voucher code invented',p.vouchers.every(v=>!v.voucher_code),true)
  check(kind+' balance valid',p.warnings,[])
  check(kind+' summary marks cancellation',formatParsedOrderSummary(p).includes('Đã hủy'),true)
}
const priority=parseShopeeOrderText(markdown+'\nĐã giao\nĐang vận chuyển\nChờ thanh toán')
check('CANCELLED priority over historical status',priority.detected_status,'CANCELLED')
const mismatch=parseShopeeOrderText(markdown.replace('-100.000₫','-90.000₫'))
check('cancelled wrong total still reported',mismatch.warnings.length,1)
check('cancelled wrong total not converted to COD',mismatch.cod,0)
const pending=parseShopeeOrderText(pendingSample)
check('existing pending review regression',pending.detected_status,'PENDING_SHOPEE_CONFIRMATION')
check('existing pending COD regression',pending.cod,500)
check('existing pending goods regression',pending.total_goods,100500)
check('existing pending recognition unchanged',pending.products.length,2)
check('in transit still recognized',parseShopeeOrderText('Đang vận chuyển\nMÃ ĐƠN HÀNG. 261013TESTQA02\nSPXVN123456789').detected_status,'IN_TRANSIT')
check('delivered still recognized',parseShopeeOrderText('MÃ ĐƠN HÀNG. 261013TESTQA03\nĐã giao').detected_status,'DELIVERED')
check('COD English regression',parseShopeeOrderText('Phương thức Thanh toán\nCash on Delivery').payment_method,'COD')
console.log('SHOPEE_CANCELLED_QA_SUMMARY '+JSON.stringify({passed,failed:0}))
