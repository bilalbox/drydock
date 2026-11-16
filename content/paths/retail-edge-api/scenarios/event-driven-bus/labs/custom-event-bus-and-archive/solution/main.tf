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
