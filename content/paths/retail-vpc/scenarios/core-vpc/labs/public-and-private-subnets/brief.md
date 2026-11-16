The `retaildemostore-vpc` VPC and `retaildemostore-igw` Internet Gateway are already defined.

Split the VPC across two Availability Zones (`us-east-1a` and `us-east-1b`):

- Create two public subnets that assign public IPv4 addresses on launch:
  - `retaildemostore-public-1` (`10.0.0.0/24` in `us-east-1a`)
  - `retaildemostore-public-2` (`10.0.1.0/24` in `us-east-1b`)
- Create two private subnets with public IPv4 auto-assignment disabled:
  - `retaildemostore-private-1` (`10.0.2.0/24` in `us-east-1a`)
  - `retaildemostore-private-2` (`10.0.3.0/24` in `us-east-1b`)
- Create a route table named `retaildemostore-public-rt` with a `0.0.0.0/0` route to the Internet Gateway, and associate both public subnets with it.
