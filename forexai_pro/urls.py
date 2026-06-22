"""ForexAI Pro URL Configuration"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('', include('apps.core.urls')),
    path('accounts/', include('apps.accounts.urls')),
    path('dashboard/', include('apps.signals.urls')),
    path('analytics/', include('apps.analytics.urls')),
    path('backtesting/', include('apps.backtesting.urls')),
    path('journal/', include('apps.journal.urls')),
    path('admin-panel/', include('apps.admin_panel.urls')),
    path('api/', include('apps.market_data.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
