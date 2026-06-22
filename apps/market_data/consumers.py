"""WebSocket consumer — pushes live price updates to browser"""
import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache
from .clients import CURRENCY_PAIRS

logger = logging.getLogger(__name__)


class PriceConsumer(AsyncWebsocketConsumer):
    """
    Streams live prices to connected browser clients.
    Fetches from cache (populated by Twelve Data every 30s)
    and sends updates every 5 seconds via WebSocket.
    """

    async def connect(self):
        self.group_name = "live_prices"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        # Send initial prices immediately on connect
        await self.send_prices()
        # Start background loop
        self.running = True
        asyncio.ensure_future(self.price_loop())

    async def disconnect(self, close_code):
        self.running = False
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def price_loop(self):
        """Send price updates every 5 seconds"""
        while self.running:
            await asyncio.sleep(5)
            try:
                await self.send_prices()
            except Exception:
                break

    async def send_prices(self):
        """Fetch prices from cache or live API and send to client"""
        prices = await self.get_prices()
        await self.send(text_data=json.dumps({
            'type': 'price_update',
            'prices': prices,
        }))

    @database_sync_to_async
    def get_prices(self):
        """Get prices from cache, fallback to live API"""
        from .clients import get_client
        prices = {}
        client = get_client()
        for pair in CURRENCY_PAIRS:
            try:
                price = client.get_price(pair)
                if price:
                    prices[pair] = price
            except Exception as e:
                logger.warning(f"Price fetch failed for {pair}: {e}")
        return prices

    async def price_broadcast(self, event):
        """Handle group broadcast from other consumers"""
        await self.send(text_data=json.dumps(event['data']))
