/**
 * SAFAR — Frontend API client
 * Talks to the real FastAPI backend (main.py) for everything: journey planning,
 * live transit + ML predictions, stops, alerts, and network health.
 * No client-side mock/random data, no duplicate logic — the backend is the
 * single source of truth.
 */

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = API.replace(/^http/, "ws") + "/updates";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─────────────────────────────────────────
// STOPS  (powers the From/To selectors — fully dynamic, no hardcoded list)
// ─────────────────────────────────────────

export async function getStops() {
  const res = await fetch(`${API}/stops`);
  return handle(res); // { stops: Stop[], count }
}

// ─────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────

export async function getAlerts() {
  const res = await fetch(`${API}/alerts`);
  const data = await handle(res);
  return { alerts: data.alerts ?? [] };
}

export async function broadcastAlert({ type, severity, title, message, route_ids = [] }) {
  const res = await fetch(`${API}/alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, severity, title, message, route_ids }),
  });
  return handle(res);
}

// ─────────────────────────────────────────
// LIVE TRANSIT  (map) — includes real ML delay/eta/crowd predictions per vehicle
// ─────────────────────────────────────────

export async function getLiveTransit() {
  const res = await fetch(`${API}/transit/live`);
  const data = await handle(res);
  return { vehicles: data.vehicles ?? [] };
}

/**
 * Opens the real backend WebSocket (/updates) for live vehicle position pushes
 * every ~4s, straight from FastAPI — not a client-side polling loop.
 * Falls back to short-interval polling only if the socket can't connect at all
 * (e.g. dev environment without the WS route reachable), so the UI never goes
 * fully dark, but the live path is always the real socket first.
 *
 * Returns { close }.
 */
export function createLiveSocket(onMessage) {
  let socket = null;
  let pollId = null;
  let closed = false;
  let reconnectAttempts = 0;

  function startPollingFallback() {
    if (pollId || closed) return;
    pollId = setInterval(async () => {
      try {
        const { vehicles } = await getLiveTransit();
        onMessage({ type: "vehicle_positions", vehicles });
      } catch {
        // swallow — UI keeps last known state
      }
    }, 8000);
  }

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(WS_URL);

      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          onMessage(msg);
        } catch {
          // ignore malformed frame
        }
      };

      socket.onopen = () => {
        reconnectAttempts = 0;
        if (pollId) { clearInterval(pollId); pollId = null; }
      };

      socket.onclose = () => {
        if (closed) return;
        reconnectAttempts += 1;
        if (reconnectAttempts <= 5) {
          setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
        } else {
          startPollingFallback();
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    } catch {
      startPollingFallback();
    }
  }

  connect();

  return {
    close: () => {
      closed = true;
      socket?.close();
      if (pollId) clearInterval(pollId);
    },
  };
}

// ─────────────────────────────────────────
// JOURNEY PLANNER — real ML-backed planning via FastAPI POST /journey/plan
// ─────────────────────────────────────────

/**
 * Plan a journey between two named lat/lng points.
 * Delegates entirely to the backend's /journey/plan endpoint, which scores
 * routes against live Supabase data, applies delay/crowd ML predictions,
 * detects disruptions from active alerts, and auto-suggests a re-route
 * alternate. No client-side route generation or randomization.
 *
 * @param {{ origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng, accessibility }} params
 */
export async function planJourney({
  origin_name,
  origin_lat,
  origin_lng,
  dest_name,
  dest_lat,
  dest_lng,
  accessibility = false,
}) {
  const res = await fetch(`${API}/journey/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin_name, origin_lat, origin_lng,
      dest_name, dest_lat, dest_lng,
      accessibility,
    }),
  });
  return handle(res);
  // → { origin, destination, distance_km, options, alternate, has_disruption, timestamp }
}

// ─────────────────────────────────────────
// NETWORK HEALTH (operator + commuter sidebar)
// ─────────────────────────────────────────

export async function getNetworkStatus() {
  const res = await fetch(`${API}/network/status`);
  return handle(res); // { total_vehicles, delayed_vehicles, active_alerts, open_incidents, network_health }
}

/** Per-route live status — replaces any hardcoded line list in the UI. */
export async function getNetworkLines() {
  const res = await fetch(`${API}/network/lines`);
  return handle(res); // { lines: [{ id, name, mode, color, status }] }
}

// ─────────────────────────────────────────
// ANALYTICS + FORECAST (operator dashboard)
// ─────────────────────────────────────────

export async function getAnalytics() {
  const res = await fetch(`${API}/analytics`);
  return handle(res);
}

export async function getForecast() {
  const res = await fetch(`${API}/forecast`);
  return handle(res);
}

// ─────────────────────────────────────────
// INCIDENTS (operator dashboard)
// ─────────────────────────────────────────

export async function createIncident({ title, description, route_ids = [], severity = "medium" }) {
  const res = await fetch(`${API}/incident`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, route_ids, severity }),
  });
  return handle(res);
}

// ─────────────────────────────────────────
// PER-VEHICLE ETA (used for a "track this vehicle" detail view, if added)
// ─────────────────────────────────────────

export async function getVehicleEta(vehicle_id) {
  const res = await fetch(`${API}/eta?vehicle_id=${encodeURIComponent(vehicle_id)}`);
  return handle(res);
}

// ─────────────────────────────────────────
// ML SERVICES
// ─────────────────────────────────────────

export async function getMLDepartureAdvice({
  origin_name,
  dest_name,
  target_eta_mins,
  walk_to_station_mins,
}) {
  const res = await fetch(`${API}/forecast`);
  return handle(res);
}

export async function getMLCrowdForecast({ route_id, date }) {
  const res = await fetch(
    `${API}/ml/crowd-forecast?route_id=${encodeURIComponent(route_id)}&date=${date}`
  );

  return handle(res);
}

export async function getWeather({ lat, lng }) {
  const res = await fetch(
    `${API}/weather?lat=${lat}&lng=${lng}`
  );

  return handle(res);
}