from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required
def analytics_dashboard(request):
    """AI model performance analytics"""
    # Simulated model performance data (replace with DB in production)
    performance_data = {
        'overall_accuracy': 72.4,
        'win_rate': 68.3,
        'total_signals': 1247,
        'profitable_signals': 852,
        'avg_confidence': 74.1,
        'model_version': 'v2.4.1',
        'strategies': [
            {'name': 'RSI Mean Reversion', 'win_rate': 71.2, 'signals': 342, 'pf': 1.84},
            {'name': 'MACD Trend Follow', 'win_rate': 68.5, 'signals': 289, 'pf': 1.62},
            {'name': 'BB Breakout',        'win_rate': 65.3, 'signals': 198, 'pf': 1.47},
            {'name': 'EMA Cross',          'win_rate': 73.8, 'signals': 418, 'pf': 1.92},
        ],
        'monthly_accuracy': [
            {'month': 'Jan', 'accuracy': 68.2},
            {'month': 'Feb', 'accuracy': 71.5},
            {'month': 'Mar', 'accuracy': 69.8},
            {'month': 'Apr', 'accuracy': 74.1},
            {'month': 'May', 'accuracy': 72.6},
            {'month': 'Jun', 'accuracy': 73.9},
        ],
    }
    return render(request, 'analytics/dashboard.html', {'data': performance_data})
