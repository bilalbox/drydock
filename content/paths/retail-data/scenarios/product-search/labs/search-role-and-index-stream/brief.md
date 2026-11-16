The `retaildemostore-opensearch-sg` security group and `alias/retaildemostore-search` KMS key are already defined.

Keep those resources intact and set up the catalog indexing pipeline and service permissions:

- Create a provisioned Kinesis Data Stream named `retaildemostore-catalog-index` with `1` shard and a `24`-hour retention period.
- Create an IAM role named `retaildemostore-search-service` assumable by ECS tasks (`ecs-tasks.amazonaws.com`), with an inline policy allowing `kms:Decrypt` and `kms:DescribeKey` on the search KMS key, `kinesis:GetRecords`, `kinesis:GetShardIterator`, and `kinesis:DescribeStream` on `retaildemostore-catalog-index`, and `es:ESHttp*` for search queries.
