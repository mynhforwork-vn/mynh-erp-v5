'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {formatMoney} from '@/lib/format'
import {isDeliveredAwaitingReceipt,isPreDestinationTransit} from '@/lib/tracking/status-groups'
import {TRACKING_LIVE_EVENT,type TrackingSyncSnapshot} from '@/lib/tracking/live-snapshot'

type Row={shipment_id:string|null;tracking_number:string|null;tracking_status:string|null;receive_status:string|null;destination_hub:string|null;cod:number|string|null}
export function TrackingLiveKpis({rows,links,active}:{
  rows:Row[]
  links:[string,string,string,string,string]
  active:string
}){
  const [live,setLive]=useState(rows)
  useEffect(()=>setLive(rows),[rows])
  useEffect(()=>{
    const update=(event:Event)=>{
      const value=(event as CustomEvent<TrackingSyncSnapshot>).detail
      if(!value?.shipment_id)return
      setLive(current=>current.map(row=>row.shipment_id===value.shipment_id?{
        ...row,tracking_status:value.current_tracking_status,
        tracking_number:value.tracking_number,receive_status:value.receive_status
      }:row))
    }
    window.addEventListener(TRACKING_LIVE_EVENT,update)
    return ()=>window.removeEventListener(TRACKING_LIVE_EVENT,update)
  },[])
  const transit=live.filter(row=>isPreDestinationTransit(row.tracking_number,row.tracking_status)).length
  const atHub=live.filter(row=>row.tracking_status==='ARRIVED_DESTINATION_HUB').length
  const out=live.filter(row=>row.tracking_status==='OUT_FOR_DELIVERY').length
  const waiting=live.filter(row=>isDeliveredAwaitingReceipt(row.tracking_status,row.receive_status))
  const failed=live.filter(row=>row.tracking_status==='DELIVERY_FAILED').length
  const cod=waiting.reduce((sum,row)=>sum+Number(row.cod??0),0)
  const hubCount=new Set(waiting.map(row=>row.destination_hub).filter(Boolean)).size
  const cards=[
    {key:'PRE_DESTINATION',name:'Đang vận chuyển',count:transit,detail:'Có MVĐ · Chưa đến HUB',tone:'info'},
    {key:'ARRIVED_DESTINATION_HUB',name:'Đến HUB',count:atHub,detail:'Cần theo dõi',tone:'warning'},
    {key:'OUT_FOR_DELIVERY',name:'Đang giao',count:out,detail:'Shipper đang xử lý',tone:'info'},
    {key:'DELIVERED',name:'Giao thành công',count:waiting.length,detail:`Chờ nhận · ${formatMoney(cod)} · ${hubCount} HUB`,tone:'success'},
    {key:'DELIVERY_FAILED',name:'Giao lỗi',count:failed,detail:'Cần xử lý',tone:'danger'},
  ]
  return <div className="tracking-status-strip-v2" aria-label="Tổng quan vận chuyển">
    {cards.map((card,i)=><Link key={card.key} href={links[i]} prefetch={false}
      className={'tracking-status-metric kpi-card entity-status-metric '+card.tone+(active===card.key?' active':'')}
      title={card.detail}>
      <span>{card.name}</span><b>{card.count}</b><small>{card.detail}</small>
    </Link>)}
  </div>
}
