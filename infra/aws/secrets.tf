# Generated once and written straight to Secrets Manager: ephemeral values and
# write-only arguments never enter the Terraform state. To rotate one, bump its
# secret_string_wo_version and redeploy (rotating DB_APP_PASSWORD also needs the
# migration task, which resets the forge_app role's password).
ephemeral "random_password" "django_secret_key" {
  length  = 64
  special = false
}

ephemeral "random_password" "db_app_password" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "django_secret_key" {
  name_prefix = "${local.name}/django-secret-key-"
}

resource "aws_secretsmanager_secret_version" "django_secret_key" {
  secret_id                = aws_secretsmanager_secret.django_secret_key.id
  secret_string_wo         = ephemeral.random_password.django_secret_key.result
  secret_string_wo_version = 1
}

resource "aws_secretsmanager_secret" "db_app_password" {
  name_prefix = "${local.name}/db-app-password-"
}

resource "aws_secretsmanager_secret_version" "db_app_password" {
  secret_id                = aws_secretsmanager_secret.db_app_password.id
  secret_string_wo         = ephemeral.random_password.db_app_password.result
  secret_string_wo_version = 1
}

locals {
  db_owner_secret_arn = aws_db_instance.main.master_user_secret[0].secret_arn

  # extra_secrets values may end in ":json-key::"; IAM needs the bare secret ARN.
  extra_secret_arns = [for v in values(var.extra_secrets) : join(":", slice(split(":", v), 0, 7))]
}
