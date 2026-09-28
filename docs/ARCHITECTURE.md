# Architecture

Order → Shipment → Tracking Event → Normalize → State Transition → Alert / Receive / Dashboard.

Carrier status and ERP business status are separate. DELIVERED never means RECEIVED automatically.
