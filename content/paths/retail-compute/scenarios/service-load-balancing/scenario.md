Each Retail Demo Store microservice sits behind an internal Network Load Balancer in the private subnets (`retaildemostore-private-1` and `retaildemostore-private-2`) so API Gateway v2 can connect to it privately through a VPC Link.

Build the internal NLB, IP target group, and TCP:80 listener for the `products` service first, then register the `products` Cloud Map service and store the load balancer URL in SSM Parameter Store.
