# Soteria Forge API on AWS

A separate AWS environment that runs alongside Railway (`.railway/railway.ts`).
Same backend image, same code path; only the environment variables differ.

| Piece        | AWS service                                                           |
| ------------ | --------------------------------------------------------------------- |
| API          | ECS Fargate service `api` behind an Application Load Balancer         |
| SCORM origin | ECS service `content` (only when `content_domain` is set)             |
| Migrations   | One-off ECS task `migrate`, run by `deploy.sh` before each rollout    |
| Database     | RDS Postgres 17 + pgvector, private, encrypted, 14 days of backups    |
| Files        | Private S3 bucket; the task's IAM role signs requests (no keys)       |
| Secrets      | Secrets Manager: Django key, `forge_app` password, RDS owner password |
| Images       | ECR, immutable tags                                                   |

Tasks and the database have no public address. The API connects as the
row-level-security-bound `forge_app` role; only the migration task receives the
database owner's password, which RDS generates and rotates.

## First deploy

1. Install `terraform` (1.11+), the `aws` CLI and Docker, and sign in to the AWS
   account (`aws login`, or `aws sso login` with IAM Identity Center).
2. `cp terraform.tfvars.example terraform.tfvars` and fill it in. For HTTPS you
   need either `route53_zone_id`, or a `certificate_arn` you issued in ACM.
3. `terraform init`
4. `./deploy.sh`. It shows each Terraform plan and waits for `yes`.
5. If DNS is not in Route 53, create the CNAMEs from `terraform output dns_records`.
6. Create the first superadmin (see "One-off commands").
7. Point a frontend at it: `FORGE_API_BASE_URL=https://<api_domain>`.

Later deploys are `./deploy.sh` again.

## Free plan account

An AWS Free plan account has $100-200 of credits and closes when they run out, so
the defaults (about $110-130 a month) do not fit. Start from
`free-plan.tfvars.example` instead: about $50 a month.

- `nat_gateway = false`: no NAT gateway. Tasks run in the public subnets with a
  public address; their security group still admits only the load balancer. The
  database stays in the private subnets.
- One 0.25 vCPU ARM task, `db.t4g.micro`, one day of backups, no storage
  autoscaling, no Container Insights.
- A monthly budget (`budget_email`, `budget_monthly_usd`) that measures spend
  before credits, so it warns as the credits are used.

Sign in with `aws login`; these accounts have no IAM Identity Center. DNS for
`soteriaforge.com` is outside Route 53, so request the certificate in ACM, add its
validation CNAME at the DNS host, and set `certificate_arn` once it is issued.

## One-off commands

```sh
aws ecs run-task --cluster "$(terraform output -raw cluster)" --launch-type FARGATE \
  --task-definition "$(terraform output -raw migrate_task_family)" \
  --network-configuration "$(terraform output -raw task_network)" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":
    ["python","manage.py","grant_superadmin","--email","you@example.com"]}]}'
```

The migrate task runs as the database owner. Logs:
`aws logs tail "$(terraform output -raw log_group)" --follow`.

## Settings

Plain variables go in `extra_env`, secrets in `extra_secrets` (create each secret
in Secrets Manager yourself and pass its ARN, so its value never reaches Terraform).
`backend/.env.example` lists every variable. What Terraform sets for you:
`DJANGO_ALLOWED_HOSTS`, `FORGE_PUBLIC_URL`, `FORGE_ROOT_DOMAIN`, `FORGE_ENVIRONMENT`,
`DB_*`, `STANDARDS_S3_BUCKET`, `STANDARDS_S3_REGION`, `DJANGO_SECRET_KEY`.

## Not included yet

- The `process_scorm` and `forward_xapi` cron workers (docs/scorm-cmi5.md).
- Auto scaling, a WAF, and load balancer access logs.
- A CI deploy job; deploys run from a signed-in machine with `deploy.sh`.
- Remote Terraform state: uncomment the `backend "s3"` block in `versions.tf`
  before a second person applies.
- Redis: Railway provisions one, but the backend does not use it.
- Email: point `EMAIL_HOST` at Amazon SES SMTP (or any SMTP provider).

## Cost

Roughly $110-130 a month at the defaults in us-east-1: two 0.5 vCPU tasks (~$36),
`db.t4g.small` (~$25), the load balancer (~$20), the NAT gateway (~$33) plus
traffic, storage and logs. `api_desired_count = 1` and `db.t4g.micro` bring it
near $80.
