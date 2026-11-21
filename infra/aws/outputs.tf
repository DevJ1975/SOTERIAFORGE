output "region" {
  value = var.region
}

output "api_url" {
  value = "https://${var.api_domain}"
}

output "dns_records" {
  description = "CNAME each hostname to the load balancer when DNS is not in Route 53."
  value       = { for d in local.domains : d => aws_lb.main.dns_name }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "files_bucket" {
  value = aws_s3_bucket.files.bucket
}

output "cluster" {
  value = aws_ecs_cluster.main.name
}

output "services" {
  description = "service=task-definition-family pairs deploy.sh rolls out."
  value = join(" ", concat(
    ["api=${aws_ecs_task_definition.api.family}"],
    local.content_enabled ? ["content=${aws_ecs_task_definition.content[0].family}"] : [],
  ))
}

output "migrate_task_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "task_network" {
  description = "awsvpcConfiguration for one-off tasks (aws ecs run-task --network-configuration)."
  value       = "awsvpcConfiguration={subnets=[${join(",", local.task_subnet_ids)}],securityGroups=[${aws_security_group.tasks.id}],assignPublicIp=${var.nat_gateway ? "DISABLED" : "ENABLED"}}"
}

output "log_group" {
  value = aws_cloudwatch_log_group.api.name
}
