import json
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .clients import get_client, CURRENCY_PAIRS, is_market_active
from .signals_engine import generate_signal_for_pair


@require_GET
def prices_api(request):
    """JSON endpoint: current prices for all pairs"""
    client = get_client()
    prices = {}
    for pair in CURRENCY_PAIRS:
        p = client.get_price(pair)
        if p:
            prices[pair] = p
    return JsonResponse({
        'prices': prices,
        'market_active': is_market_active()
    })


@require_GET
def signal_api(request, pair):
    """JSON endpoint: AI signal for a specific pair, including ohlcv history"""
    if len(pair) == 6:
        pair_fmt = f"{pair[:3].upper()}/{pair[3:].upper()}"
    else:
        pair_fmt = pair.upper().replace('-', '/')
    if pair_fmt not in CURRENCY_PAIRS:
        return JsonResponse({'error': 'Unknown pair'}, status=400)
    signal = generate_signal_for_pair(pair_fmt)
    if not signal:
        return JsonResponse({'error': 'Could not generate signal'}, status=503)
    
    # Fetch and embed ohlcv history for React charting fallback
    client = get_client()
    try:
        ohlcv = client.get_ohlcv(pair_fmt, interval='1h', outputsize=60)
        signal['ohlcv'] = ohlcv
    except Exception as e:
        signal['ohlcv'] = []
        
    return JsonResponse(signal)


@require_GET
def signals_all_api(request):
    """JSON endpoint: current signals for all pairs"""
    from .signals_engine import generate_all_signals
    signals = generate_all_signals()
    return JsonResponse({'signals': signals})
