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

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "retaildemostore-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy" "ecs_execution" {
  name = "retaildemostore-ecs-execution-policy"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "products_task" {
  name               = "retaildemostore-products-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy" "products_task" {
  name = "retaildemostore-products-task-policy"
  role = aws_iam_role.products_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "ssm:GetParameter",
          "ssm:GetParameters",
        ]
        Resource = "*"
      }
    ]
  })
}
