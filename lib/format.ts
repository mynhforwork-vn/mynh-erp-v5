const STATUS_LABELS: Record<string, string> = {
  READY_TO_SHIP: 'Người gửi chuẩn bị hàng',
  PICKED_UP: 'Lấy hàng thành công',
  IN_TRANSIT: 'Đang vận chuyển',
  ARRIVED_TRANSIT_HUB: 'Đã đến kho trung chuyển',
  ARRIVED_DESTINATION_HUB: 'Đã đến kho đích',
  OUT_FOR_DELIVERY: 'Đang giao hàng',
  DELIVERY_FAILED: 'Giao hàng không thành công',
  RETURNING: 'Đang hoàn hàng',
  DELIVERED: 'Giao hàng thành công',
  RETURNED: 'Trả hàng thành công',
  CANCELLED: 'Đã hủy',
  UNKNOWN: 'Không xác định',
  NOT_READY: 'Chưa sẵn sàng nhận',
  WAITING_RECEIVE: 'Chờ nhận',
  RECEIVED: 'Đã nhận',
  TRANSFERRED: 'Đã chuyển kho',
  WAREHOUSE_RECEIVED: 'Đã nhập kho',
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  RUNNING: 'Đang chạy',
  IDLE: 'Sẵn sàng',
  Active: 'Hoạt động',
  Inactive: 'Ngừng hoạt động',
  Blocked: 'Đã khóa',
  Captcha: 'Lỗi Captcha',
  'Auto Hủy': 'Tự động hủy',
  M01: 'Lỗi M01',
  M02: 'Lỗi M02',
  M03: 'Lỗi M03',
  M04: 'Lỗi M04',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  operator: 'Nhân viên vận hành',
  viewer: 'Chỉ xem',
  authenticated: 'Người dùng',
}

const SOURCE_LABELS: Record<string, string> = {
  AUTO: 'Tự động',
  MANUAL: 'Thủ công',
  SYSTEM: 'Hệ thống',
  PROVIDER: 'Đơn vị vận chuyển',
  USER: 'Người dùng',
  CRON: 'Lịch tự động',
}

const ALERT_LABELS: Record<string, string> = {
  ARRIVED_DESTINATION_HUB: 'Đơn đến kho',
  OUT_FOR_DELIVERY: 'Đơn đang giao',
  DELIVERY_FAILED: 'Giao hàng không thành công',
  DELIVERED: 'Giao hàng thành công',
}

function dateParts(value?: string | Date | null) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const x = Object.fromEntries(parts.map(p => [p.type, p.value])) as Record<string, string>
  return x
}

export function formatDateTime(value?: string | Date | null) {
  const x = dateParts(value)
  return x ? `${x.day}/${x.month}/${x.year} ${x.hour}:${x.minute}` : '—'
}

export function formatDate(value?: string | Date | null) {
  const x = dateParts(value)
  return x ? `${x.day}/${x.month}/${x.year}` : '—'
}

export function formatTime(value?: string | Date | null) {
  const x = dateParts(value)
  return x ? `${x.hour}:${x.minute}` : '—'
}

export function formatMoney(value?: number | string | null) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0) + ' đ'
}

export function formatPhone(value?: string | null) {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (!digits) return value
  if (digits.length === 11 && digits.startsWith('84')) {
    const local = '0' + digits.slice(2)
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return value
}

export function statusLabel(status?: string | null) {
  if (!status) return 'Không xác định'
  return STATUS_LABELS[status] ?? status
}

export function roleLabel(role?: string | null) {
  if (!role) return 'Người dùng'
  return ROLE_LABELS[role] ?? role
}

export function sourceLabel(source?: string | null) {
  if (!source) return 'Không xác định'
  return SOURCE_LABELS[source] ?? source
}

export function alertTypeLabel(type?: string | null) {
  if (!type) return 'Cảnh báo'
  return ALERT_LABELS[type] ?? type
}
