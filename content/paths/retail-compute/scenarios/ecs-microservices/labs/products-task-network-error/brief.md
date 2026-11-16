Deploying the `products` Fargate service failed before the ECS service could be created.

Fix the workspace configuration so the `retaildemostore-products` Fargate task definition (`256` CPU, `512` memory) and the `products` Fargate service (`desired_count` 1) deploy cleanly in the private subnets and register with the `products` target group and Cloud Map service.
