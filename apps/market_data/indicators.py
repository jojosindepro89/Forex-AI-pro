"""
Technical Analysis Indicators Engine — ForexAI Pro
Pure-Python implementation of core forex indicators, pivot points,
support/resistance levels, and overlays. Calculates values directly from OHLCV data.
"""
import math

def calculate_sma(closes: list[float], period: int) -> list[float | None]:
    """Calculate Simple Moving Average (SMA)"""
    if len(closes) < period:
        return [None] * len(closes)
    
    smas = []
    for i in range(len(closes)):
        if i < period - 1:
            smas.append(None)
        else:
            smas.append(sum(closes[i - period + 1 : i + 1]) / period)
    return smas

def calculate_ema(closes: list[float], period: int) -> list[float | None]:
    """Calculate Exponential Moving Average (EMA)"""
    if len(closes) < period:
        return [None] * len(closes)
    
    emas = []
    multiplier = 2 / (period + 1)
    
    # First value is simple SMA
    sma_seed = sum(closes[:period]) / period
    
    for i in range(len(closes)):
        if i < period - 1:
            emas.append(None)
        elif i == period - 1:
            emas.append(sma_seed)
        else:
            emas.append((closes[i] - emas[-1]) * multiplier + emas[-1])
    return emas

def calculate_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    """Calculate Relative Strength Index (RSI)"""
    if len(closes) <= period:
        return [None] * len(closes)
    
    rsi_vals = [None] * len(closes)
    gains = []
    losses = []
    
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(diff))
            
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    if avg_loss == 0:
        rsi_vals[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi_vals[period] = 100.0 - (100.0 / (1.0 + rs))
        
    for i in range(period + 1, len(closes)):
        gain = gains[i - 1]
        loss = losses[i - 1]
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        
        if avg_loss == 0:
            rsi_vals[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi_vals[i] = 100.0 - (100.0 / (1.0 + rs))
            
    return rsi_vals

def calculate_macd(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """
    Calculate MACD Line, Signal Line, and MACD Histogram.
    Returns: (macd_line, signal_line, histogram)
    """
    ema_fast = calculate_ema(closes, fast)
    ema_slow = calculate_ema(closes, slow)
    
    macd_line = []
    for f, s in zip(ema_fast, ema_slow):
        if f is not None and s is not None:
            macd_line.append(f - s)
        else:
            macd_line.append(None)
            
    # Find the first index that has a valid MACD value
    non_none_idx = next((i for i, x in enumerate(macd_line) if x is not None), None)
    if non_none_idx is None:
        return [None] * len(closes), [None] * len(closes), [None] * len(closes)
        
    macd_valid = macd_line[non_none_idx:]
    signal_valid = calculate_ema(macd_valid, signal)
    
    signal_line = [None] * non_none_idx + signal_valid
    
    histogram = []
    for m, s in zip(macd_line, signal_line):
        if m is not None and s is not None:
            histogram.append(m - s)
        else:
            histogram.append(None)
            
    return macd_line, signal_line, histogram

def calculate_bollinger_bands(closes: list[float], period: int = 20, num_std: int = 2) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """
    Calculate Bollinger Bands (Upper, Middle/SMA, Lower)
    Returns: (upper_band, middle_band, lower_band)
    """
    if len(closes) < period:
        return [None] * len(closes), [None] * len(closes), [None] * len(closes)
        
    sma = calculate_sma(closes, period)
    upper = []
    lower = []
    
    for i in range(len(closes)):
        if sma[i] is None:
            upper.append(None)
            lower.append(None)
        else:
            window = closes[i - period + 1 : i + 1]
            mean = sma[i]
            variance = sum((x - mean) ** 2 for x in window) / period
            std_dev = math.sqrt(variance)
            upper.append(mean + num_std * std_dev)
            lower.append(mean - num_std * std_dev)
            
    return upper, sma, lower

def calculate_support_resistance(candles: list[dict], window: int = 5) -> tuple[list[float], list[float]]:
    """
    Detect support and resistance levels using local swing highs/lows.
    Returns: (supports, resistances) sorted relative to current close price.
    """
    if len(candles) < window * 2 + 1:
        # Fallbacks based on current close
        current = candles[-1]['close'] if candles else 1.0
        return [current * 0.99, current * 0.98], [current * 1.01, current * 1.02]
        
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    
    supports = []
    resistances = []
    
    for i in range(window, len(candles) - window):
        # Swing High
        if highs[i] == max(highs[i - window : i + window + 1]):
            resistances.append(highs[i])
        # Swing Low
        if lows[i] == min(lows[i - window : i + window + 1]):
            supports.append(lows[i])
            
    current_price = candles[-1]['close']
    
    # Filter & deduplicate
    res_filtered = sorted(list(set(round(r, 5) for r in resistances if r > current_price)))
    sup_filtered = sorted(list(set(round(s, 5) for s in supports if s < current_price)), reverse=True)
    
    # Ensure we have at least 2 levels by creating default offsets if empty
    symbol = candles[0].get('symbol', '')
    if 'JPY' in symbol:
        pip_size = 0.01
    elif 'XAU' in symbol:
        pip_size = 0.1
    else:
        pip_size = 0.0001
    
    if not res_filtered:
        res_filtered = [round(current_price + (50 * i * pip_size), 5) for i in range(1, 3)]
    if not sup_filtered:
        sup_filtered = [round(current_price - (50 * i * pip_size), 5) for i in range(1, 3)]
        
    return sup_filtered[:3], res_filtered[:3]

def calculate_pivot_points(last_candle: dict) -> dict:
    """
    Calculate Pivot Points (Classic & Fibonacci) from a single completed candle.
    Expects dictionary with keys: 'high', 'low', 'close'
    """
    high = last_candle['high']
    low = last_candle['low']
    close = last_candle['close']
    
    # Classic Pivot Points
    pp_classic = (high + low + close) / 3
    r1_classic = (2 * pp_classic) - low
    s1_classic = (2 * pp_classic) - high
    r2_classic = pp_classic + (high - low)
    s2_classic = pp_classic - (high - low)
    r3_classic = high + 2 * (pp_classic - low)
    s3_classic = low - 2 * (high - pp_classic)
    
    # Fibonacci Pivot Points
    pp_fib = pp_classic
    r1_fib = pp_fib + 0.382 * (high - low)
    s1_fib = pp_fib - 0.382 * (high - low)
    r2_fib = pp_fib + 0.618 * (high - low)
    s2_fib = pp_fib - 0.618 * (high - low)
    r3_fib = pp_fib + 1.000 * (high - low)
    s3_fib = pp_fib - 1.000 * (high - low)
    
    return {
        'classic': {
            'pp': round(pp_classic, 5),
            'r1': round(r1_classic, 5),
            's1': round(s1_classic, 5),
            'r2': round(r2_classic, 5),
            's2': round(s2_classic, 5),
            'r3': round(r3_classic, 5),
            's3': round(s3_classic, 5),
        },
        'fibonacci': {
            'pp': round(pp_fib, 5),
            'r1': round(r1_fib, 5),
            's1': round(s1_fib, 5),
            'r2': round(r2_fib, 5),
            's2': round(s2_fib, 5),
            'r3': round(r3_fib, 5),
            's3': round(s3_fib, 5),
        }
    }
