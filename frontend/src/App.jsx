import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, BellOff, Inbox, User, LogOut, TrendingUp, TrendingDown, 
  HelpCircle, Settings, Award, Layers, Clock, AlertTriangle, Play, CheckCircle
} from 'lucide-react';
import { createChart, LineStyle, CrosshairMode } from 'lightweight-charts';

// ── Web Audio Chime Synth ───────────────────────────
const playChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio
    const duration = 0.6;
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const startTime = now + (idx * 0.08);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
    });
  } catch (e) {
    console.warn('[ForexAI] Chime failed:', e);
  }
};

// ── Web Speech Synthesis ────────────────────────────
const speakText = (text) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.startsWith('en'));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }
  window.speechSynthesis.speak(utterance);
};

// Spell abbreviation letters for speech synthesis
const formatSymbolForSpeech = (symbol) => {
  const parts = symbol.split('/');
  if (parts.length === 2) {
    return `${parts[0].split('').join(' ')} to ${parts[1].split('').join(' ')}`;
  }
  return symbol.split('').join(' ');
};

// Map signal changes to explicit Entry/Exit alerts
const getAlertMessage = (symbol, oldSignal, currentSignal) => {
  if (oldSignal === 'HOLD' && currentSignal === 'BUY') {
    return {
      title: `${symbol} Entry Alert`,
      body: `Enter BUY position for ${symbol}`,
      speech: `Enter BUY position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  if (oldSignal === 'HOLD' && currentSignal === 'SELL') {
    return {
      title: `${symbol} Entry Alert`,
      body: `Enter SELL position for ${symbol}`,
      speech: `Enter SELL position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  if (oldSignal === 'BUY' && currentSignal === 'HOLD') {
    return {
      title: `${symbol} Exit Alert`,
      body: `Exit BUY position for ${symbol}`,
      speech: `Exit BUY position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  if (oldSignal === 'SELL' && currentSignal === 'HOLD') {
    return {
      title: `${symbol} Exit Alert`,
      body: `Exit SELL position for ${symbol}`,
      speech: `Exit SELL position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  if (oldSignal === 'BUY' && currentSignal === 'SELL') {
    return {
      title: `${symbol} Reversal Alert`,
      body: `Exit BUY and Enter SELL position for ${symbol}`,
      speech: `Exit BUY and Enter SELL position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  if (oldSignal === 'SELL' && currentSignal === 'BUY') {
    return {
      title: `${symbol} Reversal Alert`,
      body: `Exit SELL and Enter BUY position for ${symbol}`,
      speech: `Exit SELL and Enter BUY position for ${formatSymbolForSpeech(symbol)}`
    };
  }
  return null;
};

// ── Interactive Trading Chart Component ─────────────────────────────
const TradingChart = ({ ohlcv, entry, sl, tp, latestPrice }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !ohlcv || ohlcv.length === 0) return;

    // Filter and sort candle data
    const seen = new Set();
    const chartData = [];
    ohlcv.forEach(d => {
      const t = Date.parse(d.datetime.replace(' ', 'T')) / 1000;
      if (!isNaN(t) && !seen.has(t)) {
        seen.add(t);
        chartData.push({
          time: t,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close
        });
      }
    });
    chartData.sort((a, b) => a.time - b.time);

    // Initialize Chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: '#081627' },
        textColor: '#849ab8',
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#132a48', style: LineStyle.Dashed },
        horzLines: { color: '#132a48', style: LineStyle.Dashed },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#849ab8',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#849ab8',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: '#132a48',
        autoScale: true,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: '#132a48',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 12, // Bold layout spacing
        minBarSpacing: 4,
        rightOffset: 5, // Gap on right
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseButton: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseButton: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#3df270',
      downColor: '#ff3b30',
      borderVisible: false,
      wickUpColor: '#3df270',
      wickDownColor: '#ff3b30',
    });

    candlestickSeries.setData(chartData);

    // Entry, SL, TP Overlays
    if (entry) {
      candlestickSeries.createPriceLine({
        price: entry,
        color: '#8b5cf6',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Entry Target',
      });
    }
    if (tp) {
      candlestickSeries.createPriceLine({
        price: tp,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'Take Profit (TP)',
      });
    }
    if (sl) {
      candlestickSeries.createPriceLine({
        price: sl,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'Stop Loss (SL)',
      });
    }

    // Set logical range to frame latest 35 bars
    if (chartData.length > 0) {
      const count = Math.min(chartData.length, 35);
      chart.timeScale().setVisibleLogicalRange({
        from: chartData.length - count - 0.5,
        to: chartData.length - 0.5,
      });
    }

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Resize logic
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.resize(containerRef.current.clientWidth, 350);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [ohlcv, entry, sl, tp]);

  // Update latest tick live
  useEffect(() => {
    if (!seriesRef.current || !ohlcv || ohlcv.length === 0 || !latestPrice) return;
    const sorted = [...ohlcv].sort((a,b) => Date.parse(a.datetime) - Date.parse(b.datetime));
    const last = sorted[sorted.length - 1];
    const t = Date.parse(last.datetime.replace(' ', 'T')) / 1000;

    seriesRef.current.update({
      time: t,
      open: last.open,
      high: latestPrice > last.high ? latestPrice : last.high,
      low: latestPrice < last.low ? latestPrice : last.low,
      close: latestPrice
    });
  }, [latestPrice]);

  return (
    <div ref={containerRef} className="w-full h-[350px] relative overflow-hidden bg-navy-950 rounded-lg"></div>
  );
};

// ── Main Dashboard Layout ───────────────────────────────────────────
const formatPrice = (val, symbol) => {
  if (val === undefined || val === null || isNaN(parseFloat(val))) return '—';
  const decimals = symbol && symbol.includes('JPY') ? 3 : (symbol && symbol.includes('XAU') ? 2 : 5);
  return parseFloat(val).toFixed(decimals);
};

function App() {
  const [selectedPair, setSelectedPair] = useState(null);
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [signals, setSignals] = useState([]);
  const [detailedSignal, setDetailedSignal] = useState(null);
  const [voiceAlertsActive, setVoiceAlertsActive] = useState(
    localStorage.getItem('voice_alerts_active') === 'true'
  );
  const [notifLogs, setNotifLogs] = useState(
    JSON.parse(localStorage.getItem('signal_notification_logs') || '[]')
  );
  const [unreadCount, setUnreadCount] = useState(
    parseInt(localStorage.getItem('unread_notifs_count') || '0')
  );
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false);
  const [marketActive, setMarketActive] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [activeTrades, setActiveTrades] = useState([]);

  // Quick Execution States
  const [lotSize, setLotSize] = useState(0.01);
  const [leverage, setLeverage] = useState(100);
  const [investedAmount, setInvestedAmount] = useState(15.00);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTrades, setActiveTrades] = useState([]);
  const isFirstLoadRef = useRef(true);
  const prevSignalsRef = useRef({});

  // Push custom toast notification helper
  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // ── Auto-Play Reload Resilience User Interaction Unlocker ──────────
  useEffect(() => {
    const unlock = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') ctx.resume();
        }
      } catch (e) {}

      try {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
      } catch (e) {}

      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    };

    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('touchstart', unlock);

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Fetch prices loop (fallback for WebSocket)
  useEffect(() => {
    let ws = null;
    let fallbackInterval = null;

    const fetchPricesFallback = () => {
      fetch('/api/prices/')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.prices) {
            setPrices(currentPrices => {
              setPrevPrices(currentPrices);
              return data.prices;
            });
            setMarketActive(data.market_active ?? true);
          }
        })
        .catch(() => {});
    };

    // Attempt WebSocket price updates first
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/prices/`;

    const connectWS = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'price_update' && data.prices) {
            setPrices(currentPrices => {
              setPrevPrices(currentPrices);
              return data.prices;
            });
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        // Fall back to REST polling if WebSocket errors
        if (!fallbackInterval) {
          fallbackInterval = setInterval(fetchPricesFallback, 2000);
          fetchPricesFallback();
        }
      };

      ws.onclose = () => {
        if (!fallbackInterval) {
          fallbackInterval = setInterval(fetchPricesFallback, 2000);
          fetchPricesFallback();
        }
      };
    };

    connectWS();
    return () => {
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  // Fetch signals list and watch for changes (10s loop)
  useEffect(() => {
    const fetchSignals = () => {
      fetch('/api/signals/')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.signals && Array.isArray(data.signals)) {
            setSignals(data.signals);

            data.signals.forEach(sig => {
              const symbol = sig.symbol;
              const current = sig.signal_type;
              
              if (isFirstLoadRef.current) {
                prevSignalsRef.current[symbol] = current;
              } else {
                const old = prevSignalsRef.current[symbol];
                if (old !== undefined && old !== current) {
                  // Trigger trading alert!
                  handleSignalChange(symbol, old, current);
                  prevSignalsRef.current[symbol] = current;
                }
              }
            });
            isFirstLoadRef.current = false;
          }
        })
        .catch(() => {});
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, [notifLogs, unreadCount]);

  // Handle detailed signal view for selected pair
  const fetchDetailedSignal = () => {
    if (!selectedPair) {
      setDetailedSignal(null);
      return;
    }
    const slug = selectedPair.replace('/', '-').toLowerCase();
    fetch(`/api/signal/${slug}/`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setDetailedSignal(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchDetailedSignal();
  }, [selectedPair]);

  useEffect(() => {
    if (detailedSignal) {
      setStopLoss(detailedSignal.stop_loss ? detailedSignal.stop_loss.toString() : '');
      setTakeProfit(detailedSignal.take_profit ? detailedSignal.take_profit.toString() : '');
    } else {
      setStopLoss('');
      setTakeProfit('');
    }
  }, [detailedSignal]);

  const handleSignalChange = (symbol, oldSignal, currentSignal) => {
    const alertData = getAlertMessage(symbol, oldSignal, currentSignal);
    if (!alertData) return;

    // Toast
    addToast(alertData.body, 'warning');

    // Desktop Notification Card
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(alertData.title, {
          body: alertData.body,
          tag: `signal-${symbol}`,
          renotify: true
        });
      } catch (e) {}
    }

    // Local Dropdown Logs Box persistence
    const newLog = {
      id: Date.now(),
      symbol,
      message: alertData.body,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: currentSignal
    };

    setNotifLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 20);
      localStorage.setItem('signal_notification_logs', JSON.stringify(updated));
      return updated;
    });

    if (!notifDropdownOpen) {
      setUnreadCount(prev => {
        const next = prev + 1;
        localStorage.setItem('unread_notifs_count', next.toString());
        return next;
      });
    }

    // Audio & voice alerts
    if (localStorage.getItem('voice_alerts_active') === 'true') {
      playChime();
      setTimeout(() => {
        speakText(alertData.speech);
      }, 600);
    }
  };

  const toggleVoiceAlerts = () => {
    const next = !voiceAlertsActive;
    setVoiceAlertsActive(next);
    localStorage.setItem('voice_alerts_active', next ? 'true' : 'false');

    if (next) {
      addToast('Voice alerts enabled', 'success');
      playChime();
      setTimeout(() => speakText('Voice alerts activated'), 450);

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } else {
      addToast('Voice alerts disabled', 'info');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  const clearNotifications = () => {
    setNotifLogs([]);
    localStorage.setItem('signal_notification_logs', '[]');
  };

  const openNotifLogsDropdown = (e) => {
    e.stopPropagation();
    setNotifDropdownOpen(!notifDropdownOpen);
    setAvatarDropdownOpen(false);
    if (!notifDropdownOpen) {
      setUnreadCount(0);
      localStorage.setItem('unread_notifs_count', '0');
    }
  };

  // Global dismiss dropdown clicks
  useEffect(() => {
    const hideAll = () => {
      setNotifDropdownOpen(false);
      setAvatarDropdownOpen(false);
    };
    document.addEventListener('click', hideAll);
    return () => document.removeEventListener('click', hideAll);
  }, []);

  const getPriceFlashClass = (pair) => {
    const current = parseFloat(prices[pair]);
    const prev = parseFloat(prevPrices[pair]);
    if (isNaN(current) || isNaN(prev) || current === prev) return '';
    return current > prev ? 'price-flash-up' : 'price-flash-down';
  };

  const getTopPick = () => {
    if (!signals || signals.length === 0) return null;
    const active = signals.filter(s => s.signal_type === 'BUY' || s.signal_type === 'SELL');
    const list = active.length > 0 ? active : signals;
    const sorted = [...list].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return sorted[0];
  };

  const fetchActiveTrades = () => {
    fetch('/journal/api/active-advice/')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.active_trades) {
          setActiveTrades(data.active_trades);
        }
      })
      .catch(() => {});
  };

  const playTradeChime = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  };

  const placeTrade = (direction) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const getCookie = (name) => {
      let cookieValue = null;
      if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
            cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
            break;
          }
        }
      }
      return cookieValue;
    };
    
    const csrfToken = getCookie('csrftoken');
    
    fetch('/journal/api/open/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pair: selectedPair,
        direction: direction,
        lot_size: lotSize,
        invested_amount: investedAmount,
        leverage: leverage,
        stop_loss: stopLoss,
        take_profit: takeProfit
      })
    })
    .then(r => r.json().then(data => ({ status: r.status, data })))
    .then(({ status, data }) => {
      if (status === 200 && data.status === 'success') {
        addToast(`Executed ${direction} position for ${selectedPair} at $${data.trade.entry_price}`, 'success');
        playTradeChime();
        fetchActiveTrades();
      } else {
        addToast(data.message || 'Execution failed.', 'error');
      }
    })
    .catch(() => addToast('Connection error. Execution failed.', 'error'))
    .finally(() => setIsSubmitting(false));
  };

  // ── Poll Active Trades ──
  useEffect(() => {
    fetchActiveTrades();
    const interval = setInterval(fetchActiveTrades, 2000);
    return () => clearInterval(interval);
  }, []);

  const closeTrade = (tradeId, pair) => {
    if (!window.confirm(`Are you sure you want to close the trade for ${pair} at the current market price?`)) {
      return;
    }
    
    const getCookie = (name) => {
      let cookieValue = null;
      if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
            cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
            break;
          }
        }
      }
      return cookieValue;
    };
    
    const csrfToken = getCookie('csrftoken');
    
    fetch(`/journal/api/close/${tradeId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/json'
      }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.status === 'success') {
        addToast(`Closed trade successfully! PnL: $${data.pnl}`, 'success');
        setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
      } else {
        addToast('Failed to close trade.', 'error');
      }
    })
    .catch(() => addToast('Error closing trade.', 'error'));
  };

  const topPick = getTopPick();

  return (
    <div className="min-h-screen flex flex-col font-sans bg-navy-950 text-accent-hold select-none">
      
      {/* ── Toast Container ── */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`flex items-center gap-3 p-4 rounded-lg shadow-xl border border-navy-700 pointer-events-auto bg-navy-900 transition-all duration-300 transform translate-x-0 ${
              t.type === 'success' ? 'border-accent-green text-accent-green' : 
              t.type === 'warning' ? 'border-orange-500 text-orange-400' : 'text-accent-hold'
            }`}
          >
            <span>{t.type === 'success' ? '✅' : t.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span className="text-sm font-semibold">{t.message}</span>
          </div>
        ))}
      </div>

      {/* ── Top Navigation Bar ── */}
      <header className="h-[64px] border-b border-navy-800 bg-navy-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-purple-800 to-indigo-900 rounded-lg shadow-glow shadow-purple-900/30">
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="9" fill="url(#ng)"/>
              <path d="M9 23L16 13L21 18L28 9" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="28" cy="9" r="3" fill="#00f5a0"/>
              <defs>
                <linearGradient id="ng" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#0f3460"/><stop offset="1" stop-color="#533483"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-wide">
            ForexAI<span className="text-purple-400 font-extrabold ml-0.5">Pro</span>
          </span>
        </div>

        <div className="flex items-center gap-3 relative">
          
          {/* Market Status */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-navy-800 bg-navy-950 text-xs">
            <span className={`w-2 h-2 rounded-full ${marketActive ? 'bg-accent-green shadow-glow shadow-accent-green/50 animate-pulse' : 'bg-gray-600'}`}></span>
            <span className="font-semibold text-white">{marketActive ? 'Market Open' : 'Market Closed (Sim)'}</span>
          </div>

          {/* Voice Bell Toggler */}
          <button 
            onClick={toggleVoiceAlerts}
            className={`p-2.5 rounded-lg border transition-all duration-150 ${
              voiceAlertsActive 
                ? 'border-accent-green/40 bg-accent-green/10 text-accent-green' 
                : 'border-navy-800 text-accent-hold hover:text-white'
            }`}
            title={voiceAlertsActive ? 'Voice alerts active' : 'Voice alerts disabled'}
          >
            {voiceAlertsActive ? <Bell size={17} /> : <BellOff size={17} />}
          </button>

          {/* Notifications Inbox Logs Dropdown */}
          <div className="relative">
            <button 
              onClick={openNotifLogsDropdown}
              className={`p-2.5 rounded-lg border border-navy-800 text-accent-hold hover:text-white relative ${notifDropdownOpen ? 'bg-navy-800' : ''}`}
              title="View signal logs"
            >
              <Inbox size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-accent-red text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifDropdownOpen && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-3 w-80 bg-navy-900 border border-navy-800 rounded-xl shadow-2xl z-[9999] overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800 bg-navy-950">
                  <span className="font-bold text-sm text-white">Signal Logs</span>
                  <button 
                    onClick={clearNotifications}
                    className="text-xs text-accent-hold hover:text-white underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-navy-800">
                  {notifLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-accent-hold">
                      No recent signal alerts.
                    </div>
                  ) : (
                    notifLogs.map(log => (
                      <div 
                        key={log.id} 
                        className="p-3 text-xs hover:bg-navy-850 transition-colors flex flex-col gap-1 cursor-pointer"
                      >
                        <div className="flex justify-between items-center">
                          <span className={`font-bold border-l-2 pl-2 ${
                            log.type === 'BUY' ? 'border-accent-green text-accent-green' : 
                            log.type === 'SELL' ? 'border-accent-red text-accent-red' : 'border-gray-500 text-accent-hold'
                          }`}>
                            {log.symbol}
                          </span>
                          <span className="text-[10px] text-accent-hold/60">{log.time}</span>
                        </div>
                        <p className="text-white pl-2 line-clamp-2">{log.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="divider-h h-6 w-px bg-navy-800"></div>

          {/* Avatar Dropdown */}
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setAvatarDropdownOpen(!avatarDropdownOpen); setNotifDropdownOpen(false); }}
              className="w-9 h-9 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center border border-purple-500 shadow-glow shadow-purple-900/30 cursor-pointer"
            >
              F
            </button>

            {avatarDropdownOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-navy-900 border border-navy-800 rounded-xl shadow-2xl z-[9999] p-2 divide-y divide-navy-800">
                <div className="px-3 py-2.5">
                  <div className="font-bold text-white text-sm">Forex Trader</div>
                  <div className="text-xs text-accent-hold/60">trader@forexai.pro</div>
                </div>
                <div className="py-1">
                  <a href="/accounts/profile/" className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-navy-800 text-white">
                    <Settings size={13} /> Settings
                  </a>
                  <a href="/accounts/pricing/" className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-navy-800 text-white">
                    <Award size={13} /> Upgrade Plan
                  </a>
                </div>
                <div className="pt-1">
                  <a href="/accounts/logout/" className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-red-900/20 text-accent-red">
                    <LogOut size={13} /> Sign Out
                  </a>
                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Sidebar (Currency pairs list) */}
        <aside className="w-full md:w-[320px] border-b md:border-b-0 md:border-r border-navy-800 bg-navy-900/40 flex flex-col p-4 gap-4 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent-hold/60 mb-3">Currency Pairs</h3>
            <div className="flex flex-col gap-2">
              <div 
                onClick={() => setSelectedPair(null)}
                className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between ${
                  selectedPair === null 
                    ? 'border-purple-600 bg-purple-950/20 shadow-glow shadow-purple-900/10' 
                    : 'border-navy-800 bg-navy-900/60 hover:border-navy-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers size={15} className={selectedPair === null ? 'text-purple-400' : 'text-accent-hold/70'} />
                  <span className="font-bold text-white text-xs uppercase tracking-wider">Market Overview</span>
                </div>
                {signals.length > 0 && (
                  <span className="text-[9px] bg-navy-950 text-purple-400 border border-purple-900/30 px-2 py-0.5 rounded-full font-bold font-mono">
                    {signals.length} Pairs
                  </span>
                )}
              </div>

              <div className="h-px bg-navy-800 my-1"></div>

              {signals.map(pairSig => {
                const isSelected = selectedPair === pairSig.symbol;
                const price = parseFloat(prices[pairSig.symbol]) || pairSig.price;
                const flashClass = getPriceFlashClass(pairSig.symbol);

                return (
                  <div 
                    key={pairSig.symbol}
                    onClick={() => setSelectedPair(pairSig.symbol)}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                      isSelected 
                        ? 'border-purple-600 bg-purple-950/20 shadow-glow shadow-purple-900/10' 
                        : 'border-navy-800 bg-navy-900/60 hover:border-navy-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white text-sm tracking-wide">{pairSig.symbol}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        pairSig.signal_type === 'BUY' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' :
                        pairSig.signal_type === 'SELL' ? 'bg-accent-red/10 text-accent-red border-accent-red/20' :
                        'bg-gray-800/60 text-accent-hold border border-gray-700/20'
                      }`}>
                        {pairSig.signal_type}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-mono font-bold text-white transition-colors duration-300 p-0.5 rounded ${flashClass}`}>
                        {formatPrice(price, pairSig.symbol)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Main Work Area */}
        <main className="flex-grow p-6 overflow-y-auto flex flex-col gap-6">
          {selectedPair === null ? (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-navy-900 border border-navy-800 p-5 rounded-2xl">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-wide">AI Market Intelligence</h1>
                  <p className="text-xs text-accent-hold/60 mt-1">Cross-pair technical analysis and top trade picker feed.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-navy-800 bg-navy-950 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${marketActive ? 'bg-accent-green shadow-glow shadow-accent-green/50 animate-pulse' : 'bg-gray-600'}`}></span>
                  <span className="font-semibold text-white">{marketActive ? 'System Active' : 'System Paused'}</span>
                </div>
              </div>

              {/* Live AI Trade Monitor */}
              {activeTrades.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-bold text-white tracking-wide">📡 Live AI Trade Monitor</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeTrades.map(trade => {
                      const pnlSign = trade.pnl >= 0 ? '+' : '';
                      const isTimeWarning = trade.reason.includes('TIME');
                      const isLossWarning = trade.reason.includes('LOSS') || trade.reason.includes('REVERSAL');
                      
                      let borderClass = 'border-navy-800';
                      let barColor = 'bg-navy-800';
                      if (trade.recommendation === 'CLOSE') {
                        if (isTimeWarning) {
                          borderClass = 'border-orange-500/50';
                          barColor = 'bg-orange-500';
                        } else if (isLossWarning) {
                          borderClass = 'border-accent-red/50';
                          barColor = 'bg-accent-red';
                        } else {
                          borderClass = 'border-accent-green/50';
                          barColor = 'bg-accent-green';
                        }
                      }
                      
                      return (
                        <div 
                          key={trade.id} 
                          className={`bg-navy-900 border ${borderClass} rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between gap-4`}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`}></div>
                          
                          <div className="pl-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-bold text-white text-lg tracking-wider">{trade.pair}</span>
                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border uppercase ${
                                trade.direction === 'LONG' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' : 
                                'bg-accent-red/10 text-accent-red border-accent-red/20'
                              }`}>
                                {trade.direction}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs mb-2">
                              <span className="text-accent-hold/60">Capital / Leverage</span>
                              <span className="font-bold text-white font-mono">${trade.invested?.toFixed(2)} ({trade.leverage}x)</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 p-2 rounded bg-navy-950 border border-navy-800/40 text-[11px] mb-2">
                              <div>
                                <span className="text-accent-hold/40 block text-[9px] uppercase">Entry Price</span>
                                <span className="font-mono font-bold text-white">{formatPrice(trade.entry_price, trade.pair)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-accent-hold/40 block text-[9px] uppercase">Current Price</span>
                                <span className="font-mono font-bold text-purple-400">{formatPrice(trade.current_price, trade.pair)}</span>
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-accent-hold/60">Live Floating P&L</span>
                              <span className={`font-mono font-extrabold text-sm ${trade.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                {pnlSign}${trade.pnl?.toFixed(2)} ({pnlSign}{trade.pnl_pct?.toFixed(1)}%)
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs mb-2">
                              <span className="text-accent-hold/60">Time Elapsed</span>
                              <span className="font-mono font-semibold text-white">{trade.elapsed_formatted}</span>
                            </div>
                            
                            <div className="p-3 rounded bg-navy-950 border border-navy-850 text-xs">
                              <div className="text-[9px] uppercase font-bold text-accent-hold/40 tracking-wider mb-1">Copilot Advice</div>
                              <div className="font-semibold text-white leading-normal">{trade.reason}</div>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => closeTrade(trade.id, trade.pair)}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              trade.recommendation === 'CLOSE' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-navy-800 hover:bg-navy-750 text-white border border-navy-700'
                            }`}
                          >
                            ❌ Instant Close Position
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-navy-900 border border-navy-800 p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-xs text-accent-hold/60">Active BUY Picks</span>
                  <span className="text-2xl font-extrabold text-accent-green font-mono">
                    {signals.filter(s => s.signal_type === 'BUY').length}
                  </span>
                </div>
                <div className="bg-navy-900 border border-navy-800 p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-xs text-accent-hold/60">Active SELL Picks</span>
                  <span className="text-2xl font-extrabold text-accent-red font-mono">
                    {signals.filter(s => s.signal_type === 'SELL').length}
                  </span>
                </div>
                <div className="bg-navy-900 border border-navy-800 p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-xs text-accent-hold/60">Market Bias Direction</span>
                  <span className="text-sm font-extrabold text-white uppercase tracking-wider mt-1.5">
                    {(() => {
                      const buys = signals.filter(s => s.signal_type === 'BUY').length;
                      const sells = signals.filter(s => s.signal_type === 'SELL').length;
                      if (buys > sells) return '🟢 Bullish Confluence';
                      if (sells > buys) return '🔴 Bearish Confluence';
                      return '⚪ Neutral / Range';
                    })()}
                  </span>
                </div>
                <div className="bg-navy-900 border border-navy-800 p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-xs text-accent-hold/60">Average Signal Confidence</span>
                  <span className="text-2xl font-extrabold text-purple-400 font-mono">
                    {signals.length > 0 ? Math.round(signals.reduce((acc, s) => acc + (s.confidence || 0), 0) / signals.length) : 0}%
                  </span>
                </div>
              </div>

              {/* AI Top Pick of the Day */}
              {topPick && (
                <div className="bg-gradient-to-r from-purple-950/30 to-navy-900 border border-purple-900/50 p-6 rounded-2xl shadow-glow shadow-purple-950/20 flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="inline-flex px-2 py-0.5 bg-purple-900/40 text-purple-300 rounded text-[10px] font-bold self-start uppercase tracking-wider">🔥 Today's Top Trading Pick</div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
                      {topPick.symbol}
                      <span className={`text-xs font-extrabold px-3 py-1 rounded-lg border uppercase ${
                        topPick.signal_type === 'BUY' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' : 
                        'bg-accent-red/10 text-accent-red border-accent-red/20'
                      }`}>
                        {topPick.signal_type} Recommendation
                      </span>
                    </h2>
                    <p className="text-xs text-accent-hold/80 mt-1 leading-relaxed max-w-2xl">
                      {topPick.ai_explanation || `Our trend-following models indicate a high-probability ${topPick.signal_type} confluence for ${topPick.symbol} with a confidence score of ${topPick.confidence}%.`}
                    </p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-white font-mono">
                      <div><span className="text-accent-hold/60 mr-1.5">Entry Target:</span>{formatPrice(topPick.entry_price, topPick.symbol)}</div>
                      <div><span className="text-accent-red/80 mr-1.5">SL Limit:</span>{formatPrice(topPick.stop_loss, topPick.symbol)}</div>
                      <div><span className="text-accent-green/80 mr-1.5">TP Target:</span>{formatPrice(topPick.take_profit, topPick.symbol)}</div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setSelectedPair(topPick.symbol)}
                    className="w-full lg:w-auto px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-glow shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Play size={14} className="fill-white" /> Open Interactive Chart & Indicators
                  </button>
                </div>
              )}

              {/* Currency Pairs Status Grid */}
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-white tracking-wide">All Market Signals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signals.map(sig => {
                    const price = parseFloat(prices[sig.symbol]) || sig.price;
                    const flashClass = getPriceFlashClass(sig.symbol);

                    return (
                      <div 
                        key={sig.symbol}
                        onClick={() => setSelectedPair(sig.symbol)}
                        className="bg-navy-900 border border-navy-800 p-4 rounded-xl hover:border-navy-700 cursor-pointer transition-all duration-150 flex flex-col justify-between gap-3"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white tracking-wide">{sig.symbol}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            sig.signal_type === 'BUY' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' :
                            sig.signal_type === 'SELL' ? 'bg-accent-red/10 text-accent-red border-accent-red/20' :
                            'bg-gray-800/60 text-accent-hold border border-gray-700/20'
                          }`}>
                            {sig.signal_type}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-accent-hold/40 font-bold uppercase">Live Quote</span>
                            <span className={`font-mono text-sm font-extrabold text-white transition-colors duration-300 p-0.5 rounded ${flashClass}`}>
                              {formatPrice(price, sig.symbol)}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] text-accent-hold/40 font-bold uppercase">Confidence</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white font-mono">{sig.confidence}%</span>
                              <div className="w-12 bg-navy-950 h-1.5 rounded-full overflow-hidden border border-navy-800">
                                <div className="h-full bg-purple-500" style={{ width: `${sig.confidence}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Logs / Recent Events Section */}
              <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-3">
                <h3 className="text-sm font-bold text-white tracking-wide">Recent Signal Activity Log</h3>
                <div className="max-h-60 overflow-y-auto divide-y divide-navy-800 font-mono text-xs text-white">
                  {notifLogs.length === 0 ? (
                    <div className="p-6 text-center text-accent-hold/60 font-sans">
                      No signal activity recorded in this session. Logs appear as signals fluctuate.
                    </div>
                  ) : (
                    notifLogs.map(log => (
                      <div key={log.id} className="py-2.5 flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3">
                          <span className="text-[10px] text-accent-hold/50 mt-0.5">{log.time}</span>
                          <span className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] ${
                            log.type === 'BUY' ? 'bg-accent-green/10 text-accent-green' :
                            log.type === 'SELL' ? 'bg-accent-red/10 text-accent-red' :
                            'bg-gray-800 text-accent-hold'
                          }`}>
                            {log.type}
                          </span>
                          <span className="font-sans leading-normal">{log.message}</span>
                        </div>
                        <span className="text-[10px] text-purple-400 hover:underline cursor-pointer font-sans shrink-0" onClick={() => setSelectedPair(log.symbol)}>
                          Inspect Pair &rarr;
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : detailedSignal ? (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-navy-900 border border-navy-800 p-5 rounded-2xl">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-wide">{detailedSignal.symbol} AI Signal</h1>
                  <p className="text-xs text-accent-hold/60 mt-1">Live market data analysis feed updated in real-time.</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-bold px-4 py-2 rounded-xl border flex items-center gap-2 ${
                    detailedSignal.signal_type === 'BUY' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' :
                    detailedSignal.signal_type === 'SELL' ? 'bg-accent-red/10 text-accent-red border-accent-red/20' :
                    'bg-gray-800/60 text-accent-hold border border-gray-700/20'
                  }`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      detailedSignal.signal_type === 'BUY' ? 'bg-accent-green shadow-glow shadow-accent-green/50 animate-pulse' :
                      detailedSignal.signal_type === 'SELL' ? 'bg-accent-red shadow-glow shadow-accent-red/50 animate-pulse' :
                      'bg-gray-500'
                    }`}></span>
                    AI SIGNAL: {detailedSignal.signal_type}
                  </span>
                </div>
              </div>

              {/* Chart and Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Interactive Chart Container */}
                <div className="lg:col-span-2 bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white tracking-wide">Interactive Price Chart (1H Candles)</h3>
                    <div className="flex gap-2 text-xs">
                      {!marketActive && (
                        <span className="px-2 py-0.5 rounded border border-orange-500 bg-orange-950/20 text-orange-400 font-bold">
                          ⚠️ SIMULATION
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded border border-purple-800 bg-purple-950/20 text-purple-400 font-bold">
                        {detailedSignal.signal_type === 'BUY' ? '🟢 BULLISH BIAS' : detailedSignal.signal_type === 'SELL' ? '🔴 BEARISH BIAS' : '⚪ NEUTRAL'}
                      </span>
                    </div>
                  </div>
                  <TradingChart 
                    ohlcv={detailedSignal.ohlcv} 
                    entry={detailedSignal.entry_price}
                    sl={detailedSignal.stop_loss}
                    tp={detailedSignal.take_profit}
                    latestPrice={parseFloat(prices[selectedPair])}
                  />
                </div>

                {/* AI Trade Plan Metrics */}
                <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col justify-between gap-5">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide mb-4">AI Target Trade Plan</h3>
                    <div className="flex flex-col gap-3">
                      
                      <div className="p-3 bg-navy-950 rounded-xl border border-navy-800 flex justify-between items-center">
                        <span className="text-xs text-accent-hold/60">Suggested Entry</span>
                        <span className="font-mono text-sm font-bold text-white">{formatPrice(detailedSignal.entry_price, detailedSignal.symbol)}</span>
                      </div>

                      <div className="p-3 bg-accent-red/5 rounded-xl border border-accent-red/20 flex justify-between items-center">
                        <span className="text-xs text-accent-red/60 font-semibold">Stop Loss (SL)</span>
                        <span className="font-mono text-sm font-bold text-accent-red">{formatPrice(detailedSignal.stop_loss, detailedSignal.symbol)}</span>
                      </div>

                      <div className="p-3 bg-accent-green/5 rounded-xl border border-accent-green/20 flex justify-between items-center">
                        <span className="text-xs text-accent-green/60 font-semibold">Take Profit (TP)</span>
                        <span className="font-mono text-sm font-bold text-accent-green">{formatPrice(detailedSignal.take_profit, detailedSignal.symbol)}</span>
                      </div>

                    </div>
                  </div>

                  <div className="p-4 bg-navy-950 rounded-xl border border-navy-800 flex flex-col gap-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-accent-hold/60">Risk/Reward Ratio</span>
                      <span className="font-bold text-white font-mono">1:2 (25 SL / 50 TP pips)</span>
                    </div>
                    <div className="h-px bg-navy-800"></div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-accent-hold/60">Confidence Score</span>
                      <span className={`font-bold font-mono ${detailedSignal.confidence >= 70 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {detailedSignal.confidence}%
                      </span>
                    </div>
                    {/* Confidence bar meter */}
                    <div className="w-full bg-navy-800 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          detailedSignal.confidence >= 70 ? 'bg-accent-green shadow-glow shadow-accent-green/50' : 
                          detailedSignal.confidence >= 50 ? 'bg-orange-500' : 'bg-accent-red'
                        }`} 
                        style={{ width: `${detailedSignal.confidence}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* MetaTrader-style Trade Execution Panel */}
                  <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl">
                    <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
                      Instant Market Execution
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Lot Size */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-accent-hold/60 font-semibold">Lot Size (Volume)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          min="0.01"
                          max="10.00"
                          value={lotSize} 
                          onChange={(e) => setLotSize(parseFloat(e.target.value) || 0.01)}
                          className="bg-navy-950 border border-navy-800 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-600 focus:outline-none transition-colors"
                        />
                      </div>
                      
                      {/* Leverage */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-accent-hold/60 font-semibold">Leverage</label>
                        <input 
                          type="number" 
                          step="1" 
                          min="1"
                          max="1000"
                          value={leverage} 
                          onChange={(e) => setLeverage(parseInt(e.target.value) || 100)}
                          className="bg-navy-950 border border-navy-800 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-600 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Stop Loss */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-accent-red/80 font-semibold">Stop Loss (SL)</label>
                        <input 
                          type="number" 
                          step="0.00001" 
                          value={stopLoss} 
                          onChange={(e) => setStopLoss(e.target.value)}
                          placeholder="None"
                          className="bg-navy-950 border border-accent-red/20 rounded-xl px-3 py-2 text-white font-mono focus:border-accent-red focus:outline-none transition-colors"
                        />
                      </div>
                      
                      {/* Take Profit */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-accent-green/80 font-semibold">Take Profit (TP)</label>
                        <input 
                          type="number" 
                          step="0.00001" 
                          value={takeProfit} 
                          onChange={(e) => setTakeProfit(e.target.value)}
                          placeholder="None"
                          className="bg-navy-950 border border-accent-green/20 rounded-xl px-3 py-2 text-white font-mono focus:border-accent-green focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Invested Amount */}
                    <div className="flex flex-col gap-1.5 text-xs">
                      <label className="text-accent-hold/60 font-semibold">Margin / Invested Amount ($)</label>
                      <input 
                        type="number" 
                        step="1.00" 
                        min="1.00"
                        value={investedAmount} 
                        onChange={(e) => setInvestedAmount(parseFloat(e.target.value) || 15.00)}
                        className="bg-navy-950 border border-navy-800 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-600 focus:outline-none transition-colors"
                      />
                    </div>

                    {/* MT5 Buy/Sell Buttons */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <button 
                        onClick={() => placeTrade('SHORT')}
                        disabled={isSubmitting}
                        className="bg-gradient-to-b from-accent-red/90 to-red-800 hover:from-accent-red hover:to-red-700 active:scale-[0.98] disabled:opacity-50 text-white py-3 px-4 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg shadow-red-950/20"
                      >
                        <span className="font-extrabold text-sm tracking-wider">SELL</span>
                        <span className="text-[10px] font-mono opacity-80">
                          {formatPrice(parseFloat(prices[selectedPair]) || detailedSignal.price, selectedPair)}
                        </span>
                      </button>
                      
                      <button 
                        onClick={() => placeTrade('LONG')}
                        disabled={isSubmitting}
                        className="bg-gradient-to-b from-accent-green/90 to-emerald-800 hover:from-accent-green hover:to-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white py-3 px-4 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg shadow-emerald-950/20"
                      >
                        <span className="font-extrabold text-sm tracking-wider">BUY</span>
                        <span className="text-[10px] font-mono opacity-80">
                          {formatPrice(parseFloat(prices[selectedPair]) || detailedSignal.price, selectedPair)}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Rationale and Indicators */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* AI Rationale explanation */}
                <div className="lg:col-span-2 bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-white tracking-wide">AI Trade Analysis & Rationale</h3>
                  <div className="p-4 bg-navy-950/60 rounded-xl border border-navy-800 flex flex-col gap-3">
                    <div className="inline-flex px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded text-[10px] font-bold self-start">🤖 ForexAI Engine</div>
                    <p className="text-sm font-semibold text-white leading-relaxed">{detailedSignal.ai_explanation}</p>
                    <div className="h-px bg-navy-800 my-1"></div>
                    <p className="text-xs text-accent-hold/70 leading-relaxed">{detailedSignal.reasoning}</p>
                  </div>
                </div>

                {/* Technical Gauges (RSI/MACD) */}
                <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-white tracking-wide">Technical Indicators</h3>
                  
                  {/* RSI Gauge */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5 text-xs">
                      <span className="font-semibold text-white">RSI (14)</span>
                      <span className={`font-mono font-bold ${
                        detailedSignal.rsi >= 70 ? 'text-accent-red' : 
                        detailedSignal.rsi <= 30 ? 'text-accent-green' : 'text-white'
                      }`}>
                        {detailedSignal.rsi?.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-5 bg-navy-950 border border-navy-800 rounded-lg relative overflow-hidden flex items-center">
                      <div className="absolute left-0 w-[30%] h-full bg-accent-green/5 border-r border-dashed border-accent-green/20"></div>
                      <div className="absolute right-0 w-[30%] h-full bg-accent-red/5 border-l border-dashed border-accent-red/20"></div>
                      {/* Pointer */}
                      <div 
                        className="absolute h-full w-1 bg-purple-500 shadow-glow shadow-purple-500/80 transition-all duration-300"
                        style={{ left: `${detailedSignal.rsi}%` }}
                      ></div>
                      <div className="w-full flex justify-between px-2 text-[8px] text-accent-hold/40 font-bold uppercase select-none">
                        <span>Oversold</span>
                        <span>Neutral</span>
                        <span>Overbought</span>
                      </div>
                    </div>
                  </div>

                  {/* MACD Gauge */}
                  <div className="p-3 bg-navy-950 rounded-xl border border-navy-800 text-xs font-mono flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-accent-hold/60">MACD Line</span>
                      <span className="font-bold text-white">{detailedSignal.macd?.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-accent-hold/60">Signal Line</span>
                      <span className="font-bold text-white">{detailedSignal.macd_signal?.toFixed(5)}</span>
                    </div>
                    <div className="h-px bg-navy-800 my-0.5"></div>
                    <div className="flex justify-between">
                      <span className="text-accent-hold/60">Histogram</span>
                      <span className={`font-bold ${detailedSignal.macd_hist >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {detailedSignal.macd_hist >= 0 ? '+' : ''}{detailedSignal.macd_hist?.toFixed(5)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Data Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Moving Averages */}
                <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-white tracking-wide">Moving Averages (Hourly)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono divide-y divide-navy-800">
                      <thead>
                        <tr className="text-accent-hold/60 text-[10px] uppercase">
                          <th className="py-2.5">Period</th>
                          <th className="py-2.5">Simple (SMA)</th>
                          <th className="py-2.5">Bias</th>
                          <th className="py-2.5">Exponential (EMA)</th>
                          <th className="py-2.5">Bias</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-800/50 text-white">
                        {['20', '50', '100', '200'].map(period => {
                          const smaVal = detailedSignal[`sma${period}`];
                          const emaVal = detailedSignal[`ema${period}`];
                          const currentPrice = parseFloat(prices[selectedPair]) || detailedSignal.price;
                          const smaBullish = currentPrice > smaVal;
                          const emaBullish = currentPrice > emaVal;

                          return (
                            <tr key={period}>
                              <td className="py-2.5 font-sans font-bold text-accent-hold/80">{period}</td>
                              <td className="py-2.5">{formatPrice(smaVal, detailedSignal.symbol)}</td>
                              <td className={`py-2.5 font-bold ${smaBullish ? 'text-accent-green' : 'text-accent-red'}`}>
                                {smaBullish ? 'Bullish' : 'Bearish'}
                              </td>
                              <td className="py-2.5">{formatPrice(emaVal, detailedSignal.symbol)}</td>
                              <td className={`py-2.5 font-bold ${emaBullish ? 'text-accent-green' : 'text-accent-red'}`}>
                                {emaBullish ? 'Bullish' : 'Bearish'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pivot Points */}
                <div className="bg-navy-900 border border-navy-800 p-5 rounded-2xl flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-white tracking-wide">Daily Pivot Points</h3>
                  <div className="grid grid-cols-2 gap-4">
                    
                    {/* Classic Pivots */}
                    <div className="p-3.5 bg-navy-950 rounded-xl border border-navy-800 flex flex-col gap-2 font-mono text-xs">
                      <div className="font-sans font-bold text-white text-xs mb-1">Classic Pivots</div>
                      <div className="flex justify-between text-accent-red"><span>R3</span><span>{formatPrice(detailedSignal.pivots?.classic?.r3, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-red"><span>R2</span><span>{formatPrice(detailedSignal.pivots?.classic?.r2, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-red"><span>R1</span><span>{formatPrice(detailedSignal.pivots?.classic?.r1, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-white font-bold bg-purple-900/10 p-1 rounded"><span>PP</span><span>{formatPrice(detailedSignal.pivots?.classic?.pp, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S1</span><span>{formatPrice(detailedSignal.pivots?.classic?.s1, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S2</span><span>{formatPrice(detailedSignal.pivots?.classic?.s2, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S3</span><span>{formatPrice(detailedSignal.pivots?.classic?.s3, detailedSignal.symbol)}</span></div>
                    </div>

                    {/* Fibonacci Pivots */}
                    <div className="p-3.5 bg-navy-950 rounded-xl border border-navy-800 flex flex-col gap-2 font-mono text-xs">
                      <div className="font-sans font-bold text-white text-xs mb-1">Fibonacci Pivots</div>
                      <div className="flex justify-between text-accent-red"><span>R3</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.r3, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-red"><span>R2</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.r2, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-red"><span>R1</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.r1, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-white font-bold bg-purple-900/10 p-1 rounded"><span>PP</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.pp, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S1</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.s1, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S2</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.s2, detailedSignal.symbol)}</span></div>
                      <div className="flex justify-between text-accent-green"><span>S3</span><span>{formatPrice(detailedSignal.pivots?.fibonacci?.s3, detailedSignal.symbol)}</span></div>
                    </div>

                  </div>
                </div>

              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-navy-900 border border-navy-800 rounded-2xl p-12 text-center">
              <div className="max-w-md flex flex-col gap-3 items-center">
                <AlertTriangle size={48} className="text-purple-500 animate-pulse" />
                <h2 className="text-xl font-bold text-white">Loading Intelligence Analysis...</h2>
                <p className="text-sm text-accent-hold/60">Fetching technical indicators, pivot tables, moving averages, and live historical charts fromTwelve Data API.</p>
              </div>
            </div>
          )}
        </main>
      </div>

    </div>
  );
}

export default App;
