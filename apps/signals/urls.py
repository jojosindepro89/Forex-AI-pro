from django.urls import path
from . import views

app_name = 'signals'

urlpatterns = [
    path('', views.dashboard_view, name='dashboard'),
    path('signals/', views.signal_list_view, name='signal_list'),
    path('signals/<str:pair>/', views.signal_detail_view, name='signal_detail'),
]
