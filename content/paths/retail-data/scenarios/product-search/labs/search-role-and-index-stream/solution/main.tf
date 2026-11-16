resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_security_group" "opensearch" {
  name        = "retaildemostore-opensearch-sg"
  description = "Allow HTTPS from VPC to search endpoints"
  vpc_id      = aws_vpc.retail.id

  ingress {
    from_port   = 443
    to_port     = 443
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

resource "aws_kms_key" "search" {
  description         = "KMS key for Retail Demo Store search encryption"
  enable_key_rotation = true
}

resource "aws_kms_alias" "search" {
  name          = "alias/retaildemostore-search"
  target_key_id = aws_kms_key.search.key_id
}

resource "aws_kinesis_stream" "catalog_index" {
  name             = "retaildemostore-catalog-index"
  shard_count      = 1
  retention_period = 24
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

resource "aws_iam_role" "search_service" {
  name               = "retaildemostore-search-service"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy" "search_service" {
  name = "retaildemostore-search-service-policy"
  role = aws_iam_role.search_service.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = aws_kms_key.search.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
        ]
        Resource = aws_kinesis_stream.catalog_index.arn
      },
      {
        Effect   = "Allow"
        Action   = "es:ESHttp*"
        Resource = "*"
      }
    ]
  })
}
