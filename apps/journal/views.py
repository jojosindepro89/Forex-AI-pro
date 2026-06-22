from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from .models import JournalEntry
from .forms import JournalEntryForm


@login_required
def journal_list_view(request):
    entries = JournalEntry.objects.filter(user=request.user)
    wins = entries.filter(outcome='WIN').count()
    losses = entries.filter(outcome='LOSS').count()
    total_closed = wins + losses
    win_rate = round(wins / total_closed * 100, 1) if total_closed > 0 else 0
    total_pnl = sum(e.pnl for e in entries if e.pnl is not None)
    return render(request, 'journal/list.html', {
        'entries': entries,
        'wins': wins,
        'losses': losses,
        'win_rate': win_rate,
        'total_pnl': total_pnl,
    })


@login_required
def journal_create_view(request):
    if request.method == 'POST':
        form = JournalEntryForm(request.POST, request.FILES)
        if form.is_valid():
            entry = form.save(commit=False)
            entry.user = request.user
            entry.save()
            messages.success(request, 'Trade logged successfully!')
            return redirect('journal:list')
    else:
        form = JournalEntryForm()
    return render(request, 'journal/form.html', {'form': form, 'title': 'Log Trade'})


@login_required
def journal_detail_view(request, pk):
    entry = get_object_or_404(JournalEntry, pk=pk, user=request.user)
    return render(request, 'journal/detail.html', {'entry': entry})


@login_required
def journal_edit_view(request, pk):
    entry = get_object_or_404(JournalEntry, pk=pk, user=request.user)
    if request.method == 'POST':
        form = JournalEntryForm(request.POST, request.FILES, instance=entry)
        if form.is_valid():
            form.save()
            messages.success(request, 'Trade updated!')
            return redirect('journal:detail', pk=pk)
    else:
        form = JournalEntryForm(instance=entry)
    return render(request, 'journal/form.html', {'form': form, 'title': 'Edit Trade', 'entry': entry})


@login_required
def journal_delete_view(request, pk):
    entry = get_object_or_404(JournalEntry, pk=pk, user=request.user)
    if request.method == 'POST':
        entry.delete()
        messages.success(request, 'Trade deleted.')
        return redirect('journal:list')
    return render(request, 'journal/confirm_delete.html', {'entry': entry})


@login_required
def active_trades_advice_api(request):
    """JSON API to get live prices, PnL, elapsed time, and AI Copilot advice for all open trades"""
    from django.http import JsonResponse
    from django.utils import timezone
    from apps.market_data.clients import get_client
    from apps.market_data.signals_engine import generate_signal_for_pair
    
    entries = JournalEntry.objects.filter(user=request.user, outcome='OPEN')
    client = get_client()
    
    active_trades = []
    for entry in entries:
        current_price = client.get_price(entry.pair)
        if not current_price:
            current_price = float(entry.entry_price)
            
        current_price = float(current_price)
        entry_price = float(entry.entry_price)
        invested = float(entry.invested_amount)
        leverage = int(entry.leverage)
        
        if entry.direction == 'LONG':
            pnl = invested * leverage * (current_price - entry_price) / entry_price
        else:
            pnl = invested * leverage * (entry_price - current_price) / entry_price
            
        pnl = round(pnl, 2)
        pnl_pct = round((pnl / invested) * 100, 1)
        
        elapsed_seconds = (timezone.now() - entry.created_at).total_seconds()
        elapsed_minutes = elapsed_seconds / 60.0
        
        rec = "HOLD"
        reason = "🟢 HOLD: Trade is performing within normal bounds. Indicators support continuing the position."
        
        sl_price = float(entry.stop_loss) if entry.stop_loss else None
        tp_price = float(entry.take_profit) if entry.take_profit else None
        
        is_sl_breached = False
        if sl_price:
            if entry.direction == 'LONG' and current_price <= sl_price:
                is_sl_breached = True
            elif entry.direction == 'SHORT' and current_price >= sl_price:
                is_sl_breached = True
                
        if is_sl_breached or pnl_pct <= -15.0:
            rec = "CLOSE"
            reason = f"🚨 CUT LOSS: Stop Loss limit breached ({pnl_pct}% / -${abs(pnl):.2f}). Cut off the trade immediately to protect your remaining capital!"
            
        is_tp_reached = False
        if tp_price:
            if entry.direction == 'LONG' and current_price >= tp_price:
                is_tp_reached = True
            elif entry.direction == 'SHORT' and current_price <= tp_price:
                is_tp_reached = True
                
        if rec != "CLOSE" and (is_tp_reached or pnl_pct >= 10.0):
            rec = "CLOSE"
            reason = f"💰 SECURE PROFITS: Profit target of 10% reached (+${pnl:.2f}). Close trade now to lock in your gains!"
            
        if rec != "CLOSE" and elapsed_minutes >= 10.0:
            rec = "CLOSE"
            reason = f"⏱️ TIME WARNING: Trade has been open for {int(elapsed_minutes)} minutes (threshold: 10m). Cut off the trade now to manage your exposure."
            
        if rec != "CLOSE":
            live_signal = generate_signal_for_pair(entry.pair)
            if live_signal:
                sig_type = live_signal.get('signal_type')
                if entry.direction == 'LONG' and sig_type == 'SELL':
                    rec = "CLOSE"
                    reason = "🛑 TREND REVERSAL: Live AI trend signal changed to SELL. Cut off your LONG trade to prevent losses."
                elif entry.direction == 'SHORT' and sig_type == 'BUY':
                    rec = "CLOSE"
                    reason = "🛑 TREND REVERSAL: Live AI trend signal changed to BUY. Cut off your SHORT trade to prevent losses."

        active_trades.append({
            'id': entry.id,
            'pair': entry.pair,
            'direction': entry.direction,
            'entry_price': entry_price,
            'current_price': current_price,
            'invested': invested,
            'leverage': leverage,
            'pnl': pnl,
            'pnl_pct': pnl_pct,
            'elapsed_seconds': int(elapsed_seconds),
            'elapsed_formatted': f"{int(elapsed_minutes)}m {int(elapsed_seconds % 60)}s",
            'recommendation': rec,
            'reason': reason
        })
        
    return JsonResponse({'active_trades': active_trades})


