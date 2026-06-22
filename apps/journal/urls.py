from django.urls import path
from . import views
app_name = 'journal'
urlpatterns = [
    path('', views.journal_list_view, name='list'),
    path('new/', views.journal_create_view, name='create'),
    path('<int:pk>/', views.journal_detail_view, name='detail'),
    path('<int:pk>/edit/', views.journal_edit_view, name='edit'),
    path('<int:pk>/delete/', views.journal_delete_view, name='delete'),
    path('api/active-advice/', views.active_trades_advice_api, name='active_advice'),
    path('api/close/<int:pk>/', views.close_trade_api, name='close_trade'),
    path('api/open/', views.open_trade_api, name='open_trade'),
]
