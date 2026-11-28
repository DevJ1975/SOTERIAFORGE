resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

# --- IAM ---------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself to pull the image, write logs and inject secrets.
resource "aws_iam_role" "execution" {
  name_prefix        = "${local.name}-exec-"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_partition" "current" {}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = concat(
      [
        aws_secretsmanager_secret.django_secret_key.arn,
        aws_secretsmanager_secret.db_app_password.arn,
        local.db_owner_secret_arn,
      ],
      local.extra_secret_arns,
    )
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# What the Django process itself may do: read and write the files bucket.
resource "aws_iam_role" "task" {
  name_prefix        = "${local.name}-task-"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task_files" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.files.arn]
  }
}

resource "aws_iam_role_policy" "task_files" {
  name   = "files-bucket"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_files.json
}

# --- Task definitions --------------------------------------------------------
locals {
  image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"

  base_env = merge(
    {
      PORT                 = tostring(local.port)
      DJANGO_DEBUG         = "false"
      DJANGO_ALLOWED_HOSTS = var.api_domain
      FORGE_ROOT_DOMAIN    = var.root_domain
      FORGE_PUBLIC_URL     = "https://${var.api_domain}"
      FORGE_ENVIRONMENT    = var.environment
      DB_HOST              = aws_db_instance.main.address
      DB_PORT              = tostring(aws_db_instance.main.port)
      DB_NAME              = aws_db_instance.main.db_name
      DB_APP_USER          = "forge_app"
      STANDARDS_S3_BUCKET  = aws_s3_bucket.files.bucket
      STANDARDS_S3_REGION  = var.region
      # Above the load balancer's 60s idle timeout, so it never reuses a closed connection.
      WEB_KEEP_ALIVE = "75"
    },
    local.content_enabled ? { STANDARDS_CONTENT_ORIGIN = "https://${var.content_domain}" } : {},
    var.extra_env,
  )

  base_secrets = merge(
    {
      DJANGO_SECRET_KEY = aws_secretsmanager_secret.django_secret_key.arn
      DB_APP_PASSWORD   = aws_secretsmanager_secret.db_app_password.arn
    },
    var.extra_secrets,
  )

  container_defaults = {
    image     = local.image
    essential = true
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"  = aws_cloudwatch_log_group.api.name
        "awslogs-region" = var.region
      }
    }
  }

  runtime_platform = {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([merge(local.container_defaults, {
    name         = "api"
    portMappings = [{ containerPort = local.port, protocol = "tcp" }]
    environment  = [for k, v in local.base_env : { name = k, value = v }]
    secrets      = [for k, v in local.base_secrets : { name = k, valueFrom = v }]
    logConfiguration = merge(local.container_defaults.logConfiguration, {
      options = merge(local.container_defaults.logConfiguration.options, { "awslogs-stream-prefix" = "api" })
    })
  })])
}

# One-off task: migrate as the database owner, then refresh the forge_app role.
# It is the only task that receives the owner's credentials. deploy.sh runs it.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([merge(local.container_defaults, {
    name        = "migrate"
    command     = ["sh", "-c", "python manage.py migrate --noinput && python manage.py ensure_app_role"]
    environment = [for k, v in merge(local.base_env, { DB_USE_OWNER = "1" }) : { name = k, value = v }]
    secrets = [for k, v in merge(local.base_secrets, {
      DB_USER     = "${local.db_owner_secret_arn}:username::"
      DB_PASSWORD = "${local.db_owner_secret_arn}:password::"
    }) : { name = k, valueFrom = v }]
    logConfiguration = merge(local.container_defaults.logConfiguration, {
      options = merge(local.container_defaults.logConfiguration.options, { "awslogs-stream-prefix" = "migrate" })
    })
  })])
}

# Isolated SCORM content origin: same image, content-only routes (settings_content.py).
resource "aws_ecs_task_definition" "content" {
  count                    = local.content_enabled ? 1 : 0
  family                   = "${local.name}-content"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([merge(local.container_defaults, {
    name         = "content"
    portMappings = [{ containerPort = local.port, protocol = "tcp" }]
    environment = [for k, v in merge(local.base_env, {
      DJANGO_SETTINGS_MODULE = "forge.settings_content"
      DJANGO_ALLOWED_HOSTS   = var.content_domain
      WEB_CONCURRENCY        = "1"
    }) : { name = k, value = v }]
    # Only what content playback needs: no LRS, LiveKit or other optional secrets.
    secrets = [
      { name = "DJANGO_SECRET_KEY", valueFrom = aws_secretsmanager_secret.django_secret_key.arn },
      { name = "DB_APP_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn },
    ]
    logConfiguration = merge(local.container_defaults.logConfiguration, {
      options = merge(local.container_defaults.logConfiguration.options, { "awslogs-stream-prefix" = "content" })
    })
  })])
}

# --- Services ----------------------------------------------------------------
resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = local.task_subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = !var.nat_gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = local.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # deploy.sh rolls new task definitions out after the migration task succeeds.
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener_rule.api]
}

resource "aws_ecs_service" "content" {
  count                             = local.content_enabled ? 1 : 0
  name                              = "content"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.content[0].arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = local.task_subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = !var.nat_gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.content[0].arn
    container_name   = "content"
    container_port   = local.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener_rule.content]
}
