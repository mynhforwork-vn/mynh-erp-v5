/**
 * Deterministic destination-HUB suggestion based on the configured recipient
 * address rules. This is a provisional route until carrier tracking reports
 * a verified HUB. Never choose between ambiguous matches.
 */
export type AddressHub={
 hub_code:string;area?:string|null;region?:string|null;
 priority?:number|null;carrier_code?:string|null;
 province_keywords?:string[]|null;district_keywords?:string[]|null;
 address_keywords?:string[]|null;
}
const normalize=(value:string)=>String(value??'')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/đ/g,'d').replace(/Đ/g,'D')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const tokens=(value:string)=>' '+normalize(value)+' '
function matched(address:string,words?:string[]|null){
 return (words??[]).filter(w=>Boolean(normalize(String(w)))&&
   address.includes(tokens(String(w)))).sort((a,b)=>b.length-a.length)
}
export function suggestDestinationHub(address:string|null|undefined,hubs:AddressHub[],carrierCode='SPX'){
 const normalized=tokens(String(address??''))
 if(!normalize(String(address??'')))return null
 const active=hubs.filter(x=>!x.carrier_code||x.carrier_code===carrierCode)
 const scores=active.map(h=>{
   const province=matched(normalized,h.province_keywords)
   const district=matched(normalized,h.district_keywords)
   const addr=matched(normalized,h.address_keywords)
   return {hub:h,province,district,addr,
     score:(district.length?100:0)+(addr.length?80:0)+(province.length?15:0)+
       Math.max(district[0]?.length??0,addr[0]?.length??0)/100}
 })
 // A ward/district/address rule wins only when a unique strongest match exists.
 const strong=scores.filter(x=>x.district.length>0||x.addr.length>0)
 if(strong.length){
   strong.sort((a,b)=>b.score-a.score)
   if(strong.length>1&&Math.abs(strong[0].score-strong[1].score)<.01)return null
   return strong[0].hub
 }
 // Province fallback is safe ONLY when there is exactly one configured HUB
 // serving the province (e.g. the current BG/Bắc Ninh configuration).
 const province=scores.filter(x=>x.province.length>0)
 return province.length===1?province[0].hub:null
}
