resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

# Postgres 17 with pgvector (the coach app's migration runs CREATE EXTENSION vector).
# Row-level security keeps the tenant in a session setting, so connect directly:
# do not put RDS Proxy or a transaction-mode pooler in front of this.
resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  db_name  = "forge"
  username = "forge"
  # AWS generates, stores and rotates the owner password in Secrets Manager.
  # Only the migration task reads it; the API connects as forge_app.
  manage_master_user_password = true

  allocated_storage     = 20
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period    = var.db_backup_retention_days
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
}
