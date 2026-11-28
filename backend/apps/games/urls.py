from django.urls import path

from .views import GameDetailView, GameListView

urlpatterns = [
    path("games", GameListView.as_view(), name="games"),
    path("games/<uuid:game_id>", GameDetailView.as_view(), name="game"),
]
