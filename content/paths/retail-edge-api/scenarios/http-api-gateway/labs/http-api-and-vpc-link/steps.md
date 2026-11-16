The VPC and two private subnets are already defined in `main.tf`.

1. Declare an `aws_security_group` named `vpclink` with `name = "retaildemostore-vpclink-sg"`, `vpc_id = aws_vpc.retail.id`, allowing TCP port `80` from `10.0.0.0/16`.
2. Declare an `aws_apigatewayv2_vpc_link` named `retail` with `name = "retaildemostore-vpclink"`, `security_group_ids = [aws_security_group.vpclink.id]`, and `subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]`.
3. Declare an `aws_apigatewayv2_api` named `retail` with `name = "retaildemostore-http-api"` and `protocol_type = "HTTP"`.
4. Declare an `aws_cloudwatch_log_group` named `apigw` with `name = "/aws/apigateway/retaildemostore"` and `retention_in_days = 7`.
5. Declare an `aws_apigatewayv2_stage` named `default` with `api_id = aws_apigatewayv2_api.retail.id`, `name = "$default"`, `auto_deploy = true`, and `access_log_settings` pointing `destination_arn` to `aws_cloudwatch_log_group.apigw.arn` with a JSON `format`.
6. Run `terraform apply` in the Terminal, then press Check.
