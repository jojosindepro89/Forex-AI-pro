"""
AI Signal Engine — ForexAI Pro
Generates BUY/SELL/HOLD signals from technical analysis including SMA, EMA,
Bollinger Bands, Pivot Points, and Support/Resistance levels.
"""
import logging
from django.core.cache import cache
from .clients import get_client, CURRENCY_PAIRS

logger = logging.getLogger(__name__)


def compute_signal(analysis: dict) -> dict:
    """
    AI Signal Engine using a Trend-Following Confluence Model.
    Filters out counter-trend trades and boosts score based on multiple indicator agreement.
    """
    price   = analysis.get('price') or 0
    rsi     = analysis.get('rsi')
    macd    = analysis.get('macd')
    macd_sig= analysis.get('macd_signal')
    macd_h  = analysis.get('macd_hist')
    bb_up   = analysis.get('bb_upper')
    bb_mid  = analysis.get('bb_middle')
    bb_low  = analysis.get('bb_lower')
    
    # Overlays
    sma20   = analysis.get('sma20')
    sma50   = analysis.get('sma50')
    sma100  = analysis.get('sma100')
    sma200  = analysis.get('sma200')
    ema20   = analysis.get('ema20')
    ema50   = analysis.get('ema50')
    ema100  = analysis.get('ema100')
    ema200  = analysis.get('ema200')
    
    # Levels
    supports = analysis.get('supports', [])
    resistances = analysis.get('resistances', [])
    pivots   = analysis.get('pivots', {})

    buy_score = 0
    sell_score = 0
    reasons = []
    indicators_used = []

    # 1. Establish Trend Bias (Trend is your Friend)
    trend_bias = 'NEUTRAL'
    trend_reasons = []
    if sma200 and ema50:
        is_above_sma200 = price > sma200
        is_golden_cross = ema50 > ema200 if ema200 else False
        
        if is_above_sma200 and is_golden_cross:
            trend_bias = 'BULLISH'
            trend_reasons.append("Bullish Trend Bias (Price > SMA200 and Golden Cross)")
        elif not is_above_sma200 and not is_golden_cross:
            trend_bias = 'BEARISH'
            trend_reasons.append("Bearish Trend Bias (Price < SMA200 and Death Cross)")
        else:
            trend_bias = 'NEUTRAL'
            trend_reasons.append("Neutral Trend Bias (Conflicting SMA/EMA trend lines)")
    
    # ── RSI Analysis ──────────────────────────────────────────
    if rsi is not None:
        indicators_used.append(f"RSI(14): {rsi:.1f}")
        if rsi < 30:
            buy_score += 35
            reasons.append(f"RSI oversold ({rsi:.1f})")
        elif rsi > 70:
            sell_score += 35
            reasons.append(f"RSI overbought ({rsi:.1f})")
        elif rsi < 45:
            buy_score += 10
        elif rsi > 55:
            sell_score += 10

    # ── MACD Analysis ─────────────────────────────────────────
    if macd is not None and macd_sig is not None:
        indicators_used.append(f"MACD: {macd:.5f} / Sig: {macd_sig:.5f}")
        if macd > macd_sig:
            buy_score += 25
            reasons.append("MACD Bullish crossover")
        elif macd < macd_sig:
            sell_score += 25
            reasons.append("MACD Bearish crossover")

    # ── Bollinger Bands ───────────────────────────────────────
    bb_range = 0
    position_in_bb = 0.5
    if all([price, bb_up, bb_low]):
        indicators_used.append(f"BB Upper: {bb_up:.5f} / Lower: {bb_low:.5f}")
        bb_range = bb_up - bb_low
        if bb_range > 0:
            position_in_bb = (price - bb_low) / bb_range
            if position_in_bb < 0.15:
                buy_score += 25
                reasons.append("Price near Lower Bollinger Band")
            elif position_in_bb > 0.85:
                sell_score += 25
                reasons.append("Price near Upper Bollinger Band")

    # ── SMA/EMA Overlay Analysis ──────────────────────────────
    if sma200:
        indicators_used.append(f"SMA200: {sma200:.5f}")
        if price > sma200:
            buy_score += 15
        else:
            sell_score += 15

    if ema20 and ema50:
        if ema20 > ema50:
            buy_score += 15
        else:
            sell_score += 15

    if ema50 and ema200:
        indicators_used.append(f"EMA50: {ema50:.5f} / EMA200: {ema200:.5f}")
        if ema50 > ema200:
            buy_score += 20
        else:
            sell_score += 20

    # ── Support & Resistance ──────────────────────────────────
    is_jpy = 'JPY' in analysis.get('symbol', '')
    is_xau = 'XAU' in analysis.get('symbol', '')
    pip_size = 0.01 if is_jpy else (0.1 if is_xau else 0.0001)
    
    if supports and price:
        indicators_used.append(f"Support S1: {supports[0]:.5f}")
        if price > supports[0] and (price - supports[0]) < 15 * pip_size:
            buy_score += 20
            reasons.append("Price approaching Swing Support S1")
            
    if resistances and price:
        indicators_used.append(f"Resistance R1: {resistances[0]:.5f}")
        if resistances[0] > price and (resistances[0] - price) < 15 * pip_size:
            sell_score += 20
            reasons.append("Price approaching Swing Resistance R1")

    # ── Pivot Points ──────────────────────────────────────────
    if pivots and 'classic' in pivots:
        pp = pivots['classic']['pp']
        indicators_used.append(f"PP: {pp:.5f}")
        if price > pp:
            buy_score += 10
        else:
            sell_score += 10

    # 2. Apply Trend Filter Multipliers (Trend-Following)
    if trend_bias == 'BULLISH':
        sell_score = int(sell_score * 0.6)
        buy_score += 20
        reasons.extend(trend_reasons)
    elif trend_bias == 'BEARISH':
        buy_score = int(buy_score * 0.6)
        sell_score += 20
        reasons.extend(trend_reasons)

    # 3. Multi-Indicator Confluence Boosters
    # Confluence: RSI + BBands
    if rsi is not None and bb_range > 0:
        if rsi < 35 and position_in_bb < 0.20:
            buy_score += 25
            reasons.append("Confluence: RSI Oversold + Bollinger Lower Band Rebound")
        elif rsi > 65 and position_in_bb > 0.80:
            sell_score += 25
            reasons.append("Confluence: RSI Overbought + Bollinger Upper Band Rejection")

    # Confluence: MACD + Support/Resistance
    if macd is not None and macd_sig is not None:
        is_bullish_macd = macd > macd_sig
        if is_bullish_macd and supports and price and (price - supports[0]) < 15 * pip_size:
            buy_score += 20
            reasons.append("Confluence: Support S1 Bounce + Bullish MACD Cross")
        elif not is_bullish_macd and resistances and price and (resistances[0] - price) < 15 * pip_size:
            sell_score += 20
            reasons.append("Confluence: Resistance R1 Rejection + Bearish MACD Cross")

    # Confluence: Pivot Point Alignment
    if pivots and 'classic' in pivots:
        pp = pivots['classic']['pp']
        if trend_bias == 'BULLISH' and price > pp:
            buy_score += 15
            reasons.append("Confluence: Bullish Trend + Price above Pivot Point")
        elif trend_bias == 'BEARISH' and price < pp:
            sell_score += 15
            reasons.append("Confluence: Bearish Trend + Price below Pivot Point")

    # 4. Determine Final Signal & Calibrate Confidence
    total = buy_score + sell_score
    diff = abs(buy_score - sell_score)
    
    if total == 0 or diff < 20:
        signal_type = 'HOLD'
        confidence = 50
        reasons.append("Conflicting technical signals")
    elif buy_score > sell_score:
        signal_type = 'BUY'
        conf = int(50 + (buy_score / max(total, 1)) * 45)
        # Cap confidence if trading against trend bias
        if trend_bias == 'BEARISH':
            conf = min(60, conf)
            reasons.append("Warning: Counter-trend trade against Bearish bias")
        else:
            conf = min(95, conf)
        confidence = conf
    else:
        signal_type = 'SELL'
        conf = int(50 + (sell_score / max(total, 1)) * 45)
        # Cap confidence if trading against trend bias
        if trend_bias == 'BULLISH':
            conf = min(60, conf)
            reasons.append("Warning: Counter-trend trade against Bullish bias")
        else:
            conf = min(95, conf)
        confidence = conf

    # ── Risk Management ───────────────────────────────────────
    is_jpy = 'JPY' in analysis.get('symbol', '')
    is_xau = 'XAU' in analysis.get('symbol', '')
    pip_multiplier = 0.01 if is_jpy else (0.1 if is_xau else 0.0001)
    sl_pips = 25 * pip_multiplier
    tp_pips = 50 * pip_multiplier

    if signal_type == 'BUY':
        entry = price
        stop_loss = round(price - sl_pips, 5)
        take_profit = round(price + tp_pips, 5)
    elif signal_type == 'SELL':
        entry = price
        stop_loss = round(price + sl_pips, 5)
        take_profit = round(price - tp_pips, 5)
    else:
        entry = price
        stop_loss = round(price - sl_pips, 5)
        take_profit = round(price + tp_pips, 5)

    # Filter out duplicate reasons
    unique_reasons = []
    for r in reasons:
        if r not in unique_reasons:
            unique_reasons.append(r)

    ai_explanation = (
        f"Based on analysis of {len(indicators_used)} technical indicators using our Trend-Following Confluence Model, "
        f"the model issues a {signal_type} recommendation with {confidence}% confidence. "
        f"Primary drivers: {', '.join(unique_reasons[:3])}."
    )

    return {
        'signal_type': signal_type,
        'confidence': confidence,
        'entry_price': round(entry, 5),
        'stop_loss': stop_loss,
        'take_profit': take_profit,
        'decimals': 3 if is_jpy else (2 if is_xau else 5),
        'indicators_used': indicators_used,
        'reasoning': ' | '.join(reasons) if reasons else 'Neutral market conditions',
        'ai_explanation': ai_explanation,
        
        # Indicator outputs
        'rsi': rsi,
        'macd': macd,
        'macd_signal': macd_sig,
        'bb_upper': bb_up,
        'bb_middle': bb_mid,
        'bb_lower': bb_low,
        'sma20': sma20,
        'sma50': sma50,
        'sma100': sma100,
        'sma200': sma200,
        'ema20': ema20,
        'ema50': ema50,
        'ema100': ema100,
        'ema200': ema200,
        
        # Levels
        'supports': supports,
        'resistances': resistances,
        'pivots': pivots,
    }


def generate_signal_for_pair(symbol: str) -> dict | None:
    """Fetch data and generate signal for a single pair with a 15-second cache for dashboard consistency"""
    cache_key = f"signal_cache_{symbol.replace('/', '_')}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client = get_client()
    try:
        analysis = client.get_full_analysis(symbol)
        if not analysis.get('price'):
            return None
        signal = compute_signal(analysis)
        signal['symbol'] = symbol
        signal['price'] = analysis['price']
        signal['market_active'] = analysis.get('market_active', True)
        
        # Cache for 15 seconds
        cache.set(cache_key, signal, timeout=15)
        return signal
    except Exception as e:
        logger.error(f"Signal generation failed for {symbol}: {e}")
        return None


def generate_all_signals() -> list:
    """Generate signals for all currency pairs"""
    signals = []
    for pair in CURRENCY_PAIRS:
        signal = generate_signal_for_pair(pair)
        if signal:
            signals.append(signal)
    return signals
