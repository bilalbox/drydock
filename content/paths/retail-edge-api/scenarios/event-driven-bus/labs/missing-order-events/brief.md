Completed orders are no longer appearing in `retaildemostore-orders-events`, even though the orders service is still publishing to `retaildemostore-bus` with source `retaildemostore.orders`.

Someone touched EventBridge in the console during an incident and re-applying the current workspace does not bring messages back. Restore active event routing from `retaildemostore-bus` to `retaildemostore-orders-events` while keeping the queue and DLQ intact.
