-- CHỈ ĐỀ XUẤT — KHÔNG chạy tự động hoặc deploy từ CI.
-- Chỉ thực thi riêng sau khi duyệt phạm vi sửa mapping Production.
-- Nguyên nhân: shipping_carrier_configs chuẩn hóa "SPX Express" -> "SPX"
-- nhưng ba mapping cũ tồn tại dưới carrier "SPX EXPRESS".
-- KHÔNG thay F599 (đến HUB đích phụ thuộc vị trí thực tế).
BEGIN;

DO $guard$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM (VALUES ('F100','PICKED_UP'),('F596','IN_TRANSIT'),('F098','IN_TRANSIT')) expected(raw_code,canonical_status)
  LEFT JOIN public.carrier_status_mappings m
    ON m.carrier='SPX EXPRESS' AND m.raw_code=expected.raw_code
      AND m.canonical_status=expected.canonical_status AND m.is_active
  WHERE m.raw_code IS NULL;
  IF missing<>0 THEN
    RAISE EXCEPTION 'Không đủ 3 mapping gốc SPX EXPRESS đã xác minh, dừng sửa: %',missing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('F100','PICKED_UP'),('F596','IN_TRANSIT'),('F098','IN_TRANSIT')) expected(raw_code,canonical_status)
    JOIN public.carrier_status_mappings m ON m.carrier='SPX' AND m.raw_code=expected.raw_code
    WHERE m.canonical_status<>expected.canonical_status
  ) THEN
    RAISE EXCEPTION 'SPX mapping đã thay đổi khác dữ liệu tiền kiểm, dừng để rà soát';
  END IF;
END $guard$;

INSERT INTO public.carrier_status_mappings(carrier,raw_code,raw_name,canonical_status,is_active,updated_at)
SELECT 'SPX',m.raw_code,m.raw_name,m.canonical_status,true,now()
FROM public.carrier_status_mappings m
WHERE m.carrier='SPX EXPRESS' AND m.raw_code IN ('F100','F596','F098')
ON CONFLICT (carrier,raw_code) DO NOTHING;

-- Chỉ chuẩn hóa sự kiện lịch sử UNKNOWN có mã và nhà vận chuyển xác định chắc chắn.
-- Không động đến F599, không sinh cảnh báo lại, không thay trạng thái shipment mới nhất.
UPDATE public.tracking_events e
SET normalized_status=m.canonical_status::public.tracking_status
FROM public.shipments s, public.carrier_status_mappings m
WHERE e.shipment_id=s.id
  AND upper(btrim(s.carrier))='SPX EXPRESS'
  AND m.carrier='SPX'
  AND m.is_active
  AND m.raw_code IN ('F100','F596','F098')
  AND upper(btrim(coalesce(e.raw_status_code,'')))=m.raw_code
  AND e.normalized_status='UNKNOWN';

-- Đối chiếu số còn sai; cần kiểm tra thực tế trước khi thực thi.
SELECT m.raw_code,m.canonical_status,e.normalized_status::text,count(*) AS rows
FROM public.tracking_events e
JOIN public.shipments s ON s.id=e.shipment_id
JOIN public.carrier_status_mappings m ON m.raw_code=e.raw_status_code AND m.carrier='SPX' AND m.is_active
WHERE upper(btrim(s.carrier))='SPX EXPRESS'
  AND e.raw_status_code IN ('F100','F596','F098')
GROUP BY 1,2,3 ORDER BY 1,3;
COMMIT;
