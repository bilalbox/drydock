The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare an `aws_cloudwatch_event_bus` named `retail` with `name = "retaildemostore-bus"`.
2. Declare an `aws_cloudwatch_event_archive` named `retail` with `name = "retaildemostore-arch"`, `event_source_arn = aws_cloudwatch_event_bus.retail.arn`, and `retention_days = 120`.
3. Declare an `aws_cloudwatch_log_group` named `events` with `name = "/aws/events/retaildemostore"` and `retention_in_days = 120`.
4. Declare an `aws_cloudwatch_event_rule` named `catch_all` with `name = "CatchAllRetailDemoStoreEventsToCloudWatchLogs"`, `event_bus_name = aws_cloudwatch_event_bus.retail.name`, `state = "DISABLED"`, and `event_pattern = jsonencode({ source = [{ prefix = "" }] })`, plus an `aws_cloudwatch_event_target` sending matches to `aws_cloudwatch_log_group.events.arn`.
5. Declare an `aws_ssm_parameter` named `eventbus` with `name = "RetailDemoStore-eventbus"`, `type = "String"`, and `value = aws_cloudwatch_event_bus.retail.name`.
6. Run `terraform apply` in the Terminal, then press Check.
