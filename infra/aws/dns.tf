# With a Route 53 zone, Terraform issues the certificate and points the hostnames
# at the load balancer. Otherwise pass certificate_arn and create the CNAMEs from
# the `dns_records` output wherever the domain's DNS lives.
locals {
  use_route53     = var.route53_zone_id != ""
  certificate_arn = local.use_route53 ? aws_acm_certificate_validation.main[0].certificate_arn : var.certificate_arn
}

resource "aws_acm_certificate" "main" {
  count                     = local.use_route53 ? 1 : 0
  domain_name               = var.api_domain
  subject_alternative_names = local.content_enabled ? [var.content_domain] : []
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = local.use_route53 ? {
    for o in aws_acm_certificate.main[0].domain_validation_options : o.domain_name => o
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count                   = local.use_route53 ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

resource "aws_route53_record" "alias" {
  for_each = local.use_route53 ? toset(local.domains) : toset([])

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
