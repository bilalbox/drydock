The storefront Web UI calls backend microservices through a single Amazon API Gateway v2 HTTP API (`retaildemostore-http-api`).

Because the microservices listen on internal Network Load Balancers in private subnets, API Gateway connects to them over an HTTP API VPC Link (`retaildemostore-vpclink`) with access logging on its `$default` stage.
