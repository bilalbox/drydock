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

data "aws_iam_policy_document" "codepipeline_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codepipeline.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codepipeline" {
  name               = "retaildemostore-codepipeline-role"
  assume_role_policy = data.aws_iam_policy_document.codepipeline_trust.json
}

resource "aws_iam_role_policy" "codepipeline" {
  name = "retaildemostore-codepipeline-policy"
  role = aws_iam_role.codepipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetBucketVersioning",
          "s3:PutObject",
          "codebuild:BatchGetBuilds",
          "codebuild:StartBuild",
          "iam:PassRole",
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_codepipeline" "products" {
  name     = "retaildemostore-products-pipeline"
  role_arn = aws_iam_role.codepipeline.arn

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "S3"
      version          = "1"
      output_artifacts = ["SourceOutput"]

      configuration = {
        S3Bucket             = aws_s3_bucket.source.bucket
        S3ObjectKey          = "products-source.zip"
        PollForSourceChanges = "false"
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["SourceOutput"]
      output_artifacts = ["BuildOutput"]

      configuration = {
        ProjectName = aws_codebuild_project.products.name
      }
    }
  }
}

data "aws_iam_policy_document" "events_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "events_pipeline" {
  name               = "retaildemostore-events-pipeline-role"
  assume_role_policy = data.aws_iam_policy_document.events_trust.json
}

resource "aws_iam_role_policy" "events_pipeline" {
  name = "retaildemostore-events-pipeline-policy"
  role = aws_iam_role.events_pipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "codepipeline:StartPipelineExecution"
        Resource = aws_codepipeline.products.arn
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "source_trigger" {
  name  = "retaildemostore-products-source-trigger"
  state = "ENABLED"
  event_pattern = jsonencode({
    source      = ["aws.s3"]
    detail-type = ["Object Created"]
    detail = {
      bucket = {
        name = [aws_s3_bucket.source.bucket]
      }
      object = {
        key = ["products-source.zip"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "source_trigger" {
  rule      = aws_cloudwatch_event_rule.source_trigger.name
  target_id = "StartProductsPipeline"
  arn       = aws_codepipeline.products.arn
  role_arn  = aws_iam_role.events_pipeline.arn
}
