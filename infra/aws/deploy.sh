#!/usr/bin/env bash
# Build the backend image, push it to ECR, apply Terraform, run migrations, then
# roll the services. Needs: terraform, aws (signed in), docker.
#
#   infra/aws/deploy.sh            # tag = current commit
#   infra/aws/deploy.sh v1.4.0     # explicit tag
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:-$(git rev-parse --short=12 HEAD)}"
if [ $# -eq 0 ] && [ -n "$(git status --porcelain -- ../../backend)" ]; then
  tag="$tag-dirty-$(date +%s)" # uncommitted backend changes; ECR tags are immutable
fi

# First run only: the repository must exist before an image can be pushed.
terraform apply -target=aws_ecr_repository.api

repo="$(terraform output -raw ecr_repository_url)"
region="$(terraform output -raw region)"
platform="linux/amd64"
if grep -Eqs 'cpu_architecture *= *"ARM64"' terraform.tfvars; then platform="linux/arm64"; fi

aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "${repo%%/*}"
docker build --platform "$platform" -t "$repo:$tag" ../../backend
docker push "$repo:$tag"

# Remembered so a later plain `terraform apply` keeps this image.
printf '{ "image_tag": "%s" }\n' "$tag" >image.auto.tfvars.json
terraform apply # registers the new task definitions; services are rolled below

cluster="$(terraform output -raw cluster)"
echo "Running migrations..."
task="$(aws ecs run-task --region "$region" --cluster "$cluster" --launch-type FARGATE \
  --task-definition "$(terraform output -raw migrate_task_family)" \
  --network-configuration "$(terraform output -raw task_network)" \
  --query 'tasks[0].taskArn' --output text)"
aws ecs wait tasks-stopped --region "$region" --cluster "$cluster" --tasks "$task"
code="$(aws ecs describe-tasks --region "$region" --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
if [ "$code" != "0" ]; then
  echo "Migration task failed (exit $code); services were not updated." >&2
  echo "Logs: aws logs tail $(terraform output -raw log_group) --log-stream-name-prefix migrate --region $region" >&2
  exit 1
fi

for pair in $(terraform output -raw services); do
  service="${pair%%=*}"
  aws ecs update-service --region "$region" --cluster "$cluster" --service "$service" \
    --task-definition "${pair#*=}" --query 'service.serviceName' --output text
done
for pair in $(terraform output -raw services); do
  aws ecs wait services-stable --region "$region" --cluster "$cluster" --services "${pair%%=*}"
done
echo "Deployed $tag to $(terraform output -raw api_url)"
