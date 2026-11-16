resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.retail.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1a"

  tags = {
    Name = "retaildemostore-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.retail.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1b"

  tags = {
    Name = "retaildemostore-private-2"
  }
}

resource "aws_security_group" "vpclink" {
  name        = "retaildemostore-vpclink-sg"
  description = "VPC Link security group"
  vpc_id      = aws_vpc.retail.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_apigatewayv2_vpc_link" "retail" {
  name               = "retaildemostore-vpclink"
  security_group_ids = [aws_security_group.vpclink.id]
  subnet_ids         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
}

resource "aws_apigatewayv2_api" "retail" {
  name          = "retaildemostore-http-api"
  protocol_type = "HTTP"
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/retaildemostore"
  retention_in_days = 7
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.retail.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      method    = "$context.httpMethod"
      routeKey  = "$context.routeKey"
      status    = "$context.status"
    })
  }
}