@login_required
@require_POST
def close_trade_api(request, pk):
    """Close an open trade instantly at the current market price"""
    from django.http import JsonResponse
    from django.views.decorators.http import require_POST
    from apps.market_data.clients import get_client
    
    entry = get_object_or_404(JournalEntry, pk=pk, user=request.user, outcome='OPEN')
    client = get_client()
    
    current_price = client.get_price(entry.pair)
    if not current_price:
        current_price = float(entry.entry_price)
        
    current_price = float(current_price)
    entry_price = float(entry.entry_price)
    invested = float(entry.invested_amount)
    leverage = int(entry.leverage)
    
    if entry.direction == 'LONG':
        pnl = invested * leverage * (current_price - entry_price) / entry_price
    else:
        pnl = invested * leverage * (entry_price - current_price) / entry_price
        
    pnl = round(pnl, 2)
    
    entry.exit_price = current_price
    entry.pnl = pnl
    entry.outcome = 'WIN' if pnl >= 0 else 'LOSS'
    entry.save()
    
    messages.success(request, f"Closed trade for {entry.pair} at {current_price:.5f}. PnL: {'+' if pnl >= 0 else ''}${pnl:.2f}")
    return JsonResponse({
        'status': 'success',
        'pnl': pnl,
        'outcome': entry.outcome,
        'exit_price': current_price
    })


@login_required
@require_POST
def open_trade_api(request):
    """Instantly execute a simulated position and log it in the journal"""
    import json
    from django.http import JsonResponse
    from django.utils import timezone
    from apps.market_data.clients import get_client, CURRENCY_PAIRS
    
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON body'}, status=400)
        
    pair = data.get('pair')
    direction = data.get('direction')
    
    if not pair or not direction:
        return JsonResponse({'status': 'error', 'message': 'pair and direction are required'}, status=400)
        
    direction = direction.upper()
    if direction not in ['LONG', 'SHORT']:
        return JsonResponse({'status': 'error', 'message': 'direction must be LONG or SHORT'}, status=400)
        
    # Standardize pair format
    if '/' not in pair and len(pair) == 6:
        pair_fmt = f"{pair[:3].upper()}/{pair[3:].upper()}"
    else:
        pair_fmt = pair.upper().replace('-', '/')
        
    if pair_fmt not in CURRENCY_PAIRS:
        return JsonResponse({'status': 'error', 'message': f'Unsupported pair: {pair_fmt}'}, status=400)
        
    # Get current price
    client = get_client()
    current_price = client.get_price(pair_fmt)
    if not current_price:
        return JsonResponse({'status': 'error', 'message': 'Failed to fetch market price'}, status=503)
        
    # Read optional params with defaults
    try:
        lot_size = float(data.get('lot_size', 0.01))
        invested_amount = float(data.get('invested_amount', 15.00))
        leverage = int(data.get('leverage', 100))
        
        stop_loss = data.get('stop_loss')
        take_profit = data.get('take_profit')
        stop_loss = float(stop_loss) if stop_loss and str(stop_loss).strip() != '' else None
        take_profit = float(take_profit) if take_profit and str(take_profit).strip() != '' else None
    except (ValueError, TypeError):
        return JsonResponse({'status': 'error', 'message': 'Invalid numerical values provided'}, status=400)
        
    notes = data.get('notes', '')
    
    # Save the Open position
    entry = JournalEntry.objects.create(
        user=request.user,
        pair=pair_fmt,
        direction=direction,
        outcome='OPEN',
        entry_price=current_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        lot_size=lot_size,
        invested_amount=invested_amount,
        leverage=leverage,
        trade_date=timezone.now().date(),
        notes=notes
    )
    
    return JsonResponse({
        'status': 'success',
        'trade': {
            'id': entry.id,
            'pair': entry.pair,
            'direction': entry.direction,
            'entry_price': float(entry.entry_price),
            'stop_loss': float(entry.stop_loss) if entry.stop_loss else None,
            'take_profit': float(entry.take_profit) if entry.take_profit else None,
            'lot_size': float(entry.lot_size),
            'invested_amount': float(entry.invested_amount),
            'leverage': int(entry.leverage),
            'created_at': entry.created_at.isoformat()
        }
    })

