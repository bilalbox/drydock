Every Retail Demo Store microservice runs as an AWS Fargate task inside a shared Amazon ECS cluster (`retaildemostore`) and registers itself in an internal Cloud Map private DNS namespace (`retaildemostore.local`) inside the store’s VPC.

Set up the shared ECS cluster, Cloud Map private DNS namespace, and container log group first, then define the IAM execution and task roles that Fargate containers assume.
