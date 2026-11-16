The `retaildemostore/payment-signing-key` secret is already defined in `main.tf`, and the deployment package `function.zip` is already in the workspace.

1. Declare an `aws_iam_role` named `payment_lambda` with `name = "retaildemostore-payment-signing-role"` assumable by `lambda.amazonaws.com`.
2. Attach an `aws_iam_role_policy` granting `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on `*`, and `secretsmanager:GetSecretValue` on `aws_secretsmanager_secret.payment_signing.arn`.
3. Declare an `aws_lambda_function` named `payment_signing` with `function_name = "retaildemostore-payment-signing"`, `role = aws_iam_role.payment_lambda.arn`, `runtime = "python3.12"`, `handler = "lambda_function.lambda_handler"`, `filename = "${path.module}/function.zip"`, and an `environment` variable `SECRET_ARN = aws_secretsmanager_secret.payment_signing.arn`.
4. Run `terraform apply` in the Terminal, then press Check.
