-- Allow the public invoker wrapper to reach the private implementation.
-- The private function still enforces private.assert_operator(), and the
-- private schema is not exposed through the Data API RPC surface.
grant execute on function private.receive_orders_into_warehouse_impl(uuid[],text)
to authenticated;
