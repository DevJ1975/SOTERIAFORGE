# Soteria Forge API on AWS: ECS Fargate behind an ALB, RDS Postgres, private S3.
# Runs alongside the Railway environments (.railway/railway.ts); see README.md.
terraform {
  # 1.11+ for ephemeral values and write-only arguments (secrets stay out of state).
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # State is local until you add a backend. Before more than one person applies,
  # create a private, versioned bucket and uncomment:
  # backend "s3" {
  #   bucket       = "<state-bucket>"
  #   key          = "forge/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "soteria-forge"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "forge-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)

  content_enabled = var.content_domain != ""
  domains         = compact([var.api_domain, var.content_domain])
  port            = 8000
}
