-- MYNH ERP V5 — BIEN BAN KIEM TRA SAU HIEU CHINH LICH SU SPX (13/10/2026)
-- TRANG THAI: DA THUC HIEN TREN SUPABASE PRODUCTION, KHONG CHAY LAI BAN VA.
-- File hien tai CHI DOC. Khong UPDATE, INSERT, DELETE, MIGRATE hoac DEPLOY.
--
-- Thay doi da duoc xac nhan:
-- 1) Doi carrier cua 3 mapping hien co tu 'SPX EXPRESS' thanh 'SPX',
--    GIU NGUYEN id/priority/raw_name/canonical_status, khong tao mapping trung.
-- 2) Chuyen 38 tracking_events.normalized_status:
--    F100 UNKNOWN -> PICKED_UP    (24 events)
--    F596 UNKNOWN -> IN_TRANSIT   (13 events)
--    F098 UNKNOWN -> IN_TRANSIT   (1 event)
-- 3) KHONG thay shipments, orders, alerts, F599, GHN, Telegram, polling/cron.
-- 4) 7 su kien UNKNOWN thuoc cac ma F099, F200, F206, F230, F239, F299,
--    F300 nam ngoai pham vi; KHONG tu doan mapping.
-- 5) E2E PR #75 can kiem thu/merge/deploy RIENG, khong duoc xem ban va DB
--    la bang chung E2E ung dung tren Production.

-- 1. Ba mapping goc, khong con ban sao 'SPX EXPRESS'.
SELECT carrier,raw_code,raw_name,canonical_status,is_active,priority
FROM public.carrier_status_mappings
WHERE raw_code IN ('F100','F596','F098','F599')
ORDER BY raw_code,carrier;

-- 2. Dem su kien theo trang thai sau hieu chinh.
SELECT upper(btrim(s.carrier)) carrier,e.raw_status_code,
       e.normalized_status::text normalized_status,count(*)::int events
FROM public.tracking_events e
JOIN public.shipments s ON s.id=e.shipment_id
WHERE upper(btrim(s.carrier))='SPX EXPRESS'
  AND upper(btrim(e.raw_status_code)) IN ('F100','F596','F098')
GROUP BY 1,2,3 ORDER BY e.raw_status_code,normalized_status;

-- 3. Confirm resolver applies canonical SPX mapping for future events.
SELECT x.raw_code,r.normalized_status::text as normalized_status,r.mapping_source
FROM (VALUES ('F100','Pickup From Domestic Seller'),
             ('F596','Packed in Last Mile Hub'),
             ('F098','Dropoff Done By Domestic Seller')) AS x(raw_code,raw_name)
CROSS JOIN LATERAL
  public.resolve_tracking_status('SPX Express',x.raw_code,x.raw_name,'','') r
ORDER BY x.raw_code;

-- 4. Other UNKNOWN events remain pending separate business confirmation.
SELECT upper(btrim(s.carrier)) carrier,coalesce(e.raw_status_code,'(null)') raw_code,
       count(*)::int unknown_events
FROM public.tracking_events e
JOIN public.shipments s ON s.id=e.shipment_id
WHERE e.normalized_status='UNKNOWN'
GROUP BY 1,2
ORDER BY unknown_events DESC,raw_code;

-- KHONG tu dong chay lai dau ghi du lieu voi file nay.
