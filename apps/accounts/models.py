from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    PLAN_FREE = 'free'
    PLAN_PRO = 'pro'
    PLAN_ENTERPRISE = 'enterprise'
    PLAN_CHOICES = [
        (PLAN_FREE, 'Free'),
        (PLAN_PRO, 'Pro'),
        (PLAN_ENTERPRISE, 'Enterprise'),
    ]

    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    timezone = models.CharField(max_length=50, default='UTC')
    bio = models.TextField(blank=True)
    is_signal_provider = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User'

    def __str__(self):
        return self.username

    @property
    def plan_badge(self):
        return self.plan.upper()

    @property
    def is_pro(self):
        return self.plan in [self.PLAN_PRO, self.PLAN_ENTERPRISE]
