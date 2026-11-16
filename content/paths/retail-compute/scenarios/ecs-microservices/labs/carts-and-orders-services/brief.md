The `retaildemostore` ECS cluster, `retaildemostore.local` namespace, `/ecs/retaildemostore` log group, and `products` microservice stack are already defined.

Keep `products` intact and deploy two more internal Fargate microservices—`carts` and `orders`—using the same pattern:

- For each service (`carts` and `orders`):
  - An internal Network Load Balancer (`retaildemostore-carts-nlb`, `retaildemostore-orders-nlb`) on the two private subnets
  - An IP target group (`retaildemostore-carts-tg`, `retaildemostore-orders-tg`, TCP port 80) and a TCP:80 forwarding listener
  - A Cloud Map service (`carts`, `orders`) in `retaildemostore.local`
  - A Fargate `awsvpc` task definition (`retaildemostore-carts`, `retaildemostore-orders`, 256 CPU / 512 memory) and an ECS service (`carts`, `orders`, desired count 1) registered with its target group and Cloud Map service
