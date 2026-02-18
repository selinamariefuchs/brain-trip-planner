import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Coords {
  lat: number;
  lng: number;
}

interface DistanceEntry {
  distance: string | null;
  status: "idle" | "calculating" | "done" | "error";
}

const CACHE_KEY_PREFIX = "braintrip_dist_";
const COORDS_CACHE_KEY = "braintrip_coords_";
const MAX_CONCURRENCY = 2;

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function getCachedCoords(address: string): Coords | null {
  try {
    const raw = localStorage.getItem(COORDS_CACHE_KEY + address.toLowerCase().trim());
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setCachedCoords(address: string, coords: Coords) {
  try {
    localStorage.setItem(COORDS_CACHE_KEY + address.toLowerCase().trim(), JSON.stringify(coords));
  } catch {}
}

function makePlaceId(title: string, address: string): string {
  return (title + "::" + address).toLowerCase().trim();
}

function getCachedDistance(hotelKey: string, placeId: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + hotelKey + "|" + placeId);
    if (raw) return raw;
  } catch {}
  return null;
}

function setCachedDistance(hotelKey: string, placeId: string, dist: string) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + hotelKey + "|" + placeId, dist);
  } catch {}
}

async function geocode(address: string): Promise<Coords | null> {
  const cached = getCachedCoords(address);
  if (cached) return cached;

  try {
    const res = await apiRequest("POST", "/api/geocode", { address });
    if (!res.ok) return null;
    const coords: Coords = await res.json();
    setCachedCoords(address, coords);
    return coords;
  } catch {
    return null;
  }
}

export function useDistanceCalculator(
  hotelLocation: string,
  suggestions: { title: string; address?: string; lat?: number | null; lng?: number | null }[]
) {
  const [distances, setDistances] = useState<Record<string, DistanceEntry>>({});
  const hotelCoordsRef = useRef<Coords | null>(null);
  const hotelResolvedRef = useRef(false);
  const activeRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    hotelCoordsRef.current = null;
    hotelResolvedRef.current = false;
    setDistances({});
    queueRef.current = [];
    processingRef.current.clear();
    activeRef.current = 0;
  }, [hotelLocation]);

  const resolveHotel = useCallback(async (): Promise<Coords | null> => {
    if (hotelResolvedRef.current) return hotelCoordsRef.current;
    const coords = await geocode(hotelLocation);
    hotelCoordsRef.current = coords;
    hotelResolvedRef.current = true;
    return coords;
  }, [hotelLocation]);

  const computeOne = useCallback(
    async (key: string, address: string, directCoords?: Coords | null) => {
      if (!mountedRef.current) return;

      const hotelKey = hotelLocation.toLowerCase().trim();
      const placeId = makePlaceId(key, address);
      const cached = getCachedDistance(hotelKey, placeId);
      if (cached) {
        setDistances((prev) => ({
          ...prev,
          [key]: { distance: cached, status: "done" },
        }));
        return;
      }

      setDistances((prev) => ({
        ...prev,
        [key]: { distance: null, status: "calculating" },
      }));

      try {
        const hotelCoords = await resolveHotel();
        if (!hotelCoords || !mountedRef.current) {
          setDistances((prev) => ({
            ...prev,
            [key]: { distance: null, status: "error" },
          }));
          return;
        }

        const placeCoords = directCoords || (await geocode(address));
        if (!placeCoords || !mountedRef.current) {
          setDistances((prev) => ({
            ...prev,
            [key]: { distance: null, status: "error" },
          }));
          return;
        }

        const km = haversineKm(hotelCoords, placeCoords);
        const formatted = formatDistance(km);
        setCachedDistance(hotelKey, placeId, formatted);

        if (mountedRef.current) {
          setDistances((prev) => ({
            ...prev,
            [key]: { distance: formatted, status: "done" },
          }));
        }
      } catch {
        if (mountedRef.current) {
          setDistances((prev) => ({
            ...prev,
            [key]: { distance: null, status: "error" },
          }));
        }
      }
    },
    [hotelLocation, resolveHotel]
  );

  const processQueue = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      if (processingRef.current.has(next)) continue;

      const suggestion = suggestions.find((s) => s.title === next);
      if (!suggestion?.address) continue;

      const directCoords = (suggestion.lat != null && suggestion.lng != null)
        ? { lat: suggestion.lat, lng: suggestion.lng }
        : null;

      processingRef.current.add(next);
      activeRef.current++;

      computeOne(next, suggestion.address, directCoords).finally(() => {
        activeRef.current--;
        processingRef.current.delete(next);
        if (mountedRef.current) processQueue();
      });
    }
  }, [suggestions, computeOne]);

  const requestDistance = useCallback(
    (title: string) => {
      if (!hotelLocation || processingRef.current.has(title)) return;
      const existing = distances[title];
      if (existing && existing.status !== "idle") return;

      const suggestion = suggestions.find((s) => s.title === title);
      if (!suggestion?.address) return;

      queueRef.current.push(title);
      processQueue();
    },
    [hotelLocation, distances, suggestions, processQueue]
  );

  useEffect(() => {
    if (!hotelLocation) return;

    const first5 = suggestions.slice(0, 5).filter((s) => s.address);
    for (const s of first5) {
      const existing = distances[s.title];
      if (!existing || existing.status === "idle") {
        if (!queueRef.current.includes(s.title) && !processingRef.current.has(s.title)) {
          queueRef.current.push(s.title);
        }
      }
    }
    processQueue();
  }, [hotelLocation, suggestions, processQueue]);

  const getDistance = useCallback(
    (title: string): DistanceEntry => {
      return distances[title] || { distance: null, status: "idle" };
    },
    [distances]
  );

  return { getDistance, requestDistance, hasHotel: !!hotelLocation };
}
