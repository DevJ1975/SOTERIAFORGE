from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import record
from apps.learning.access import Conflict, acting_tenant
from apps.learning.models import Lesson
from apps.learning.views import AuthorWrites

from .models import Game
from .serializers import GameSerializer


class GameListView(AuthorWrites, APIView):
    @extend_schema(responses=GameSerializer(many=True))
    def get(self, request):
        games = Game.objects.filter(tenant=acting_tenant(request))
        return Response(GameSerializer(games, many=True).data)

    @extend_schema(request=GameSerializer, responses={201: GameSerializer})
    def post(self, request):
        body = GameSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            game = body.save(tenant=acting_tenant(request), created_by=request.user)
            record(
                action="games.game.created", actor=request.user, tenant=request.tenant, target=game
            )
        return Response(GameSerializer(game).data, status=201)


class GameDetailView(AuthorWrites, APIView):
    def game(self, request, game_id) -> Game:
        return get_object_or_404(Game, tenant=acting_tenant(request), pk=game_id)

    @extend_schema(responses=GameSerializer)
    def get(self, request, game_id):
        return Response(GameSerializer(self.game(request, game_id)).data)

    @extend_schema(request=GameSerializer, responses=GameSerializer)
    def patch(self, request, game_id):
        body = GameSerializer(self.game(request, game_id), data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        return Response(GameSerializer(body.save()).data)

    @extend_schema(responses={204: None})
    def delete(self, request, game_id):
        game = self.game(request, game_id)
        if Lesson.objects.filter(
            tenant=game.tenant, content_type="game", asset_ref=str(game.pk)
        ).exists():
            raise Conflict("A lesson uses this game. Point the lesson elsewhere first.")
        try:
            with transaction.atomic():
                record(
                    action="games.game.deleted",
                    actor=request.user,
                    tenant=request.tenant,
                    target=game,
                )
                game.delete()
        except ProtectedError as exc:
            raise Conflict("This game is still in use.") from exc
        return Response(status=204)
