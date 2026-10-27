from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Member, Role
from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record

from .leaderboard import PERIODS, crew_board, score_card
from .models import Cohort, Crew, CrewMembership, Section
from .serializers import (
    CohortSerializer,
    CohortTreeSerializer,
    CrewBoardSerializer,
    CrewMembersSerializer,
    CrewSerializer,
    ScoreCardSerializer,
    SectionSerializer,
)


def acting_tenant(request):
    if request.tenant is None:
        raise PermissionDenied("Select a tenant.")
    return request.tenant


class StaffOnly:
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF


class ScoreCardView(APIView):
    """My Progress: your XP, level, streak and crew. Private: nobody else's numbers."""

    @extend_schema(responses=ScoreCardSerializer)
    def get(self, request):
        acting_tenant(request)
        return Response(score_card(request.user))


class CrewBoardView(APIView):
    """Crews ranked for a period. Never lists or ranks individual learners."""

    @extend_schema(
        parameters=[
            OpenApiParameter("period", str, enum=list(PERIODS), required=False),
            OpenApiParameter("cohort", str, required=False, description="Staff only."),
        ],
        responses=CrewBoardSerializer,
    )
    def get(self, request):
        tenant = acting_tenant(request)
        period = request.query_params.get("period", "weekly")
        if period not in PERIODS:
            raise ValidationError({"period": [f"Choose one of: {', '.join(PERIODS)}."]})
        cohort = None
        if request.query_params.get("cohort"):
            if not request.user.can_author:
                raise PermissionDenied("Only staff can view another cohort.")
            cohort = get_object_or_404(Cohort, tenant=tenant, pk=request.query_params["cohort"])
        return Response(crew_board(request.user, period, cohort=cohort))


class CohortListView(StaffOnly, APIView):
    @extend_schema(responses=CohortSerializer(many=True))
    def get(self, request):
        cohorts = Cohort.objects.filter(tenant=acting_tenant(request))
        return Response(CohortSerializer(cohorts, many=True).data)

    @extend_schema(request=CohortSerializer, responses={201: CohortSerializer})
    def post(self, request):
        body = CohortSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        tenant = acting_tenant(request)
        with transaction.atomic():
            try:
                with transaction.atomic():
                    cohort = body.save(tenant=tenant, created_by=request.user)
            except IntegrityError:
                raise ValidationError(
                    {"name": ["A cohort with this name already exists."]}
                ) from None
            record(
                action="gamification.cohort.created",
                actor=request.user,
                tenant=tenant,
                target=cohort,
            )
        return Response(CohortSerializer(cohort).data, status=201)


class CohortDetailView(StaffOnly, APIView):
    """The cohort with its sections, crews and members: staff manage rosters here."""

    @extend_schema(responses=CohortTreeSerializer)
    def get(self, request, cohort_id):
        cohort = get_object_or_404(Cohort, tenant=acting_tenant(request), pk=cohort_id)
        memberships = CrewMembership.objects.filter(cohort=cohort).select_related("member")
        by_crew: dict = {}
        for m in memberships:
            by_crew.setdefault(m.crew_id, []).append(
                {
                    "id": str(m.member_id),
                    "displayName": m.member.display_name or m.member.email,
                    "isLead": m.is_lead,
                }
            )
        sections = [
            {
                "id": str(section.pk),
                "name": section.name,
                "crews": [
                    {"id": str(crew.pk), "name": crew.name, "members": by_crew.get(crew.pk, [])}
                    for crew in section.crews.all()
                ],
            }
            for section in cohort.sections.prefetch_related("crews")
        ]
        return Response({**CohortSerializer(cohort).data, "sections": sections})


def _create_named(request, serializer_class, event, **fields):
    body = serializer_class(data=request.data)
    body.is_valid(raise_exception=True)
    tenant = request.tenant
    with transaction.atomic():
        try:
            with transaction.atomic():
                obj = body.save(tenant=tenant, **fields)
        except IntegrityError:
            raise ValidationError({"name": ["That name is already used here."]}) from None
        record(action=event, actor=request.user, tenant=tenant, target=obj)
    return Response(serializer_class(obj).data, status=201)


class SectionCreateView(StaffOnly, APIView):
    @extend_schema(request=SectionSerializer, responses={201: SectionSerializer})
    def post(self, request, cohort_id):
        cohort = get_object_or_404(Cohort, tenant=acting_tenant(request), pk=cohort_id)
        return _create_named(
            request, SectionSerializer, "gamification.section.created", cohort=cohort
        )


class CrewCreateView(StaffOnly, APIView):
    @extend_schema(request=CrewSerializer, responses={201: CrewSerializer})
    def post(self, request, section_id):
        section = get_object_or_404(
            Section.objects.select_related("cohort"), tenant=acting_tenant(request), pk=section_id
        )
        return _create_named(
            request,
            CrewSerializer,
            "gamification.crew.created",
            section=section,
            cohort=section.cohort,
        )


class CrewMembersView(StaffOnly, APIView):
    """Replace a crew's roster. A member moves from their old crew in the same cohort."""

    @extend_schema(request=CrewMembersSerializer, responses=CrewSerializer)
    def put(self, request, crew_id):
        tenant = acting_tenant(request)
        body = CrewMembersSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        ids = body.validated_data["memberIds"]
        leads = set(body.validated_data["leadIds"])

        with transaction.atomic():
            crew = get_object_or_404(
                Crew.objects.select_for_update().select_related("cohort"), tenant=tenant, pk=crew_id
            )
            members = list(Member.objects.filter(tenant=tenant, pk__in=ids, role=Role.LEARNER))
            if len(members) != len(ids):
                raise ValidationError(
                    {"memberIds": ["Every member must be a learner in this organization."]}
                )
            # Replace this crew's roster, and pull the new members out of any other crew
            # in the cohort (one crew per member per cohort).
            CrewMembership.objects.filter(crew=crew).delete()
            CrewMembership.objects.filter(cohort=crew.cohort, member__in=members).delete()
            CrewMembership.objects.bulk_create(
                CrewMembership(
                    tenant=tenant, cohort=crew.cohort, crew=crew, member=m, is_lead=m.pk in leads
                )
                for m in members
            )
            record(
                action="gamification.crew.members.set",
                actor=request.user,
                tenant=tenant,
                target=crew,
                members=len(members),
                leads=len(leads),
                at=timezone.now().isoformat(),
            )
        return Response(CrewSerializer(crew).data)
