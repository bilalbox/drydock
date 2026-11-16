Retail Demo Store microservices publish domain events—such as cart updates and completed orders—onto a shared custom Amazon EventBridge bus (`retaildemostore-bus`).

Build the custom event bus, a 120-day event archive (`retaildemostore-arch`), and a catch-all debugging rule (disabled by default) first, then route order events reliably to an SQS queue backed by a dead-letter queue.
