variable "region" {
  description = "AWS region for every resource."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name; prefixes resource names and is Sentry's environment."
  type        = string
  default     = "production"
}

variable "root_domain" {
  description = "Platform apex; tenant apps are its subdomains (FORGE_ROOT_DOMAIN)."
  type        = string
  default     = "soteriaforge.com"
}

variable "api_domain" {
  description = "Public hostname of this API, e.g. api.aws.soteriaforge.com."
  type        = string
}

variable "content_domain" {
  description = "Hostname of the isolated SCORM content service. Empty = not deployed."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone that holds the domains above. When set, Terraform issues the certificate and creates the DNS records. Empty = DNS is managed elsewhere; pass certificate_arn."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "Issued ACM certificate (same region) covering api_domain and content_domain. Required when route53_zone_id is empty."
  type        = string
  default     = ""

  validation {
    condition     = var.route53_zone_id != "" || var.certificate_arn != ""
    error_message = "Set route53_zone_id, or certificate_arn for a certificate you validated yourself."
  }
}

variable "image_tag" {
  description = "Backend image tag in ECR. deploy.sh writes it to image.auto.tfvars.json."
  type        = string
  default     = "bootstrap"
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64; must match the platform the image was built for."
  type        = string
  default     = "X86_64"
}

variable "api_cpu" {
  description = "Fargate CPU units per API task (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory per API task, in MiB."
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "API tasks to run; two or more spreads them across both zones."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.small"
}

variable "db_multi_az" {
  description = "Keep a standby database in a second zone (about doubles the RDS cost)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Days of automated RDS backups. Free-plan AWS accounts cap this; use 1 there."
  type        = number
  default     = 14
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GB; 0 turns autoscaling off."
  type        = number
  default     = 100
}

variable "nat_gateway" {
  description = "Run tasks in private subnets behind a NAT gateway (about $33 a month). false = tasks get a public address in the public subnets, still reachable only from the load balancer."
  type        = bool
  default     = true
}

variable "container_insights" {
  description = "ECS Container Insights metrics (billed per metric)."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Days to keep task logs in CloudWatch."
  type        = number
  default     = 30
}

variable "vpc_cidr" {
  description = "Address range of the VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "extra_env" {
  description = "More plain environment variables for the API (see backend/.env.example), e.g. AUTH_COOKIE_SAMESITE, LIVEKIT_URL, EMAIL_HOST, STANDARDS_APP_ORIGINS."
  type        = map(string)
  default     = {}
}

variable "extra_secrets" {
  description = "Secret environment variables for the API: name => Secrets Manager ARN you created (optionally ARN:json-key::). E.g. SENTRY_DSN, LIVEKIT_API_SECRET, EMAIL_HOST_PASSWORD, BADGE_SIGNING_KEY."
  type        = map(string)
  default     = {}
}

variable "budget_email" {
  description = "Address for monthly spend alerts. Empty = no budget."
  type        = string
  default     = ""
}

variable "budget_monthly_usd" {
  description = "Monthly spend, before credits, that the budget alerts against."
  type        = number
  default     = 150
}
