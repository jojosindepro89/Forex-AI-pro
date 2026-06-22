from django.urls import path
from . import views

app_name = 'market_data'

urlpatterns = [
    path('prices/', views.prices_api, name='prices'),
    path('signals/', views.signals_all_api, name='signals_all'),
    path('signal/<str:pair>/', views.signal_api, name='signal'),
]
