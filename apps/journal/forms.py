from django import forms
from .models import JournalEntry


class JournalEntryForm(forms.ModelForm):
    class Meta:
        model = JournalEntry
        fields = ['pair', 'direction', 'outcome', 'entry_price', 'exit_price',
                  'stop_loss', 'take_profit', 'lot_size', 'invested_amount', 'leverage', 'pnl', 'notes', 'screenshot', 'trade_date']
        widgets = {
            'pair': forms.Select(attrs={'class': 'form-select'}),
            'direction': forms.Select(attrs={'class': 'form-select'}),
            'outcome': forms.Select(attrs={'class': 'form-select'}),
            'entry_price': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.00001', 'placeholder': '1.08450'}),
            'exit_price': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.00001', 'placeholder': '1.08700'}),
            'stop_loss': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.00001', 'placeholder': '1.08200'}),
            'take_profit': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.00001', 'placeholder': '1.08900'}),
            'lot_size': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.01', 'placeholder': '0.01'}),
            'invested_amount': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.01', 'placeholder': '15.00'}),
            'leverage': forms.NumberInput(attrs={'class': 'form-input', 'step': '1', 'placeholder': '100'}),
            'pnl': forms.NumberInput(attrs={'class': 'form-input', 'step': '0.01', 'placeholder': '125.50'}),
            'notes': forms.Textarea(attrs={'class': 'form-textarea', 'rows': 4, 'placeholder': 'Trade reasoning, market conditions, emotions...'}),
            'screenshot': forms.ClearableFileInput(attrs={'class': 'form-input'}),
            'trade_date': forms.DateInput(attrs={'class': 'form-input', 'type': 'date'}),
        }
