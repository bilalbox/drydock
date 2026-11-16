resource "aws_ecr_repository" "products" {
  name         = "retaildemostore/products"
  force_delete = true
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "retaildemostore-pipeline-artifacts"
  force_destroy = true
}

resource "aws_s3_bucket" "source" {
  bucket        = "retaildemostore-pipeline-source"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "source" {
  bucket = aws_s3_bucket.source.id
  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "codebuild_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "retaildemostore-codebuild-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_trust.json
}

resource "aws_codebuild_project" "products" {
  name         = "retaildemostore-products-build"
  service_role = aws_iam_role.codebuild.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "src/products/buildspec.yml"
  }
}
