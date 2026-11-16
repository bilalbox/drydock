Rather than polling GitHub or CodeCommit, this pipeline watches a versioned S3 source archive (`products-source.zip` in `retaildemostore-pipeline-source`), passes the artifact to `retaildemostore-products-build`, and runs automatically when EventBridge observes an upload.

Wire the 2-stage CodePipeline first, then add the EventBridge trigger rule and IAM role.
