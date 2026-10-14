/**
 * Hợp đồng Auto Fit riêng bảng Tài khoản mua hàng.
 * Một thuật toán chung cho React (khi hydrate) và bộ kéo cột DOM.
 * Chiều ngang bảng luôn khớp vùng hiển thị: không tạo cuộn ngang.
 * Độ rộng kéo thủ công là giá trị ưu tiên, không bị ghi đè khi panel hẹp.
 */
export const ACCOUNT_FIT_FLOORS:Record<string,number>={
  select:28,number:24,username:104,platform:38,phone:72,email:75,
  status:54,mobile:54,browser:48,voucher:50,orders:34,
  deliveredOrders:54,createdAt:85,note:45,
}
const TIGHT_FLOORS:Record<string,number>={
  select:24,number:20,username:64,platform:24,phone:42,email:42,
  status:30,mobile:30,browser:30,voucher:35,orders:26,
  deliveredOrders:32,createdAt:54,note:27,
}
const SHRINK_ORDER=['note','email','mobile','browser','username','voucher',
  'phone','createdAt','status','platform','deliveredOrders','orders']
const GROW_ORDER=['email','username','note','mobile','browser','voucher',
  'phone','createdAt','status','platform']

export function fitAccountColumnWidths(
  keys:string[],preferred:number[],lane:number,manual:boolean[]=[],
):number[]{
  const widths=preferred.map((width,i)=>Math.max(12,Math.round(Number.isFinite(width)?width:80)))
  if(!keys.length||!Number.isFinite(lane)||lane<=0)return widths
  const target=Math.max(keys.length*12,Math.floor(lane)-2)
  const index=(key:string)=>keys.indexOf(key)
  let remainder=target-widths.reduce((sum,width)=>sum+width,0)

  const reduceTo=(floors:Record<string,number>,protectManual:boolean)=>{
    for(const key of [...SHRINK_ORDER,'number','select']){
      const i=index(key)
      if(i<0||remainder>=0||(protectManual&&manual[i]))continue
      const floor=Math.max(12,floors[key]??24)
      const remove=Math.min(-remainder,Math.max(0,widths[i]-floor))
      widths[i]-=remove
      remainder+=remove
    }
  }

  if(remainder<0){
    // Cột đã chỉnh tay được ưu tiên giữ nguyên; chỉ thu khi thực sự thiếu chỗ.
    reduceTo(ACCOUNT_FIT_FLOORS,true)
    // Ưu tiên thu các cột chưa chỉnh tay xuống mức gọn trước khi
    // đụng tới độ rộng do người dùng kéo và lưu.
    if(remainder<0)reduceTo(TIGHT_FLOORS,true)
    if(remainder<0)reduceTo(ACCOUNT_FIT_FLOORS,false)
    if(remainder<0)reduceTo(TIGHT_FLOORS,false)
    if(remainder<0){
      // Vùng cực nhỏ: ưu tiên tất cả cột nằm trong bảng, không sinh scroll.
      const sequence=[...SHRINK_ORDER,'number','select']
      for(const key of sequence){
        const i=index(key)
        if(i<0||remainder>=0)continue
        const cut=Math.min(-remainder,Math.max(0,widths[i]-12))
        widths[i]-=cut
        remainder+=cut
      }
    }
  }
  if(remainder>0){
    // Giống Đơn nhập: giãn cột văn bản chưa chỉnh tay trước.
    const free=GROW_ORDER.map(index).filter(i=>i>=0&&!manual[i])
    const recipients=free.length?free:GROW_ORDER.map(index).filter(i=>i>=0)
    if(recipients.length){
      const per=Math.floor(remainder/recipients.length)
      recipients.forEach((i,j)=>widths[i]+=j===recipients.length-1
        ?remainder-per*j:per)
    }else if(widths.length)widths[widths.length-1]+=remainder
  }
  return widths
}
