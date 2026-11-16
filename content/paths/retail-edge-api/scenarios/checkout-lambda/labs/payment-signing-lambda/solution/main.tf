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

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "payment_lambda" {
  name               = "retaildemostore-payment-signing-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy" "payment_lambda" {
  name = "retaildemostore-payment-signing-policy"
  role = aws_iam_role.payment_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.payment_signing.arn
      }
    ]
  })
}

resource "aws_lambda_function" "payment_signing" {
  function_name = "retaildemostore-payment-signing"
  role          = aws_iam_role.payment_lambda.arn
  runtime       = "python3.12"
  handler       = "lambda_function.lambda_handler"
  filename      = "${path.module}/function.zip"

  environment {
    variables = {
      SECRET_ARN = aws_secretsmanager_secret.payment_signing.arn
    }
  }
}
