The Retail Demo Store runs its storefront edge, container services, and search index inside an isolated virtual network in `us-east-1`.

They need a VPC with CIDR `10.0.0.0/16`, DNS resolution and DNS hostnames enabled, and the `Name` tag `retaildemostore-vpc`. Internet-facing load balancers and NAT gateways also need an Internet Gateway tagged `retaildemostore-igw` attached to that VPC.

The provider file in the workspace already targets the local emulator. Write the network resources in `main.tf` and leave `provider.tf` alone.
