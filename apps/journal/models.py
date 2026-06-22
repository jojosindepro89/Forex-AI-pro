from django.db import models
from django.conf import settings
from apps.market_data.clients import CURRENCY_PAIRS


class JournalEntry(models.Model):
    DIRECTION_LONG = 'LONG'
    DIRECTION_SHORT = 'SHORT'
    DIRECTION_CHOICES = [(DIRECTION_LONG, 'Long'), (DIRECTION_SHORT, 'Short')]

    OUTCOME_WIN = 'WIN'
    OUTCOME_LOSS = 'LOSS'
    OUTCOME_OPEN = 'OPEN'
    OUTCOME_CHOICES = [
        (OUTCOME_WIN, 'Win'), (OUTCOME_LOSS, 'Loss'), (OUTCOME_OPEN, 'Open'),
    ]

    PAIR_CHOICES = [(p, p) for p in CURRENCY_PAIRS]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='journal_entries')
    pair = models.CharField(max_length=10, choices=PAIR_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES, default=OUTCOME_OPEN)
    entry_price = models.DecimalField(max_digits=12, decimal_places=5)
    exit_price = models.DecimalField(max_digits=12, decimal_places=5, null=True, blank=True)
    stop_loss = models.DecimalField(max_digits=12, decimal_places=5, null=True, blank=True)
    take_profit = models.DecimalField(max_digits=12, decimal_places=5, null=True, blank=True)
    lot_size = models.DecimalField(max_digits=8, decimal_places=2, default=0.01)
    invested_amount = models.DecimalField(max_digits=12, decimal_places=2, default=15.00)
    leverage = models.IntegerField(default=100)
    pnl = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    screenshot = models.ImageField(upload_to='journal_screenshots/', blank=True, null=True)
    trade_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-trade_date', '-created_at']
        verbose_name = 'Journal Entry'
        verbose_name_plural = 'Journal Entries'

    def __str__(self):
        return f"{self.pair} {self.direction} - {self.trade_date}"

    @property
    def pnl_display(self):
        if self.pnl is None:
            return 'Open'
        sign = '+' if self.pnl >= 0 else ''
        return f"{sign}{self.pnl}"

    @property
    def outcome_class(self):
        return {'WIN': 'win', 'LOSS': 'loss', 'OPEN': 'open'}.get(self.outcome, 'open')
