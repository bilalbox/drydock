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

resource "aws_sqs_queue_policy" "orders_events" {
  queue_url = aws_sqs_queue.orders_events.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.orders_events.arn
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "orders_to_sqs" {
  name           = "retaildemostore-orders-to-sqs"
  event_bus_name = aws_cloudwatch_event_bus.retail.name
  state          = "ENABLED"
  event_pattern = jsonencode({
    source = ["retaildemostore.orders"]
  })
}

resource "aws_cloudwatch_event_target" "orders_to_sqs" {
  rule           = aws_cloudwatch_event_rule.orders_to_sqs.name
  event_bus_name = aws_cloudwatch_event_bus.retail.name
  target_id      = "OrdersEventsSqs"
  arn            = aws_sqs_queue.orders_events.arn
}
