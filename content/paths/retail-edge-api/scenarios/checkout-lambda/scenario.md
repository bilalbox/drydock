Retail Demo Store uses AWS Lambda functions for lightweight serverless tasks around checkout: signing payment payloads with a key from Secrets Manager, and processing queued order events from SQS.

Deploy the payment-signing Lambda function with its execution role and secret-reading policy first, then attach an order-event consumer Lambda triggered by the `retaildemostore-orders-events` SQS queue.
