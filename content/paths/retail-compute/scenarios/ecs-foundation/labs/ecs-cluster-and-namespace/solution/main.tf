resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_ecs_cluster" "retail" {
  name = "retaildemostore"
}

resource "aws_service_discovery_private_dns_namespace" "retail" {
  name        = "retaildemostore.local"
  description = "Private DNS namespace for Retail Demo Store microservices"
  vpc         = aws_vpc.retail.id
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/retaildemostore"
  retention_in_days = 7
}
