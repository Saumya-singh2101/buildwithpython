"""
SAFAR — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
from typing import List
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import math
import random
from datetime import datetime, timedelta
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from typing import List, Dict, Set, Tuple
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="SAFAR API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
# WebSocket connection manager
# ─────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()

# ─────────────────────────────────────────
# Helper: haversine distance (km)
# ─────────────────────────────────────────
def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))

# ─────────────────────────────────────────
# ML helpers (lightweight, no sklearn needed for demo)
# ─────────────────────────────────────────
def predict_delay(route_id: str, hour: int, base_delay: int) -> dict:
    peak = hour in [8, 9, 17, 18, 19]
    factor = 1.6 if peak else 1.0
    predicted = round(base_delay * factor + random.uniform(-1, 2))
    confidence = 0.82 if peak else 0.91
    return {"minutes": max(0, predicted), "confidence": confidence, "peak_hour": peak}

def predict_crowd(route_id: str, hour: int, current: str) -> dict:
    levels = ["low", "medium", "high"]
    peak = hour in [8, 9, 17, 18, 19]
    if peak:
        idx = min(levels.index(current) + 1, 2)
    else:
        idx = levels.index(current)
    return {"level": levels[idx], "confidence": 0.78, "percentage": [25, 60, 90][idx]}

def predict_eta(vehicle_id: str, delay_minutes: int) -> dict:
    base_eta = datetime.now() + timedelta(minutes=random.randint(3, 15) + delay_minutes)
    confidence = max(0.6, 0.95 - delay_minutes * 0.03)
    return {
        "eta": base_eta.strftime("%H:%M"),
        "minutes_away": random.randint(3, 15) + delay_minutes,
        "confidence": round(confidence, 2)
    }

# ─────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "SAFAR API running", "version": "1.0.0"}

@app.get("/transit/live")
async def get_live_transit():
    """All live vehicle positions with delay + crowd status."""
    try:
        res = supabase.table("vehicles").select("*, routes(name, mode, color, stops)").execute()
        vehicles = res.data or []
        hour = datetime.now().hour
        enriched = []
        for v in vehicles:
            delay_pred = predict_delay(v["route_id"], hour, v.get("delay_minutes", 0))
            eta_pred   = predict_eta(v["id"], delay_pred["minutes"])
            crowd_pred = predict_crowd(v["route_id"], hour, v.get("crowd_level", "low"))
            enriched.append({
                **v,
                "delay_prediction": delay_pred,
                "eta_prediction":   eta_pred,
                "crowd_prediction": crowd_pred,
            })
        return {"vehicles": enriched, "timestamp": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/alerts")
async def get_alerts():
    """Active alerts — delays, cancellations, platform changes."""
    try:
        res = supabase.table("alerts").select("*").eq("active", True).order("created_at", desc=True).execute()
        return {"alerts": res.data or [], "count": len(res.data or [])}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/stops")
async def get_stops():
    """All transit stops/stations — powers the From/To selectors on the frontend.
    Fully dynamic: add/remove/edit rows in the Supabase `stops` table and the
    journey planner UI updates automatically, no redeploy needed."""
    try:
        res = supabase.table("stops").select("*").order("name").execute()
        return {"stops": res.data or [], "count": len(res.data or [])}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/crowd")
async def get_crowd(route_id: Optional[str] = None):
    """Crowd levels for all or a specific route."""
    try:
        q = supabase.table("vehicles").select("id, route_id, crowd_level, next_stop")
        if route_id:
            q = q.eq("route_id", route_id)
        res = q.execute()
        hour = datetime.now().hour
        result = []
        for v in (res.data or []):
            pred = predict_crowd(v["route_id"], hour, v.get("crowd_level", "low"))
            result.append({**v, "prediction": pred})
        return {"crowd": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/eta")
async def get_eta(vehicle_id: str):
    """ML-powered ETA for a specific vehicle."""
    try:
        res = supabase.table("vehicles").select("*").eq("id", vehicle_id).single().execute()
        v = res.data
        if not v:
            raise HTTPException(404, "Vehicle not found")
        hour = datetime.now().hour
        delay = predict_delay(v["route_id"], hour, v.get("delay_minutes", 0))
        eta   = predict_eta(vehicle_id, delay["minutes"])
        return {"vehicle_id": vehicle_id, "eta": eta, "delay": delay}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


class JourneyRequest(BaseModel):
    origin_name:  str
    origin_lat:   float
    origin_lng:   float
    dest_name:    str
    dest_lat:     float
    dest_lng:     float
    accessibility: bool = False


@app.post("/journey/plan")
async def plan_journey(req: JourneyRequest):
    """Multi-modal journey planning with ETA and auto re-routing."""
    try:
        routes_res = supabase.table("routes").select("*").eq("active", True).execute()
        stops_res  = supabase.table("stops").select("*").execute()
        alerts_res = supabase.table("alerts").select("*").eq("active", True).execute()

        all_routes = routes_res.data or []
        all_stops  = stops_res.data  or []
        active_alerts = alerts_res.data or []

        disrupted_routes = set()
        for a in active_alerts:
            if a["severity"] in ["high"] and a["type"] in ["cancellation", "disruption"]:
                disrupted_routes.update(a.get("route_ids", []))

        direct_dist = haversine(req.origin_lat, req.origin_lng, req.dest_lat, req.dest_lng)
        hour = datetime.now().hour

        # Score each route by proximity to origin + destination
        def score_route(route):
            stops = route.get("stops") or []
            if not stops:
                return None
            # find nearest stop to origin
            origin_dists = [
                (s, haversine(req.origin_lat, req.origin_lng, s["lat"], s["lng"]))
                for s in stops
            ]
            dest_dists = [
                (s, haversine(req.dest_lat, req.dest_lng, s["lat"], s["lng"]))
                for s in stops
            ]
            best_origin = min(origin_dists, key=lambda x: x[1])
            best_dest   = min(dest_dists,   key=lambda x: x[1])
            if best_origin[1] > 5 or best_dest[1] > 5:  # >5km away, skip
                return None
            total_walk = best_origin[1] + best_dest[1]

            # Build the ordered list of stops actually passed through on this leg,
            # using each stop's `sequence` so direction-of-travel is respected
            # even if the route's stops array isn't pre-sorted.
            board_seq = best_origin[0].get("sequence", 0)
            alight_seq = best_dest[0].get("sequence", 0)
            lo, hi = min(board_seq, alight_seq), max(board_seq, alight_seq)
            stops_between = sorted(
                [s for s in stops if lo <= s.get("sequence", 0) <= hi],
                key=lambda s: s.get("sequence", 0),
            )
            if board_seq > alight_seq:
                stops_between = list(reversed(stops_between))

            return {
                "route": route,
                "board_stop": best_origin[0],
                "alight_stop": best_dest[0],
                "walk_km": round(total_walk, 2),
                "stops_between": stops_between,
            }

        options = []
        for route in all_routes:
            scored = score_route(route)
            if not scored:
                continue
            is_disrupted = route["id"] in disrupted_routes
            if req.accessibility:
                board_stop_data = next(
                    (s for s in all_stops if s["id"] == scored["board_stop"].get("id")), None
                )
                if board_stop_data and not board_stop_data.get("wheelchair"):
                    continue

            delay_pred = predict_delay(route["id"], hour, 0)
            travel_min = max(5, round(direct_dist * 3))
            total_min  = travel_min + delay_pred["minutes"] + round(scored["walk_km"] * 12)

            # Build a per-stop ETA timeline across the intermediate stops so the
            # commuter can see exactly what's coming up, not just board/alight.
            stops_between = scored["stops_between"]
            n_legs = max(1, len(stops_between) - 1)
            timeline = []
            for i, s in enumerate(stops_between):
                leg_progress = i / n_legs
                eta_at_stop = datetime.now() + timedelta(
                    minutes=round(scored["walk_km"] * 6) + travel_min * leg_progress + delay_pred["minutes"] * leg_progress
                )
                timeline.append({
                    "name": s["name"],
                    "lat": s["lat"],
                    "lng": s["lng"],
                    "eta": eta_at_stop.strftime("%H:%M"),
                    "is_board": i == 0,
                    "is_alight": i == len(stops_between) - 1,
                })

            options.append({
                "id":             route["id"],
                "route_name":     route["name"],
                "mode":           route["mode"],
                "color":          route["color"],
                "board_stop":     scored["board_stop"]["name"],
                "alight_stop":    scored["alight_stop"]["name"],
                "walk_to_board_km":  round(scored["walk_km"] / 2, 2),
                "walk_from_alight_km": round(scored["walk_km"] / 2, 2),
                "travel_minutes": travel_min,
                "total_minutes":  total_min,
                "delay_minutes":  delay_pred["minutes"],
                "delay_confidence": delay_pred["confidence"],
                "crowd_level":    predict_crowd(route["id"], hour, "low")["level"],
                "eta":            (datetime.now() + timedelta(minutes=total_min)).strftime("%H:%M"),
                "disrupted":      is_disrupted,
                "recommended":    not is_disrupted,
                "stop_count":     len(stops_between),
                "stops_timeline": timeline,
            })

        options.sort(key=lambda x: (x["disrupted"], x["total_minutes"]))

        # Auto re-route: if best option is disrupted, flag alternate
        alternate = None
        if options and options[0]["disrupted"] and len(options) > 1:
            alternate = options[1]
            alternate["is_alternate"] = True

        # Save journey
        supabase.table("journeys").insert({
            "origin_name": req.origin_name, "origin_lat": req.origin_lat, "origin_lng": req.origin_lng,
            "dest_name": req.dest_name, "dest_lat": req.dest_lat, "dest_lng": req.dest_lng,
            "route_plan": {"options": options[:3]}
        }).execute()

        return {
            "origin":     req.origin_name,
            "destination": req.dest_name,
            "distance_km": round(direct_dist, 2),
            "options":     options[:3],
            "alternate":   alternate,
            "has_disruption": len(disrupted_routes) > 0,
            "timestamp":   datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ─────────────────────────────────────────
# OPERATOR ROUTES
# ─────────────────────────────────────────

@app.get("/network/status")
async def network_status():
    try:
        vehicles = supabase.table("vehicles").select("*").execute().data or []
        alerts   = supabase.table("alerts").select("*").eq("active", True).execute().data or []
        incidents = supabase.table("incidents").select("*").neq("status", "resolved").execute().data or []
        delayed = [v for v in vehicles if v.get("delay_minutes", 0) > 0]
        return {
            "total_vehicles": len(vehicles),
            "delayed_vehicles": len(delayed),
            "active_alerts": len(alerts),
            "open_incidents": len(incidents),
            "network_health": "disrupted" if len(delayed) > 2 else "good",
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/network/lines")
async def network_lines():
    """Per-route live health — replaces any hardcoded line-status list on the frontend.
    Derives status straight from real vehicle delays + active disruption/cancellation alerts,
    so it always reflects the current state of your Supabase data, nothing static."""
    try:
        routes = supabase.table("routes").select("*").eq("active", True).execute().data or []
        vehicles = supabase.table("vehicles").select("*").execute().data or []
        alerts = supabase.table("alerts").select("*").eq("active", True).execute().data or []

        disrupted_route_ids = set()
        for a in alerts:
            if a.get("type") in ["disruption", "cancellation"]:
                disrupted_route_ids.update(a.get("route_ids", []))

        delayed_route_ids = set()
        for v in vehicles:
            if v.get("delay_minutes", 0) > 3:
                delayed_route_ids.add(v.get("route_id"))

        lines = []
        for r in routes:
            if r["id"] in disrupted_route_ids:
                status = "disruption"
            elif r["id"] in delayed_route_ids:
                status = "delay"
            else:
                status = "ok"
            lines.append({
                "id": r["id"],
                "name": r["name"],
                "mode": r["mode"],
                "color": r.get("color", "#14b8a6"),
                "status": status,
            })
        return {"lines": lines}
    except Exception as e:
        raise HTTPException(500, str(e))


class AlertBroadcast(BaseModel):
    type: str
    severity: str
    title: str
    message: str
    route_ids: List[str] = []


@app.post("/alert")
async def broadcast_alert(alert: AlertBroadcast):
    try:
        res = supabase.table("alerts").insert({
            "type": alert.type, "severity": alert.severity,
            "title": alert.title, "message": alert.message,
            "route_ids": alert.route_ids, "active": True,
        }).execute()
        await manager.broadcast({"type": "new_alert", "data": res.data[0] if res.data else {}})
        return {"success": True, "alert": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(500, str(e))


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    route_ids: List[str] = []
    severity: str = "medium"


@app.post("/incident")
async def create_incident(inc: IncidentCreate):
    try:
        res = supabase.table("incidents").insert({
            "title": inc.title, "description": inc.description,
            "route_ids": inc.route_ids, "severity": inc.severity, "status": "open",
        }).execute()
        return {"success": True, "incident": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/analytics")
async def get_analytics():
    try:
        vehicles  = supabase.table("vehicles").select("*").execute().data or []
        alerts    = supabase.table("alerts").select("*").execute().data or []
        incidents = supabase.table("incidents").select("*").execute().data or []
        on_time = len([v for v in vehicles if v.get("delay_minutes", 0) == 0])
        return {
            "on_time_percentage": round(on_time / max(len(vehicles), 1) * 100),
            "avg_delay_minutes":  round(sum(v.get("delay_minutes", 0) for v in vehicles) / max(len(vehicles), 1), 1),
            "total_alerts":       len(alerts),
            "total_incidents":    len(incidents),
            "vehicles_by_mode":   {
                "bus":   len([v for v in vehicles if v["mode"] == "bus"]),
                "metro": len([v for v in vehicles if v["mode"] == "metro"]),
                "train": len([v for v in vehicles if v["mode"] == "train"]),
            },
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/forecast")
async def get_forecast():
    hour = datetime.now().hour
    forecast = []
    for h in range(1, 5):
        future_hour = (hour + h) % 24
        peak = future_hour in [8, 9, 17, 18, 19]
        forecast.append({
            "hour": f"{future_hour:02d}:00",
            "demand": "high" if peak else "medium" if future_hour > 6 else "low",
            "expected_passengers": random.randint(800, 2000) if peak else random.randint(200, 800),
            "delay_risk": "high" if peak else "low",
        })
    return {"forecast": forecast}


# ─────────────────────────────────────────
# WEBSOCKET — live updates
# ─────────────────────────────────────────
@app.websocket("/updates")
async def websocket_updates(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Push simulated live vehicle position updates every 4 seconds
            vehicles_res = supabase.table("vehicles").select("*").execute()
            vehicles = vehicles_res.data or []
            # Simulate small position drift
            for v in vehicles:
                v["lat"] += random.uniform(-0.0005, 0.0005)
                v["lng"] += random.uniform(-0.0005, 0.0005)
            await websocket.send_json({
                "type":      "vehicle_positions",
                "vehicles":  vehicles,
                "timestamp": datetime.now().isoformat(),
            })
            await asyncio.sleep(4)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)