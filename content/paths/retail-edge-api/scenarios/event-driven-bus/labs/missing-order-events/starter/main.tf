resource "aws_cloudwatch_event_bus" "retail" {
  name = "retaildemostore-bus"
}

resource "aws_sqs_queue" "orders_dlq" {
  name = "retaildemostore-orders-events-dlq"
}

resource "aws_sqs_queue" "orders_events" {
  name = "retaildemostore-orders-events"
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
  })
}
