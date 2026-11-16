The `retaildemostore` ECS cluster, `retaildemostore.local` namespace, and `/ecs/retaildemostore` log group are already defined.

Create two IAM roles assumable by `ecs-tasks.amazonaws.com` while preserving the existing resources:

- `retaildemostore-ecs-execution-role`: grant permissions to pull container images (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`) and ship logs (`logs:CreateLogStream`, `logs:PutLogEvents`).
- `retaildemostore-products-task-role`: grant DynamoDB read/write permissions (`dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:Scan`, `dynamodb:UpdateItem`) and SSM parameter reads (`ssm:GetParameter`, `ssm:GetParameters`).
