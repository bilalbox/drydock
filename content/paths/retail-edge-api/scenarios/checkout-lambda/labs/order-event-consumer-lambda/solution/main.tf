resource "aws_sqs_queue" "orders_dlq" {
  name = "retaildemostore-orders-events-dlq"
}

resource "aws_sqs_queue" "orders_events" {
  name = "retaildemostore-orders-events"
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
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

resource "aws_iam_role" "order_consumer" {
  name               = "retaildemostore-order-consumer-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy" "order_consumer" {
  name = "retaildemostore-order-consumer-policy"
  role = aws_iam_role.order_consumer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.orders_events.arn
      }
    ]
  })
}

resource "aws_lambda_function" "order_consumer" {
  function_name = "retaildemostore-order-consumer"
  role          = aws_iam_role.order_consumer.arn
  runtime       = "python3.12"
  handler       = "lambda_function.lambda_handler"
  filename      = "${path.module}/function.zip"
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders_events.arn
  function_name    = aws_lambda_function.order_consumer.arn
  batch_size       = 10
  enabled          = true
}
