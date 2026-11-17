/**
 * Terraform resource type -> AWS Architecture Icon.
 *
 * `icon` is the file stem in the official AWS icon pack without size suffix,
 * e.g. "Arch_AWS-Lambda" means Arch_AWS-Lambda_48.svg. Icons are fetched by
 * scripts/fetch-aws-icons.ts and are not committed.
 *
 * Original mapping, written from the Terraform provider docs and the AWS icon
 * pack file names. No TerraVision data.
 */
export interface IconEntry {
  icon: string;
  /** Drawn as a labelled box containing other resources, not as a single icon. */
  group?: "vpc" | "subnet";
  /**
   * Not drawn as its own node. It is shown as a badge on the resource it is
   * attached to, found through the edges: "references" folds into the resource
   * this one points at, "referencedBy" into the one that points at this one.
   */
  fold?: "references" | "referencedBy";
}

const arch = (name: string, extra: Partial<IconEntry> = {}): IconEntry => ({ icon: `Arch_${name}`, ...extra });
const res = (name: string, extra: Partial<IconEntry> = {}): IconEntry => ({ icon: `Res_${name}`, ...extra });

export const AWS_ICONS: Record<string, IconEntry> = {
  // Networking
  aws_vpc: arch("Amazon-Virtual-Private-Cloud", { group: "vpc" }),
  aws_subnet: arch("Amazon-Virtual-Private-Cloud", { group: "subnet" }),
  aws_internet_gateway: res("Amazon-VPC_Internet-Gateway"),
  aws_nat_gateway: res("Amazon-VPC_NAT-Gateway"),
  aws_eip: res("Amazon-EC2_Elastic-IP-Address"),
  aws_vpc_endpoint: res("Amazon-VPC_Endpoints"),
  aws_route_table: arch("Amazon-Route-53"),
  aws_route_table_association: arch("Amazon-Route-53", { fold: "references" }),
  aws_security_group: arch("Amazon-Virtual-Private-Cloud"),
  aws_lb: arch("Elastic-Load-Balancing"),
  aws_lb_listener: arch("Elastic-Load-Balancing", { fold: "references" }),
  aws_lb_target_group: arch("Elastic-Load-Balancing"),
  aws_cloudfront_distribution: arch("Amazon-CloudFront"),
  aws_cloudfront_cache_policy: arch("Amazon-CloudFront", { fold: "referencedBy" }),
  aws_cloudfront_origin_request_policy: arch("Amazon-CloudFront", { fold: "referencedBy" }),
  aws_cloudfront_origin_access_control: arch("Amazon-CloudFront", { fold: "referencedBy" }),
  aws_service_discovery_private_dns_namespace: arch("AWS-Cloud-Map"),
  aws_service_discovery_service: arch("AWS-Cloud-Map"),

  // Storage
  aws_s3_bucket: res("Amazon-Simple-Storage-Service_Bucket"),
  aws_s3_bucket_public_access_block: arch("Amazon-Simple-Storage-Service", { fold: "references" }),
  aws_s3_bucket_versioning: arch("Amazon-Simple-Storage-Service", { fold: "references" }),
  aws_s3_bucket_server_side_encryption_configuration: arch("Amazon-Simple-Storage-Service", { fold: "references" }),
  aws_s3_bucket_lifecycle_configuration: arch("Amazon-Simple-Storage-Service", { fold: "references" }),
  aws_s3_bucket_policy: arch("Amazon-Simple-Storage-Service", { fold: "references" }),
  aws_ecr_repository: arch("Amazon-Elastic-Container-Registry"),

  // Compute and containers
  aws_lambda_function: arch("AWS-Lambda"),
  aws_lambda_event_source_mapping: arch("AWS-Lambda", { fold: "references" }),
  aws_ecs_cluster: arch("Amazon-Elastic-Container-Service"),
  aws_ecs_task_definition: res("Amazon-Elastic-Container-Service_Task"),
  aws_ecs_service: res("Amazon-Elastic-Container-Service_Service"),

  // Data and messaging
  aws_dynamodb_table: res("Amazon-DynamoDB_Table"),
  aws_sqs_queue: res("Amazon-Simple-Queue-Service_Queue"),
  aws_sqs_queue_policy: arch("Amazon-Simple-Queue-Service", { fold: "references" }),
  aws_kinesis_stream: arch("Amazon-Kinesis-Data-Streams"),
  aws_cloudwatch_event_bus: res("Amazon-EventBridge_Custom-Event-Bus"),
  aws_cloudwatch_event_rule: res("Amazon-EventBridge_Rule"),
  aws_cloudwatch_event_target: arch("Amazon-EventBridge", { fold: "references" }),
  aws_cloudwatch_event_archive: arch("Amazon-EventBridge", { fold: "references" }),
  aws_cloudwatch_log_group: res("Amazon-CloudWatch_Logs"),

  // API and identity
  aws_apigatewayv2_api: arch("Amazon-API-Gateway"),
  aws_apigatewayv2_route: arch("Amazon-API-Gateway", { fold: "references" }),
  aws_apigatewayv2_integration: arch("Amazon-API-Gateway", { fold: "references" }),
  aws_apigatewayv2_stage: arch("Amazon-API-Gateway", { fold: "references" }),
  aws_apigatewayv2_vpc_link: arch("Amazon-API-Gateway"),
  aws_cognito_user_pool: arch("Amazon-Cognito"),
  aws_cognito_user_pool_client: arch("Amazon-Cognito", { fold: "references" }),
  aws_cognito_identity_pool: arch("Amazon-Cognito"),
  aws_cognito_identity_pool_roles_attachment: arch("Amazon-Cognito", { fold: "references" }),
  aws_iam_role: res("AWS-Identity-Access-Management_Role"),
  aws_iam_policy: res("AWS-Identity-Access-Management_Permissions"),
  aws_iam_role_policy: res("AWS-Identity-Access-Management_Permissions", { fold: "references" }),

  // Security and config
  aws_kms_key: arch("AWS-Key-Management-Service"),
  aws_kms_alias: arch("AWS-Key-Management-Service", { fold: "references" }),
  aws_secretsmanager_secret: arch("AWS-Secrets-Manager"),
  aws_secretsmanager_secret_version: arch("AWS-Secrets-Manager", { fold: "references" }),
  aws_ssm_parameter: res("AWS-Systems-Manager_Parameter-Store"),

  // Delivery
  aws_codebuild_project: arch("AWS-CodeBuild"),
  aws_codepipeline: arch("AWS-CodePipeline"),
};

/** Icon shown for resource types that have no mapping. Drawn from our own SVG, not a vendor icon. */
export const FALLBACK_ICON = "generic-resource";

/** Group-box icons from the AWS "Architecture Group Icons" set. */
export const AWS_GROUP_ICONS = {
  vpc: "Virtual-private-cloud-VPC",
  subnet: "Private-subnet",
  region: "Region",
  cloud: "AWS-Cloud",
} as const;

export function awsIconFiles(): { stem: string; kind: "arch" | "res" | "group" }[] {
  const out = new Map<string, "arch" | "res" | "group">();
  for (const e of Object.values(AWS_ICONS)) out.set(e.icon, e.icon.startsWith("Res_") ? "res" : "arch");
  for (const g of Object.values(AWS_GROUP_ICONS)) out.set(g, "group");
  return [...out].map(([stem, kind]) => ({ stem, kind }));
}
