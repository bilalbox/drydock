The VPC, `retaildemostore.local` Cloud Map namespace, and `retaildemostore-products-nlb` internal Network Load Balancer are already defined.

Keep those resources intact and advertise the `products` service for internal discovery:

- Create a Cloud Map service named `products` inside the `retaildemostore.local` namespace with a `MULTIVALUE` DNS configuration (`A` record, TTL `10` seconds).
- Publish an SSM Parameter named `/retaildemostore/services_load_balancers/products` (`String`) whose value is `http://<nlb-dns-name>` using the load balancer’s DNS name.
