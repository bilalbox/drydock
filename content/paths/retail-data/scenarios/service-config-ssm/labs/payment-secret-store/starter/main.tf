resource "aws_ssm_parameter" "stack_bucket" {
  name  = "/retaildemostore/stack_bucket"
  type  = "String"
  value = "retaildemostore-stack"
}

resource "aws_ssm_parameter" "eventbus" {
  name  = "/retaildemostore/eventbus"
  type  = "String"
  value = "retaildemostore-bus"
}

resource "aws_ssm_parameter" "opensearch_endpoint" {
  name  = "/retaildemostore/opensearch/endpoint"
  type  = "String"
  value = "https://search.retaildemostore.local"
}
