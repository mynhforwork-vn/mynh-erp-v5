export type DocumentPrintConfig={
  document_key:'SALE_INVOICE'|'DEBT_RECEIPT'
  brand_name:string
  title:string
  header_note?:string|null
  paper_size:'A4'|'A5'|'RECEIPT_80'
  footer_text?:string|null
  show_customer_phone:boolean
  show_warehouse:boolean
  show_sku:boolean
  show_variant:boolean
  show_qr:boolean
  show_signature:boolean
  show_invoice_details:boolean
  is_active:boolean
}

export const DEFAULT_SALE_PRINT_CONFIG:DocumentPrintConfig={
  document_key:'SALE_INVOICE',
  brand_name:'MYNH ERP',
  title:'PHIẾU BÁN HÀNG',
  header_note:null,
  paper_size:'A4',
  footer_text:'Cảm ơn quý khách!',
  show_customer_phone:true,
  show_warehouse:true,
  show_sku:true,
  show_variant:true,
  show_qr:true,
  show_signature:false,
  show_invoice_details:true,
  is_active:true,
}

export const DEFAULT_DEBT_PRINT_CONFIG:DocumentPrintConfig={
  document_key:'DEBT_RECEIPT',
  brand_name:'MYNH ERP',
  title:'PHIẾU THU CÔNG NỢ',
  header_note:null,
  paper_size:'A4',
  footer_text:'Phiếu được phát hành sau khi giao dịch đã ghi nhận trên MYNH ERP.',
  show_customer_phone:true,
  show_warehouse:true,
  show_sku:true,
  show_variant:true,
  show_qr:true,
  show_signature:true,
  show_invoice_details:true,
  is_active:true,
}

export function normalizeDocumentPrintConfig(
  row:any,
  fallback:DocumentPrintConfig,
):DocumentPrintConfig{
  if(!row)return {...fallback}
  return {
    ...fallback,
    document_key:row.document_key===fallback.document_key?row.document_key:fallback.document_key,
    brand_name:String(row.brand_name??fallback.brand_name),
    title:String(row.title??fallback.title),
    header_note:row.header_note?String(row.header_note):null,
    paper_size:['A4','A5','RECEIPT_80'].includes(String(row.paper_size))
      ? row.paper_size
      : fallback.paper_size,
    footer_text:row.footer_text?String(row.footer_text):null,
    show_customer_phone:Boolean(row.show_customer_phone),
    show_warehouse:Boolean(row.show_warehouse),
    show_sku:Boolean(row.show_sku),
    show_variant:Boolean(row.show_variant),
    show_qr:Boolean(row.show_qr),
    show_signature:Boolean(row.show_signature),
    show_invoice_details:Boolean(row.show_invoice_details),
    is_active:Boolean(row.is_active),
  }
}
