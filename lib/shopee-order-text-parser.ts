export type ParsedShopeeOrderItem={
  product_name:string
  variant?:string|null
  quantity:number
  original_price?:number|null
  final_price?:number|null
}

export type ParsedShopeeVoucher={
  voucher_code?:string|null
  voucher_name?:string|null
  voucher_type?:string|null
  voucher_tag?:string|null
  voucher_account?:string|null
}

export type ParsedShopeeOrderText={
  shopee_order_id?:string
  tracking_number?:string
  recipient_name?:string
  recipient_phone?:string
  recipient_address?:string
  order_date_local?:string
  cod?:number
  products:ParsedShopeeOrderItem[]
  vouchers:ParsedShopeeVoucher[]
  detected_status?:string
  seller_username?:string
  confidence:{
    order:boolean
    tracking:boolean
    recipient:boolean
    products:number
    cod:boolean
  }
}

function cleanLine(value:string){
  return value
    .replace(/&nbsp;|&#x20;/gi,' ')
    .replace(/ /g,' ')
    .replace(/\\$/,'')
    .trim()
}

function labelFromMarkdown(line:string){
  const match=line.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  return match?{label:match[1].trim(),url:match[2].trim()}:null
}

function money(value:string){
  const raw=value.replace(/[^0-9]/g,'')
  if(!raw)return null
  const n=Number(raw)
  return Number.isFinite(n)?n:null
}

function normalizeVietnamPhone(value:string){
  let digits=value.replace(/[^0-9+]/g,'')
  if(digits.startsWith('+84'))digits='0'+digits.slice(3)
  else if(digits.startsWith('84')&&digits.length>=11)digits='0'+digits.slice(2)
  else digits=digits.replace(/\+/g,'')
  return digits
}

function parseTimestamp(value:string){
  const m=value.match(/(\d{1,2}):(\d{2})\s+(\d{1,2})[-\/]([01]?\d)[-\/](\d{4})/)
  if(!m)return null
  const [,hh,mm,dd,mo,yyyy]=m
  return `${yyyy}-${String(Number(mo)).padStart(2,'0')}-${String(Number(dd)).padStart(2,'0')}T${String(Number(hh)).padStart(2,'0')}:${mm}`
}

function precedingTimestamp(lines:string[],index:number){
  for(let i=index-1;i>=Math.max(0,index-8);i--){
    const parsed=parseTimestamp(lines[i])
    if(parsed)return parsed
  }
  return null
}

function nextMoney(lines:string[],index:number){
  for(let i=index+1;i<Math.min(lines.length,index+5);i++){
    const n=money(lines[i])
    if(n!==null&&/[₫đ]/i.test(lines[i]))return n
  }
  return null
}

function productLink(line:string){
  const md=labelFromMarkdown(line)
  if(!md)return null
  if(!/^https?:\/\/shopee\.vn\//i.test(md.url))return null
  if(!/\.i\.\d+\.\d+/i.test(md.url))return null
  if(/^(image|svg|x\d+|phân loại hàng:|phan loai hang:)/i.test(md.label))return null
  return md
}

export function parseShopeeOrderText(input:string):ParsedShopeeOrderText{
  const lines=input
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)

  const joined=lines.join('\n')
  const result:ParsedShopeeOrderText={
    products:[],
    vouchers:[],
    confidence:{order:false,tracking:false,recipient:false,products:0,cod:false},
  }

  const orderMatch=joined.match(/MÃ\s*ĐƠN\s*HÀNG\s*[.:\-]?\s*([A-Z0-9]{8,30})/iu)
    ??joined.match(/M[aã]\s*đ[oơ]n\s*(?:h[aà]ng)?\s*[.:\-]?\s*([A-Z0-9]{8,30})/iu)
  if(orderMatch){
    result.shopee_order_id=orderMatch[1].trim().toUpperCase()
    result.confidence.order=true
  }

  const trackingMatch=joined.match(/\bSPXVN[A-Z0-9]{8,30}\b/i)
  if(trackingMatch){
    result.tracking_number=trackingMatch[0].toUpperCase()
    result.confidence.tracking=true
  }

  const sellerMatch=joined.match(/https?:\/\/shopee\.vn\/([A-Za-z0-9._-]+)\?entryPoint=OrderDetail/i)
  if(sellerMatch)result.seller_username=sellerMatch[1]

  if(/Giao hàng thành công|\*\*Đã giao\*\*|\bĐã giao\b/i.test(joined))result.detected_status='DELIVERED'
  else if(/Giao hàng không thành công/i.test(joined))result.detected_status='DELIVERY_FAILED'
  else if(/Đang giao|sớm được giao/i.test(joined))result.detected_status='OUT_FOR_DELIVERY'
  else if(/Đang vận chuyển/i.test(joined))result.detected_status='IN_TRANSIT'

  if(result.tracking_number){
    const trackingIndex=lines.findIndex(line=>line.toUpperCase().includes(result.tracking_number!))
    if(trackingIndex>=0){
      for(let i=trackingIndex+1;i<Math.min(lines.length,trackingIndex+8);i++){
        const line=lines[i]
        if(!result.recipient_name && !/^\(?\+?84|^0\d{8,10}/.test(line) && !/^https?:|^\[/.test(line)){
          result.recipient_name=line
          continue
        }
        if(!result.recipient_phone&&/(?:\+?84|0)[\s().-]*\d{2,3}[\s.-]*\d{3}[\s.-]*\d{3,4}/.test(line)){
          result.recipient_phone=normalizeVietnamPhone(line)
          continue
        }
        if(result.recipient_name&&result.recipient_phone&&!result.recipient_address){
          if(/^\[|^\d{1,2}:\d{2}/.test(line))break
          result.recipient_address=line
          break
        }
      }
    }
  }

  if(result.recipient_name&&result.recipient_phone)result.confidence.recipient=true

  const placedIndex=lines.findIndex(line=>/Đơn hàng đã được đặt/i.test(line))
  if(placedIndex>=0){
    result.order_date_local=precedingTimestamp(lines,placedIndex)??undefined
  }
  if(!result.order_date_local){
    const timestamps=lines.map(parseTimestamp).filter((x):x is string=>Boolean(x)).sort()
    if(timestamps.length)result.order_date_local=timestamps[0]
  }

  const codIndex=lines.findIndex(line=>/^Thành tiền$/i.test(line))
  if(codIndex>=0){
    const n=nextMoney(lines,codIndex)
    if(n!==null){
      result.cod=n
      result.confidence.cod=true
    }
  }

  for(let i=0;i<lines.length;i++){
    const link=productLink(lines[i])
    if(!link)continue

    let variant=''
    let quantity=1
    let price:number|null=null

    for(let j=i+1;j<Math.min(lines.length,i+9);j++){
      const line=lines[j]
      const md=labelFromMarkdown(line)
      const label=md?.label??line

      const variantMatch=label.match(/^Phân loại hàng:\s*(.+)$/i)
      if(variantMatch&&!variant)variant=variantMatch[1].trim()

      const qtyMatch=label.match(/^x\s*(\d+)$/i)
      if(qtyMatch)quantity=Math.max(1,Number(qtyMatch[1])||1)

      if(price===null&&/^-?[\d.,]+\s*₫$/i.test(label)){
        price=money(label)
      }

      if(j>i+1&&productLink(line))break
    }

    result.products.push({
      product_name:link.label,
      variant,
      quantity,
      original_price:price,
      final_price:price,
    })
  }
  result.confidence.products=result.products.length

  const voucherLabels=[
    {pattern:/^Giảm giá phí vận chuyển$/i,type:'Vận chuyển',tag:'Phí vận chuyển'},
    {pattern:/^Voucher từ Shopee$/i,type:'Shopee',tag:'Shopee'},
  ]
  for(let i=0;i<lines.length;i++){
    for(const def of voucherLabels){
      if(!def.pattern.test(lines[i]))continue
      const amount=nextMoney(lines,i)
      result.vouchers.push({
        voucher_name:amount!==null?`${lines[i]} · -${new Intl.NumberFormat('vi-VN').format(amount)}₫`:lines[i],
        voucher_type:def.type,
        voucher_tag:def.tag,
      })
    }
  }

  return result
}

export function formatParsedOrderSummary(parsed:ParsedShopeeOrderText){
  const parts:string[]=[]
  if(parsed.shopee_order_id)parts.push('Mã đơn')
  if(parsed.tracking_number)parts.push('MVĐ')
  if(parsed.recipient_name||parsed.recipient_phone)parts.push('Người nhận')
  if(parsed.products.length)parts.push(parsed.products.length+' sản phẩm')
  if(parsed.cod!==undefined)parts.push('Thành tiền')
  return parts.join(' · ')
}
