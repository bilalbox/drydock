resource "aws_ssm_parameter" "stack_bucket" {
  name  = "/retaildemostore/stack_bucket"
  type  = "String"
  value = "retaildemostore-stack"
}

resource "aws_ssm_parameter" "eventbus" {
  name  = "/retaildemostore/eventbus"
  type  = "String"
  value = "retaildemostore-bus"
}

resource "aws_ssm_parameter" "opensearch_endpoint" {
  name  = "/retaildemostore/opensearch/endpoint"
  type  = "String"
  value = "https://search.retaildemostore.local"
}

resource "aws_secretsmanager_secret" "payment_signing" {
  name                    = "retaildemostore/payment-signing-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "payment_signing" {
  secret_id = aws_secretsmanager_secret.payment_signing.id
  secret_string = jsonencode({
    key_id    = "demo-key-1"
    algorithm = "RS256"
  })
}

resource "aws_iam_policy" "read_payment_secret" {
  name = "retaildemostore-read-payment-secret"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.payment_signing.arn
      }
    ]
  })
}
