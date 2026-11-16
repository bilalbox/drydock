The `retaildemostore-orders-events` SQS queue and its dead-letter queue are already defined, and `function.zip` (containing `lambda_function.py` with `lambda_handler`) is already in the workspace.

Wire a serverless consumer for incoming order events while keeping the queues intact:

- Create an IAM execution role named `retaildemostore-order-consumer-role` assumable by Lambda, with permissions to write CloudWatch Logs and poll/delete messages from `retaildemostore-orders-events` (`sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`).
- Deploy a `python3.12` Lambda function named `retaildemostore-order-consumer` using `function.zip` and handler `lambda_function.lambda_handler`.
- Connect `retaildemostore-orders-events` to `retaildemostore-order-consumer` via an enabled event source mapping with a batch size of `10`.
