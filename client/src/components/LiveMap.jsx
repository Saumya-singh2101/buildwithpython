/**
 * LiveMap — Free satellite-style map (Esri World Imagery + labels) + Leaflet
 * No API key required. Sleek, minimal vehicle markers — Uber/Ola style, not cartoonish.
 *
 * Usage:
 *   <LiveMap vehicles={vehicles} center={[19.0760, 72.8777]} zoom={12} height={420} />
 *
 * `vehicles` shape (flexible, matches your Supabase rows):
 *   { id, lat, lng, mode: "bus"|"metro"|"train", routes: { name, mode, color }, delay_minutes, crowd_level, heading }
 */
import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MODE_COLOR = { bus: "#f97316", metro: "#a855f7", train: "#14b8a6" };
const MODE_LABEL = { bus: "BUS", metro: "METRO", train: "TRAIN" };

const DEFAULT_CENTER = [19.0760, 72.8777]; // Mumbai

/* Sleek directional marker — a soft rounded chevron/dot, not an emoji-in-circle.
   Rotates to `heading` if provided, otherwise sits as a clean glowing dot. */
function buildIcon(mode, delayed, heading) {
  const color = MODE_COLOR[mode] || "#14b8a6";
  const hasHeading = typeof heading === "number";

  const html = hasHeading
    ? `
      <div style="
        width:22px;height:22px;
        transform:rotate(${heading}deg);
        filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));
      ">
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="9" fill="${color}" opacity="0.18"/>
          <path d="M11 2 L17 16 L11 13 L5 16 Z" fill="${color}" stroke="rgba(13,27,42,0.9)" stroke-width="1"/>
        </svg>
        ${delayed ? `<div style="position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#ef4444;border:1.5px solid #0d1b2a;"></div>` : ""}
      </div>
    `
    : `
      <div style="position:relative;width:20px;height:20px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">
        <div style="
          position:absolute;inset:0;border-radius:50%;
          background:${color};opacity:0.16;
          transform:scale(1.8);
        "></div>
        <div style="
          position:absolute;inset:0;margin:auto;width:11px;height:11px;top:4.5px;left:4.5px;
          border-radius:50%;background:${color};
          border:1.5px solid rgba(13,27,42,0.85);
        "></div>
        ${delayed ? `<div style="position:absolute;top:-1px;right:-1px;width:6px;height:6px;border-radius:50%;background:#ef4444;border:1px solid #0d1b2a;"></div>` : ""}
      </div>
    `;

  return L.divIcon({
    className: "safar-vehicle-marker",
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

/* Smoothly re-center map when center prop changes (e.g. user picks a new origin) */
function RecenterOnChange({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

/* Esri World Imagery — real satellite photography, free, no API key.
   Paired with a reference/labels overlay so street names + transit context are legible. */
const SAT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, USGS, USDA";

const LABELS_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/* Subtle dark scrim over the satellite imagery so teal UI markers / popups stay legible
   and the whole thing reads as a moody "ops console" map rather than a raw photo. */
const SCRIM_STYLE = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(13,27,42,0.35) 0%, rgba(13,27,42,0.15) 40%, rgba(13,27,42,0.45) 100%)",
  pointerEvents: "none",
  zIndex: 2,
};

export default function LiveMap({
  vehicles = [],
  center = DEFAULT_CENTER,
  zoom = 12,
  height = 420,
  routeLine = null,      // optional [[lat,lng], [lat,lng], ...] to draw a planned route
  highlightStops = [],   // optional [{lat, lng, name}] for origin/dest pins
  borderRadius = 16,
}) {
  const icons = useMemo(() => {
    const cache = {};
    return (mode, delayed, heading) => {
      const key = `${mode}-${delayed}-${heading ?? "n"}`;
      if (!cache[key]) cache[key] = buildIcon(mode, delayed, heading);
      return cache[key];
    };
  }, []);

  const stopIcon = useMemo(
    () =>
      L.divIcon({
        className: "safar-stop-marker",
        html: `<div style="
          width:13px;height:13px;border-radius:50%;
          background:#f0fafa;border:2.5px solid #14b8a6;
          box-shadow:0 0 6px rgba(20,184,166,0.7);
        "></div>`,
        iconSize: [13, 13],
        iconAnchor: [6.5, 6.5],
      }),
    []
  );

  return (
    <div style={{ height, width: "100%", borderRadius, overflow: "hidden", position: "relative" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", background: "#0d1b2a" }}
        zoomControl={true}
        attributionControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer url={SAT_TILE_URL} attribution={SAT_ATTR} maxZoom={19} />
        <TileLayer url={LABELS_TILE_URL} maxZoom={19} opacity={0.85} />

        <RecenterOnChange center={center} zoom={zoom} />

        {routeLine && routeLine.length > 1 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#14b8a6", weight: 3, opacity: 0.85, dashArray: "1,8", lineCap: "round" }}
          />
        )}

        {highlightStops.map((s, i) => (
          <Marker key={`stop-${i}`} position={[s.lat, s.lng]} icon={stopIcon}>
            <Popup>
              <strong>{s.name}</strong>
            </Popup>
          </Marker>
        ))}

        {vehicles.map((v) => {
          const lat = v.lat ?? v.latitude;
          const lng = v.lng ?? v.longitude;
          if (lat == null || lng == null) return null;
          const mode = v.mode || v.routes?.mode || "bus";
          const delayed = (v.delay_minutes ?? 0) > 5;
          return (
            <Marker
              key={v.id || v.vehicle_id}
              position={[lat, lng]}
              icon={icons(mode, delayed, v.heading)}
            >
              <Popup>
                <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {v.routes?.name || v.route_name || "Route"}
                  </div>
                  <div style={{ color: "#666", fontSize: 11, letterSpacing: "0.04em" }}>
                    {MODE_LABEL[mode]} · {v.vehicle_id || v.id}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {v.delay_minutes > 0 ? (
                      <span style={{ color: "#dc2626", fontWeight: 600 }}>+{v.delay_minutes} min delay</span>
                    ) : (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>On time</span>
                    )}
                  </div>
                  {v.crowd_level && (
                    <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                      Crowd: {v.crowd_level}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Cinematic dark scrim so the UI feels like a real-time ops console, not a raw satellite photo */}
      <div style={SCRIM_STYLE} />
    </div>
  );
}
