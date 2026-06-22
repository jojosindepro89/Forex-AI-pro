from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from apps.market_data.clients import get_client, CURRENCY_PAIRS, is_market_active
from apps.market_data.signals_engine import generate_signal_for_pair, generate_all_signals
import random


@login_required
def dashboard_view(request):
    """Main trading dashboard with live data from Twelve Data"""
    client = get_client()

    # Get prices for all pairs
    pair_data = []
    for pair in CURRENCY_PAIRS:
        price = client.get_price(pair)
        decimals = 3 if 'JPY' in pair else (2 if 'XAU' in pair else 5)
        pair_data.append({
            'pair': pair,
            'price': price,
            'decimals': decimals,
            'change': round(random.uniform(-0.5, 0.5), 4),  # Simulated daily change
            'change_pct': round(random.uniform(-0.3, 0.3), 3),
        })

    # Generate signals for all pairs
    signals = generate_all_signals()

    # Stats
    buy_count = sum(1 for s in signals if s.get('signal_type') == 'BUY')
    sell_count = sum(1 for s in signals if s.get('signal_type') == 'SELL')
    hold_count = sum(1 for s in signals if s.get('signal_type') == 'HOLD')
    avg_confidence = (
        round(sum(s.get('confidence', 0) for s in signals) / len(signals))
        if signals else 0
    )

    context = {
        'pair_data': pair_data,
        'signals': signals,
        'buy_count': buy_count,
        'sell_count': sell_count,
        'hold_count': hold_count,
        'avg_confidence': avg_confidence,
        'total_signals': len(signals),
        'market_active': is_market_active(),
    }
    return render(request, 'signals/dashboard.html', context)


@login_required
def signal_list_view(request):
    """All active signals"""
    signals = generate_all_signals()
    return render(request, 'signals/signal_list.html', {
        'signals': signals,
        'market_active': is_market_active()
    })


@login_required
def signal_detail_view(request, pair):
    """Detailed signal view with full AI explanation"""
    if len(pair) == 6:
        pair_fmt = f"{pair[:3].upper()}/{pair[3:].upper()}"
    else:
        pair_fmt = pair.upper().replace('-', '/')
    if pair_fmt not in CURRENCY_PAIRS:
        return redirect('signals:signal_list')

    client = get_client()
    signal = generate_signal_for_pair(pair_fmt)
    ohlcv = client.get_ohlcv(pair_fmt, interval='1h', outputsize=60)

    decimals = 3 if 'JPY' in pair_fmt else (2 if 'XAU' in pair_fmt else 5)
    return render(request, 'signals/signal_detail.html', {
        'signal': signal,
        'pair': pair_fmt,
        'ohlcv': ohlcv,
        'market_active': is_market_active(),
        'decimals': decimals,
    })
