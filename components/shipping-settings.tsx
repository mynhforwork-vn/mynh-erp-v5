'use client'

import { useState } from 'react'
import { ShippingCarrierSettings,type ShippingCarrierConfig } from '@/components/shipping-carrier-settings'
import { DestinationHubSettings,DestinationShipperSettings } from '@/components/destination-hub-config-panel'

type HubConfig={
  id:string
  hub_code:string
  area:string
  region:string
  province_keywords?:string[]|null
  district_keywords?:string[]|null
  address_keywords?:string[]|null
  carrier_code?:string|null
  tracking_location_aliases?:string[]|null
  shipper_ids?:string[]
  priority?:number|null
  is_active?:boolean|null
}
type Shipper={
  id:string
  name:string
  phone?:string|null
  note?:string|null
  is_active?:boolean|null
}
type Tab='carriers'|'hubs'|'shippers'

export function ShippingSettings({
  carriers,
  configs,
  shippers,
  canEdit,
  initialTab='carriers',
}:{
  carriers:ShippingCarrierConfig[]
  configs:HubConfig[]
  shippers:Shipper[]
  canEdit:boolean
  initialTab?:Tab
}){
  const [tab,setTab]=useState<Tab>(initialTab)

  return <div className="settings-module-shell shipping-settings-v6">
    <div className="destination-detail-tabs settings-subtabs-v6">
      <button type="button" className={tab==='carriers'?'active':''} onClick={()=>setTab('carriers')}>
        Đơn vị vận chuyển <span>{carriers.filter(x=>x.is_active).length}</span>
      </button>
      <button type="button" className={tab==='hubs'?'active':''} onClick={()=>setTab('hubs')}>
        Kho đích <span>{configs.filter(x=>x.is_active).length}</span>
      </button>
      <button type="button" className={tab==='shippers'?'active':''} onClick={()=>setTab('shippers')}>
        Shipper <span>{shippers.filter(x=>x.is_active).length}</span>
      </button>
    </div>

    <div className="settings-subtab-body-v6">
      {tab==='carriers'&&<ShippingCarrierSettings carriers={carriers} canEdit={canEdit}/>}
      {tab==='hubs'&&<DestinationHubSettings configs={configs} shippers={shippers} canEdit={canEdit} showShipperManager={false}/>} 
      {tab==='shippers'&&<DestinationShipperSettings configs={configs} shippers={shippers} canEdit={canEdit}/>}
    </div>
  </div>
}
