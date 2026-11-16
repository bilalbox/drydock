The `retaildemostore-bus` custom EventBridge bus, 120-day archive, and disabled catch-all rule are already defined.

Keep those resources intact and buffer incoming order events for asynchronous processing:

- Create a dead-letter SQS queue named `retaildemostore-orders-events-dlq`.
- Create a main SQS queue named `retaildemostore-orders-events` configured with a redrive policy targeting the DLQ after `5` receives.
- Attach a queue policy permitting `events.amazonaws.com` to call `sqs:SendMessage` on `retaildemostore-orders-events`.
- Create an enabled EventBridge rule named `retaildemostore-orders-to-sqs` on `retaildemostore-bus` matching `source` `["retaildemostore.orders"]`, and target `retaildemostore-orders-events`.
