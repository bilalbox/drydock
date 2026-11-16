The `retaildemostore-vpc` VPC is already defined in `main.tf`.

1. Declare an `aws_security_group` named `opensearch` with `name = "retaildemostore-opensearch-sg"`, `vpc_id = aws_vpc.retail.id`, allowing `tcp` port `443` from `10.0.0.0/16`.
2. Declare an `aws_kms_key` named `search` with `description = "KMS key for Retail Demo Store search encryption"` and `enable_key_rotation = true`.
3. Declare an `aws_kms_alias` named `search` with `name = "alias/retaildemostore-search"` and `target_key_id = aws_kms_key.search.key_id`.
4. Run `terraform apply` in the Terminal, then press Check.
