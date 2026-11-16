With the cluster, Cloud Map namespace, IAM roles, and internal Network Load Balancer in place, deploy the core Retail Demo Store microservices as Fargate services in private subnets.

Wire the `products` task definition and service to its NLB target group and Cloud Map service registry first, then replicate the internal load-balanced microservice pattern for `carts` and `orders`.
