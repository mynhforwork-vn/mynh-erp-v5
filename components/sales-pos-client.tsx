'use client'

import dynamic from 'next/dynamic'

// POS requires interactive checkout, barcode input, cart state and printing.
// It does not need a full server-rendered cashier UI for every auth/route probe.
// Keep warehouse/product/customer reads and all checkout authorization server-side.
export const SalesPOSClient=dynamic(
  ()=>import('./sales-pos-workspace').then(mod=>mod.SalesPOSWorkspace),
  {
    ssr:false,
    loading:()=>(
      <div className="pos-loading-state" role="status" aria-live="polite">
        Đang tải quầy bán hàng…
      </div>
    ),
  },
)
