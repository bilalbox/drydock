resource "aws_cloudwatch_event_bus" "retail" {
  name = "retaildemostore-bus"
}

resource "aws_cloudwatch_event_archive" "retail" {
  name             = "retaildemostore-arch"
  event_source_arn = aws_cloudwatch_event_bus.retail.arn
  retention_days   = 120
}

resource "aws_cloudwatch_log_group" "events" {
  name              = "/aws/events/retaildemostore"
  retention_in_days = 120
}

resource "aws_cloudwatch_event_rule" "catch_all" {
  name           = "CatchAllRetailDemoStoreEventsToCloudWatchLogs"
  event_bus_name = aws_cloudwatch_event_bus.retail.name
  state          = "DISABLED"
  event_pattern = jsonencode({
    source = [{ prefix = "" }]
  })
}

resource "aws_cloudwatch_event_target" "catch_all" {
  rule           = aws_cloudwatch_event_rule.catch_all.name
  event_bus_name = aws_cloudwatch_event_bus.retail.name
  target_id      = "CatchAll-RetailDemoStore-Events"
  arn            = aws_cloudwatch_log_group.events.arn
}

resource "aws_ssm_parameter" "eventbus" {
  name  = "RetailDemoStore-eventbus"
  type  = "String"
  value = aws_cloudwatch_event_bus.retail.name
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
