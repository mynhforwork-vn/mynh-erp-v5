/* Show exactly two manually editable device fields without losing old data.
   Legacy manual-primary stored both device name and browser in one row. */
export type AccountDeviceRow={
  device_key?:string|null,device_type?:string|null,
  device_name?:string|null,browser_name?:string|null,is_active?:boolean|null,
}
export function accountDeviceFields(row:{
  all_devices?:AccountDeviceRow[]|null,active_devices?:AccountDeviceRow[]|null,
  browser_name?:string|null
}):{mobileType:string,browserName:string}{
  const rows=row.all_devices??row.active_devices??[]
  const mobile=rows.find(d=>d.device_key==='manual-mobile')
  const browser=rows.find(d=>d.device_key==='manual-browser')
  const legacy=rows.find(d=>d.device_key==='manual-primary'&&d.is_active!==false)
  const otherMobile=rows.find(d=>d.device_type==='MOBILE'&&d.is_active!==false&&d.device_key!=='manual-primary')
  const otherBrowser=rows.find(d=>d.device_type!=='MOBILE'&&d.is_active!==false&&d.device_key!=='manual-primary')
  const mobileType=mobile
    ?(mobile.is_active===false?'':mobile.device_name??'')
    :(legacy&&legacy.device_type!=='BROWSER_PROFILE'?legacy.device_name??'':otherMobile?.device_name??'')
  const browserName=browser
    ?(browser.is_active===false?'':browser.browser_name||browser.device_name||'')
    :(legacy?.browser_name||otherBrowser?.browser_name||row.browser_name||'')
  return {mobileType:String(mobileType).trim(),browserName:String(browserName).trim()}
}
