The `retaildemostore-vpc` VPC is already defined in `main.tf`.

1. Declare an `aws_ecs_cluster` named `retail` with `name = "retaildemostore"`.
2. Declare an `aws_service_discovery_private_dns_namespace` named `retail` with `name = "retaildemostore.local"`, `vpc = aws_vpc.retail.id`, and a short `description`.
3. Declare an `aws_cloudwatch_log_group` named `ecs` with `name = "/ecs/retaildemostore"` and `retention_in_days = 7`.
4. Run `terraform apply` in the Terminal, then press Check.
