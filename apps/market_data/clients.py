"""
Twelve Data API Client for ForexAI Pro
Real-time forex prices, OHLCV candles, and technical indicators.
Optimized to fetch OHLCV once and calculate all technical indicators locally,
with a robust stateful simulation fallback if API keys are rate-limited or invalid.
Includes Forex market hours checks (24/5 open status).
"""
import requests
import logging
import random
import time
from datetime import datetime, timezone
from django.conf import settings
from django.core.cache import cache
from . import indicators

logger = logging.getLogger(__name__)

TWELVE_DATA_BASE = "https://api.twelvedata.com"

CURRENCY_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "EUR/GBP", "XAU/USD"]

BASE_PRICES = {
    "EUR/USD": 1.0850,
    "GBP/USD": 1.2720,
    "USD/JPY": 156.40,
    "AUD/USD": 0.6650,
    "USD/CAD": 1.3680,
    "EUR/GBP": 0.8530,
    "XAU/USD": 2330.50,
}

# ── Market Hours Helper ───────────────────────────────────────────────

def is_market_active():
    """
    Forex market is open 24/5.
    Closed from Friday 22:00 UTC to Sunday 22:00 UTC.
    """
    now = datetime.now(timezone.utc)
    day = now.weekday()  # 0: Monday, 4: Friday, 5: Saturday, 6: Sunday
    hour = now.hour
    
    if day == 4 and hour >= 22:  # Friday after 10 PM UTC
        return False
    if day == 5:  # Saturday
        return False
    if day == 6 and hour < 22:  # Sunday before 10 PM UTC
        return False
    return True


# ── Stateful Simulation Generator ─────────────────────────────────────

def generate_mock_candles(symbol, num_candles=150):
    """Generates a historical series of candles with random walk"""
    base_price = BASE_PRICES.get(symbol, 1.0)
    current_time = time.time()
    candles = []
    price = base_price
    
    # Generate backwards
    for i in range(num_candles):
        drift = random.uniform(-0.0003, 0.0003) * price
        volatility = random.uniform(0.001, 0.0025) * price
        
        close_val = price
        open_val = price - drift
        high_val = max(open_val, close_val) + random.uniform(0, volatility)
        low_val = min(open_val, close_val) - random.uniform(0, volatility)
        
        # Hourly increments
        dt_str = time.strftime("%Y-%m-%d %H:00:00", time.gmtime(current_time - (i * 3600)))
        
        candles.append({
            'datetime': dt_str,
            'open': round(open_val, 5),
            'high': round(high_val, 5),
            'low': round(low_val, 5),
            'close': round(close_val, 5),
        })
        price = open_val
        
    return candles[::-1]


def get_mock_ohlcv(symbol, outputsize=100):
    """Retrieve or generate cached mock candles, applying real-time random-walk ticks"""
    cache_key = f"sim_ohlcv_{symbol.replace('/', '_')}"
    candles = cache.get(cache_key)
    
    if not candles:
        candles = generate_mock_candles(symbol, num_candles=150)
        cache.set(cache_key, candles, timeout=86400)
        
    # Simulate real-time movement on the latest candle based on our current simulated price
    current_hour_str = time.strftime("%Y-%m-%d %H:00:00", time.gmtime())
    last_candle = candles[-1]
    
    sim_price = get_mock_price(symbol)
    
    # If the last candle matches the current hour, update it
    if last_candle['datetime'] == current_hour_str:
        last_candle['close'] = sim_price
        if sim_price > last_candle['high']:
            last_candle['high'] = sim_price
        if sim_price < last_candle['low']:
            last_candle['low'] = sim_price
    else:
        # Start a new hour candle
        prev_close = last_candle['close']
        new_open = prev_close
        new_close = sim_price
        volatility = random.uniform(0.0005, 0.001) * prev_close
        new_high = round(max(new_open, new_close) + random.uniform(0, volatility), 5)
        new_low = round(min(new_open, new_close) - random.uniform(0, volatility), 5)
        
        new_candle = {
            'datetime': current_hour_str,
            'open': new_open,
            'high': new_high,
            'low': new_low,
            'close': new_close
        }
        candles.append(new_candle)
        if len(candles) > 150:
            candles.pop(0)
            
    cache.set(cache_key, candles, timeout=86400)
    return candles[-outputsize:]


