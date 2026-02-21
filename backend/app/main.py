from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import asyncio
import json
from .databricks_client import DatabricksClient

app = FastAPI(title="SweetReturns Agent Decision API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()
db_client = DatabricksClient()


class NewsInput(BaseModel):
    news_text: str


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "sweetreturns-api"}


@app.websocket("/ws/agent-stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive time/scenario from client
            data = await websocket.receive_json()
            scenario = data.get("scenario", "covid_crash")
            timestamp = data.get("timestamp", 0)

            # Query Databricks for agent flows
            flows = await db_client.get_agent_flows(scenario, timestamp)

            # Stream back to client
            await websocket.send_json({"type": "agent_flows", "data": flows})

            await asyncio.sleep(0.1)  # 10 FPS update rate
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/inject-news")
async def inject_news(payload: NewsInput):
    """Live Hero Feature: Inject fake news and get real-time agent reaction"""
    news_text = payload.news_text

    # Call FinBERT on Databricks Model Serving
    sentiment = await db_client.analyze_sentiment(news_text)
    affected_stocks = await db_client.get_affected_stocks(news_text)
    agent_reaction = await db_client.compute_agent_reaction(sentiment, affected_stocks)

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "breaking_news",
        "news": news_text,
        "sentiment": sentiment,
        "agent_reaction": agent_reaction,
    })

    return {"status": "broadcasted", "sentiment": sentiment}