def get_mock_price(symbol):
    """Get simulated tick price with small random-walk volatility that updates on every call"""
    cache_key = f"sim_tick_{symbol.replace('/', '_')}"
    last_price = cache.get(cache_key)
    
    if not last_price:
        last_price = BASE_PRICES.get(symbol, 1.0)
        
    if 'JPY' in symbol:
        pip = 0.01
    elif 'XAU' in symbol:
        pip = 0.1
    else:
        pip = 0.0001
    
    # Market close simulation (lower volatility or flat ticks)
    if not is_market_active():
        # Market closed, very tiny random shifts representing weekend spreads
        change = random.uniform(-0.15, 0.15) * pip
    else:
        # Live market open ticks
        change = random.uniform(-1.5, 1.5) * pip
        
    new_price = round(last_price + change, 5)
    
    # Bound to +/- 1.5% of base price
    base = BASE_PRICES.get(symbol, 1.0)
    if new_price > base * 1.015:
        new_price = base * 1.015
    elif new_price < base * 0.985:
        new_price = base * 0.985
        
    cache.set(cache_key, new_price, timeout=86400)
    return new_price


# ── Twelve Data Client ────────────────────────────────────────────────

class TwelveDataClient:
    """Client for Twelve Data API, with automatic simulation fallbacks"""

    def __init__(self):
        self.api_key = settings.TWELVE_DATA_API_KEY
        self.session = requests.Session()
        if self.api_key:
            self.session.params = {'apikey': self.api_key}

    def _is_disabled(self):
        """Check if Twelve Data is temporarily disabled due to error/rate-limiting"""
        return cache.get("twelve_data_disabled") == True

    def _disable_api(self, reason="rate_limit", duration=600):
        """Disable API requests and fallback to simulation for a duration"""
        logger.warning(f"Twelve Data disabled for {duration}s due to: {reason}")
        cache.set("twelve_data_disabled", True, timeout=duration)

    def _get(self, endpoint, params=None):
        if not self.api_key or self._is_disabled():
            return None
            
        try:
            url = f"{TWELVE_DATA_BASE}/{endpoint}"
            resp = self.session.get(url, params=params or {}, timeout=10)
            
            if resp.status_code == 429:
                self._disable_api("rate_limit_429", duration=300)
                return None
                
            resp.raise_for_status()
            data = resp.json()
            
            if isinstance(data, dict) and data.get('status') == 'error':
                msg = data.get('message', '').lower()
                if 'limit' in msg or 'credits' in msg:
                    self._disable_api("rate_limit_error", duration=600)
                elif 'api key' in msg or 'invalid' in msg:
                    self._disable_api("invalid_key", duration=3600)
                logger.error(f"TwelveData error: {data.get('message')}")
                return None
                
            return data
        except Exception as e:
            logger.error(f"TwelveData request failed: {e}")
            return None

    def get_price(self, symbol):
        """Get current price for a currency pair"""
        # Lower cache timeout for real API to make price quotes live (5 seconds)
        cache_key = f"price_{symbol.replace('/', '_')}"
        cached = cache.get(cache_key)
        if cached:
            return cached
            
        # Try fetching real data if market is open
        if is_market_active():
            data = self._get("price", {"symbol": symbol})
            if data and 'price' in data:
                price = float(data['price'])
                cache.set(cache_key, price, timeout=5)
                return price
            
        # Fallback to simulation
        return get_mock_price(symbol)

    def get_all_prices(self):
        """Get current prices for all currency pairs"""
        prices = {}
        # Try batch API call first if possible
        if self.api_key and not self._is_disabled() and is_market_active():
            symbols = ",".join(CURRENCY_PAIRS)
            data = self._get("price", {"symbol": symbols})
            if data:
                if isinstance(data, dict) and 'price' in data:
                    prices[CURRENCY_PAIRS[0]] = float(data['price'])
                elif isinstance(data, dict):
                    for pair in CURRENCY_PAIRS:
                        if pair in data and isinstance(data[pair], dict):
                            prices[pair] = float(data[pair].get('price', 0))
                            cache.set(f"price_{pair.replace('/', '_')}", prices[pair], timeout=5)
                            
        # For any pairs that failed or if API was disabled/market closed, use simulated prices
        for pair in CURRENCY_PAIRS:
            if pair not in prices:
                prices[pair] = get_mock_price(pair)
                
        return prices

    def get_ohlcv(self, symbol, interval="1h", outputsize=100):
        """Get OHLCV candle data"""
        cache_key = f"ohlcv_{symbol.replace('/', '_')}_{interval}_{outputsize}"
        cached = cache.get(cache_key)
        if cached:
            return cached
            
        # Try fetching real candles if market is active
        if is_market_active():
            data = self._get("time_series", {
                "symbol": symbol,
                "interval": interval,
                "outputsize": outputsize,
            })
            if data and 'values' in data:
                candles = []
                for v in data['values']:
                    candles.append({
                        'datetime': v['datetime'],
                        'open': float(v['open']),
                        'high': float(v['high']),
                        'low': float(v['low']),
                        'close': float(v['close']),
                    })
                candles = candles[::-1]
                cache.set(cache_key, candles, timeout=60)
                return candles
            
        # Fallback to simulation
        return get_mock_ohlcv(symbol, outputsize=outputsize)

    def get_full_analysis(self, symbol):
        """Get complete technical analysis package using local calculations to conserve API limits"""
        # Fetch OHLCV history once
        candles = self.get_ohlcv(symbol, interval="1h", outputsize=100)
        if not candles:
            return {'symbol': symbol, 'price': BASE_PRICES.get(symbol, 1.0)}
            
        # Copy to avoid modifying cached list
        candles = [c.copy() for c in candles]
        closes = [c['close'] for c in candles]
        
        # Inject latest moving tick price directly on the final candle
        last_price = self.get_price(symbol)
        candles[-1]['close'] = last_price
        if last_price > candles[-1]['high']:
            candles[-1]['high'] = last_price
        if last_price < candles[-1]['low']:
            candles[-1]['low'] = last_price
        
        closes[-1] = last_price
        
        # Calculate technical indicators locally
        rsi_list = indicators.calculate_rsi(closes, period=14)
        macd, macd_sig, macd_hist = indicators.calculate_macd(closes)
        bb_upper, bb_middle, bb_lower = indicators.calculate_bollinger_bands(closes, period=20)
        
        # Calculate SMA overlays
        sma20 = indicators.calculate_sma(closes, 20)[-1]
        sma50 = indicators.calculate_sma(closes, 50)[-1]
        sma100 = indicators.calculate_sma(closes, 100)[-1]
        sma200 = indicators.calculate_sma(closes, 100)[-1]
        
        # Calculate EMA overlays
        ema20 = indicators.calculate_ema(closes, 20)[-1]
        ema50 = indicators.calculate_ema(closes, 50)[-1]
        ema100 = indicators.calculate_ema(closes, 100)[-1]
        ema200 = indicators.calculate_ema(closes, 100)[-1]
        
        # Support/Resistance swing points
        supports, resistances = indicators.calculate_support_resistance(candles)
        
        # Pivot Points based on previous candle
        pivots = indicators.calculate_pivot_points(candles[-2] if len(candles) > 1 else candles[-1])
        
        return {
            'symbol': symbol,
            'price': last_price,
            'market_active': is_market_active(),
            
            # Indicators
            'rsi': rsi_list[-1] if rsi_list else None,
            'macd': macd[-1] if macd else None,
            'macd_signal': macd_sig[-1] if macd_sig else None,
            'macd_hist': macd_hist[-1] if macd_hist else None,
            'bb_upper': bb_upper[-1] if bb_upper else None,
            'bb_middle': bb_middle[-1] if bb_middle else None,
            'bb_lower': bb_lower[-1] if bb_lower else None,
            
            # SMA & EMA Overlays
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


# Singleton client instance
_client = None

def get_client():
    global _client
    if _client is None:
        _client = TwelveDataClient()
    return _client
