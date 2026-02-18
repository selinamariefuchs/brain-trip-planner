import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTripSchema, insertTripSpotSchema, quizQuestionSchema, suggestionSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function safeJsonParse(text: string): any {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function shuffleOptions(q: any): any {
  const correctAnswer = q.options[q.correctIndex];
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const shuffled = indices.map((i) => q.options[i]);
  return {
    ...q,
    options: shuffled,
    correctIndex: shuffled.indexOf(correctAnswer),
  };
}

function validateQuestions(questions: any[]): any[] {
  return questions
    .filter((q) => {
      try {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) return false;
        if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) return false;
        const uniqueOpts = new Set(q.options.map((o: string) => o.toLowerCase().trim()));
        if (uniqueOpts.size !== 4) return false;
        if (!q.funFact || q.funFact.trim().length < 5) return false;
        return true;
      } catch {
        return false;
      }
    })
    .map(shuffleOptions);
}

function checkAnswerDistribution(questions: any[]): boolean {
  if (questions.length < 4) return true;
  const allZero = questions.every((q) => q.correctIndex === 0);
  if (allZero) {
    console.error(
      `[quiz-distribution] All ${questions.length} questions have correctAnswerIndex=0. Triggering reshuffle.`
    );
    return false;
  }
  return true;
}

function validateSuggestions(suggestions: any[], excludeTitles: string[] = [], excludePlaceIds: string[] = []): any[] {
  const titleSet = new Set(excludeTitles.map((t) => t.toLowerCase().trim()));
  const placeIdSet = new Set(excludePlaceIds.filter(Boolean));
  const seen = new Set<string>();

  return suggestions.filter((s) => {
    try {
      if (!s.title || !s.description || !s.category) return false;
      const key = s.title.toLowerCase().trim();
      if (titleSet.has(key) || seen.has(key)) return false;
      if (s.placeId && placeIdSet.has(s.placeId)) return false;
      seen.add(key);
      return true;
    } catch {
      return false;
    }
  });
}

interface ResolvedCity {
  cityLabel: string;
  placeId: string;
  lat: number;
  lng: number;
  country: string;
  region: string;
}

interface CityContextPOI {
  placeId: string;
  name: string;
  types: string[];
  rating: number;
  userRatingsTotal: number;
}

interface CityContext {
  cityLabel: string;
  placeId: string;
  pois: CityContextPOI[];
}

const cityResolveCache = new Map<string, { data: ResolvedCity; ts: number }>();
const cityContextCache = new Map<string, { data: CityContext; ts: number }>();
const CITY_CACHE_TTL = 24 * 60 * 60 * 1000;

const triviaPoolCache = new Map<string, { questions: any[]; ts: number }>();
const TRIVIA_POOL_TTL = 24 * 60 * 60 * 1000;

const enrichmentCache = new Map<string, { data: { description: string; funFact: string }; ts: number }>();
const ENRICHMENT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

async function resolveCity(cityText: string): Promise<ResolvedCity | null> {
  const cacheKey = cityText.toLowerCase().trim();
  const cached = cityResolveCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CITY_CACHE_TTL) return cached.data;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents",
      },
      body: JSON.stringify({
        textQuery: cityText,
        pageSize: 1,
        languageCode: "en",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.places || data.places.length === 0) return null;

    const place = data.places[0];
    const addr = place.formattedAddress || cityText;
    const parts = addr.split(",").map((s: string) => s.trim());

    let country = "";
    let region = "";
    if (place.addressComponents) {
      for (const comp of place.addressComponents) {
        if (comp.types?.includes("country")) country = comp.longText || comp.shortText || "";
        if (comp.types?.includes("administrative_area_level_1")) region = comp.longText || comp.shortText || "";
      }
    }
    if (!country && parts.length >= 2) country = parts[parts.length - 1];
    if (!region && parts.length >= 3) region = parts[parts.length - 2];

    const cityLabel = parts.length >= 2 ? parts.slice(0, Math.min(parts.length, 3)).join(", ") : addr;

    const resolved: ResolvedCity = {
      cityLabel,
      placeId: place.id || "",
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0,
      country,
      region,
    };

    cityResolveCache.set(cacheKey, { data: resolved, ts: Date.now() });
    return resolved;
  } catch (err) {
    console.error("resolveCity error:", err);
    return null;
  }
}

async function getCityContext(placeId: string, cityLabel: string): Promise<CityContext> {
  const cached = cityContextCache.get(placeId);
  if (cached && Date.now() - cached.ts < CITY_CACHE_TTL) return cached.data;

  const shortName = cityLabel.split(",")[0].trim();
  const queries = [
    `${shortName} top attractions landmarks`,
    `${shortName} museums parks historical sites`,
  ];

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { cityLabel, placeId, pois: [] };

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.types,places.rating,places.userRatingCount",
          },
          body: JSON.stringify({ textQuery: query, pageSize: 10, languageCode: "en" }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.places || []).map((p: any) => ({
          placeId: p.id || "",
          name: p.displayName?.text || "",
          types: p.types || [],
          rating: p.rating || 0,
          userRatingsTotal: p.userRatingCount || 0,
        }));
      } catch {
        return [];
      }
    })
  );

  const deduped = new Map<string, CityContextPOI>();
  for (const poi of results.flat()) {
    if (poi.name && poi.name.length >= 3 && !deduped.has(poi.placeId)) {
      deduped.set(poi.placeId, poi);
    }
  }

  const pois = Array.from(deduped.values()).slice(0, 20);
  const ctx: CityContext = { cityLabel, placeId, pois };
  cityContextCache.set(placeId, { data: ctx, ts: Date.now() });
  return ctx;
}

function generateQuestionId(cityPlaceId: string, difficulty: string, questionText: string): string {
  const raw = `${cityPlaceId}|${difficulty}|${questionText}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function validateTriviaQuestions(questions: any[], poiNames: string[]): any[] {
  const poiNamesLower = poiNames.map(n => n.toLowerCase());

  const GENERIC_PATTERNS = [
    /what is the capital/i,
    /which currency/i,
    /what language.*spoken/i,
    /what continent/i,
    /what is the population/i,
    /which country.*located/i,
  ];

  return questions
    .filter((q) => {
      try {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) return false;
        if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) return false;
        const uniqueOpts = new Set(q.options.map((o: string) => o.toLowerCase().trim()));
        if (uniqueOpts.size !== 4) return false;
        if (!q.funFact || q.funFact.trim().length < 5) return false;
        for (const pat of GENERIC_PATTERNS) {
          if (pat.test(q.question)) return false;
        }
        return true;
      } catch {
        return false;
      }
    })
    .map(shuffleOptions);
}

function countPOIReferences(questions: any[], poiNames: string[]): number {
  const poiNamesLower = poiNames.map(n => n.toLowerCase());
  let count = 0;
  for (const q of questions) {
    const qLower = q.question.toLowerCase();
    const allText = qLower + " " + q.options.map((o: string) => o.toLowerCase()).join(" ");
    if (poiNamesLower.some(name => allText.includes(name.toLowerCase()))) {
      count++;
    }
  }
  return count;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/quiz/generate", async (req, res) => {
    try {
      const { city, difficulty = "standard", count = 8, excludeQuestionIds = [], cityPlaceId: providedPlaceId, cityLabel: providedLabel } = req.body;

      if (!city || typeof city !== "string") {
        return res.status(400).json({ error: "City is required" });
      }

      let cityLabel = providedLabel || city;
      let cityPlaceId = providedPlaceId || "";
      let poiNames: string[] = [];
      let poiContext = "";

      if (cityPlaceId) {
        const context = await getCityContext(cityPlaceId, cityLabel);
        poiNames = context.pois.map(p => p.name);
        if (context.pois.length > 0) {
          poiContext = `\nREAL PLACES in ${cityLabel} (use these as question topics):\n${context.pois.map(p => `- ${p.name} (rating: ${p.rating}, reviews: ${p.userRatingsTotal})`).join("\n")}`;
        }
      } else {
        const resolved = await resolveCity(city);
        if (resolved) {
          cityLabel = resolved.cityLabel;
          cityPlaceId = resolved.placeId;
          const context = await getCityContext(resolved.placeId, cityLabel);
          poiNames = context.pois.map(p => p.name);
          if (context.pois.length > 0) {
            poiContext = `\nREAL PLACES in ${cityLabel} (use these as question topics):\n${context.pois.map(p => `- ${p.name} (rating: ${p.rating}, reviews: ${p.userRatingsTotal})`).join("\n")}`;
          }
        }
      }

      const excludeSet = new Set(Array.isArray(excludeQuestionIds) ? excludeQuestionIds : []);
      const requestCount = excludeSet.size > 10 ? Math.min(count * 2, 16) : count;

      const difficultyGuide: Record<string, string> = {
        standard: "Fun, accessible questions that most travelers would know. Mix of well-known landmarks, popular foods, and interesting cultural facts. All options should be plausible.",
        challenge: "Challenging questions for experienced travelers. Include nuanced historical details, local customs, and specific facts. All distractors must be highly plausible and tricky.",
      };

      const excludeNote = excludeSet.size > 0
        ? `\nDo NOT repeat these previously asked question hashes: ${Array.from(excludeSet).slice(0, 30).join(", ")}`
        : "";

      const poiRequirement = poiNames.length > 0
        ? `\nCRITICAL: At least ${Math.ceil(requestCount * 0.6)} of your ${requestCount} questions MUST directly reference a specific place from the REAL PLACES list above by its exact name. Ask about its history, founding year, architect, dimensions, records, unique features, or hidden details. The remaining questions can cover local food, culture, geography, or traditions specific to ${cityLabel}.`
        : "";

      const prompt = `Generate exactly ${requestCount} trivia questions about ${cityLabel} for a travel quiz app.
${poiContext}

Difficulty: ${difficulty}
${difficultyGuide[difficulty] || difficultyGuide.standard}
${excludeNote}
${poiRequirement}

CRITICAL RULES:
- Each question MUST have exactly 4 unique answer options
- correctIndex MUST be 0, 1, 2, or 3 (the index of the correct answer)
- Options must all be plausible - no obviously fake answers
- funFact must be exactly 1 interesting sentence with a concrete detail (year, number, measurement)
- No duplicate questions
- No trick questions
- NO generic questions like "What is the capital?", "Which currency?", "What language is spoken?"
- Questions must be SPECIFIC to ${cityLabel} — they should not apply to any other city
- Cover diverse topics: specific landmarks, local food, history, architecture, traditions, geography
${poiNames.length > 0 ? `- When referencing places from the list, use their EXACT names` : ""}

IMPORTANT: Vary the correctIndex across questions. Do NOT always put the correct answer first.

Return ONLY a JSON array:
[
  {
    "question": "What is...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 2,
    "funFact": "A specific fact with a year, number, or measurement."
  }
]`;

      const triviaCacheKey = `${cityPlaceId || city.toLowerCase()}|${difficulty}`;
      const cachedTrivia = triviaPoolCache.get(triviaCacheKey);
      let allQuestions: any[] = [];
      let triviaSource = "openai";

      console.log(`TRIVIA_GENERATE { city: "${city}", cityLabel: "${cityLabel}", cityPlaceId: "${cityPlaceId}", difficulty: "${difficulty}", cacheKey: "${triviaCacheKey}", hasCityPlaceId: ${!!providedPlaceId} }`);

      if (cachedTrivia && Date.now() - cachedTrivia.ts < TRIVIA_POOL_TTL && cachedTrivia.questions.length > 0) {
        allQuestions = cachedTrivia.questions;
        triviaSource = "cache";
      } else {
        if (cachedTrivia && cachedTrivia.questions.length === 0) {
          triviaPoolCache.delete(triviaCacheKey);
        }
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 4000,
        });

        const content = response.choices[0]?.message?.content || "";
        let parsed = safeJsonParse(content);
        if (!Array.isArray(parsed)) parsed = parsed?.questions || [];

        allQuestions = validateTriviaQuestions(parsed, poiNames);

        if (allQuestions.length >= 4) {
          triviaPoolCache.set(triviaCacheKey, { questions: allQuestions, ts: Date.now() });
        }
      }

      let questions = allQuestions;

      if (cityPlaceId) {
        questions = questions.filter(q => {
          const qId = generateQuestionId(cityPlaceId, difficulty, q.question);
          return !excludeSet.has(qId);
        });
      }

      if (questions.length < Math.min(count, 4) && triviaSource === "cache" && cityPlaceId) {
        console.log(`TRIVIA_CACHE_EXHAUSTED: All cached questions excluded, regenerating from OpenAI`);
        triviaPoolCache.delete(triviaCacheKey);
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 4000,
        });
        const content = response.choices[0]?.message?.content || "";
        let parsed = safeJsonParse(content);
        if (!Array.isArray(parsed)) parsed = parsed?.questions || [];
        const freshQuestions = validateTriviaQuestions(parsed, poiNames);
        if (freshQuestions.length >= 4) {
          triviaPoolCache.set(triviaCacheKey, { questions: freshQuestions, ts: Date.now() });
        }
        questions = freshQuestions.filter(q => {
          const qId = generateQuestionId(cityPlaceId, difficulty, q.question);
          return !excludeSet.has(qId);
        });
        if (questions.length === 0) {
          questions = freshQuestions;
        }
        triviaSource = "openai";
      }

      if (questions.length < Math.min(count, 4)) {
        if (!cityPlaceId) {
          const fallback = getFallbackQuestions(city);
          if (fallback.length > questions.length) {
            questions = fallback.map(shuffleOptions);
            triviaSource = "fallback";
          }
        }
      }

      if (!checkAnswerDistribution(questions)) {
        questions = questions.map(shuffleOptions);
      }

      const final = questions.slice(0, count);

      const questionIds: string[] = [];
      if (cityPlaceId) {
        for (const q of final) {
          questionIds.push(generateQuestionId(cityPlaceId, difficulty, q.question));
        }
      }

      const poolExhausted = excludeSet.size > 30 && final.length < Math.min(count, 4);

      console.log(`TRIVIA_RESULT { source: "${triviaSource}", questions: ${final.length}, cityLabel: "${cityLabel}", cityPlaceId: "${cityPlaceId}" }`);

      res.json({
        questions: final,
        questionIds,
        cityLabel,
        cityPlaceId: cityPlaceId || undefined,
        poolExhausted,
        source: triviaSource,
      });
    } catch (error: any) {
      console.error("Quiz generation error:", error);
      const city = req.body?.city || "the city";
      const reqCityPlaceId = req.body?.cityPlaceId;
      if (reqCityPlaceId) {
        res.status(503).json({
          error: "Quiz generation temporarily unavailable. Please try again.",
          questions: [],
          questionIds: [],
          poolExhausted: false,
          source: "error",
        });
      } else {
        res.json({
          questions: getFallbackQuestions(city).map(shuffleOptions),
          questionIds: [],
          poolExhausted: false,
          source: "fallback",
        });
      }
    }
  });

  app.post("/api/suggestions/generate", async (req, res) => {
    try {
      const { city, hotelLocation, exclude = [], excludePlaceIds = [] } = req.body;

      if (!city || typeof city !== "string") {
        return res.status(400).json({ error: "City is required" });
      }

      const excludeTitles = (exclude as string[]);
      const excludePids = (excludePlaceIds as string[]);

      let hotelCoords: { lat: number; lng: number } | null = null;
      if (hotelLocation && typeof hotelLocation === "string") {
        hotelCoords = await geocodeCached(`${hotelLocation}, ${city}`);
        if (!hotelCoords) {
          hotelCoords = await geocodeCached(hotelLocation);
        }
      }

      const pool = await fetchGooglePlacesPool(city);

      if (pool.length === 0) {
        const fallback = getCuratedFallback(city);
        const filtered = validateSuggestions(fallback, excludeTitles, excludePids);
        return res.json({ suggestions: filtered.slice(0, 5) });
      }

      let ranked = pool.map((p) => {
        const distKm = hotelCoords ? haversineKm(hotelCoords.lat, hotelCoords.lng, p.lat, p.lng) : null;
        const popScore = (p.rating || 0) * Math.log10((p.userRatingCount || 0) + 1);
        return { ...p, distanceKm: distKm, popularityScore: popScore };
      });

      if (hotelCoords) {
        ranked = ranked.filter((p) => p.distanceKm === null || p.distanceKm <= 100);
      }

      const popValues = ranked.map((p) => p.popularityScore).sort((a, b) => a - b);
      const getBucket = (score: number) => {
        const idx = popValues.findIndex((v) => v >= score);
        return Math.floor(((idx === -1 ? popValues.length : idx) / popValues.length) * 10);
      };

      ranked.sort((a, b) => {
        const bucketA = getBucket(a.popularityScore);
        const bucketB = getBucket(b.popularityScore);
        if (bucketB !== bucketA) return bucketB - bucketA;
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        return 0;
      });

      const titleExcludeSet = new Set(excludeTitles.map((t) => t.toLowerCase().trim()));
      const pidExcludeSet = new Set(excludePids.filter(Boolean));
      const available = ranked.filter((p) => {
        if (titleExcludeSet.has(p.title.toLowerCase().trim())) return false;
        if (p.placeId && pidExcludeSet.has(p.placeId)) return false;
        return true;
      });

      const batch = available.slice(0, 5);

      if (batch.length === 0) {
        const fallback = getCuratedFallback(city);
        const filtered = validateSuggestions(fallback, excludeTitles, excludePids);
        return res.json({ suggestions: filtered.slice(0, 5) });
      }

      const suggestions = batch.map((p) => {
        const cached = enrichmentCache.get(p.placeId);
        const hasCache = cached && Date.now() - cached.ts < ENRICHMENT_CACHE_TTL;
        return {
          title: p.title,
          description: hasCache ? cached.data.description : "Loading details\u2026",
          category: p.category,
          funFact: hasCache ? cached.data.funFact : "",
          address: p.address,
          placeId: p.placeId,
          lat: p.lat,
          lng: p.lng,
          enriched: !!hasCache,
        };
      });

      const validated = validateSuggestions(suggestions, excludeTitles, excludePids);
      res.json({ suggestions: validated });
    } catch (error: any) {
      console.error("Suggestions generation error:", error);
      const city = req.body?.city || "the city";
      res.json({ suggestions: getCuratedFallback(city).slice(0, 5) });
    }
  });

  app.post("/api/suggestions/enrich-poi", async (req, res) => {
    try {
      const { city, name, category, address, placeId } = req.body;
      if (!name || !city) {
        return res.status(400).json({ error: "name and city are required" });
      }

      if (placeId) {
        const cached = enrichmentCache.get(placeId);
        if (cached && Date.now() - cached.ts < ENRICHMENT_CACHE_TTL) {
          return res.json({
            name,
            placeId,
            description: cached.data.description,
            funFact: cached.data.funFact,
          });
        }
      }

      const prompt = `You are a travel encyclopedia. For the place "${name}" in ${city} (category: ${category || "Landmark"}${address ? `, address: ${address}` : ""}):

1. Write a 1-2 sentence description of why it's worth visiting (factual, no marketing).
2. One lesser-known factual detail — a historical date, architectural record, hidden feature, or measurable statistic. 12-25 words, one sentence, must contain a year/number/proper noun.

STRICT: No marketing words like "popular", "must-visit", "perfect for", "great place", "well-known".

Return ONLY JSON:
{"description":"...","funFact":"..."}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "";
      const parsed = safeJsonParse(content);

      const description = parsed?.description || `A ${(category || "landmark").toLowerCase()} in ${city}.`;
      const funFact = parsed?.funFact && isValidFunFact(parsed.funFact) ? parsed.funFact : "";

      if (placeId) {
        enrichmentCache.set(placeId, { data: { description, funFact }, ts: Date.now() });
      }

      res.json({ name, placeId, description, funFact });
    } catch (error: any) {
      console.error("POI enrichment error:", error);
      const { name, city, category } = req.body || {};
      res.json({
        name: name || "",
        placeId: req.body?.placeId || "",
        description: `A ${(category || "landmark").toLowerCase()} in ${city || "the city"}.`,
        funFact: "",
      });
    }
  });

  app.get("/api/trips", async (_req, res) => {
    try {
      const trips = await storage.getTrips();
      res.json(trips);
    } catch (error) {
      console.error("Error fetching trips:", error);
      res.status(500).json({ error: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const trip = await storage.getTrip(id);
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const spots = await storage.getTripSpots(id);
      res.json({ ...trip, spots });
    } catch (error) {
      console.error("Error fetching trip:", error);
      res.status(500).json({ error: "Failed to fetch trip" });
    }
  });

  app.post("/api/trips", async (req, res) => {
    try {
      const { spots, ...tripData } = req.body;

      const trip = await storage.createTrip({
        city: tripData.city,
        cityLabel: tripData.cityLabel || null,
        cityPlaceId: tripData.cityPlaceId || null,
        hotelLocation: tripData.hotelLocation || null,
        mode: tripData.mode || "quiz",
        difficulty: tripData.difficulty || "standard",
        score: tripData.score ?? null,
        totalQuestions: tripData.totalQuestions ?? null,
      });

      if (Array.isArray(spots) && spots.length > 0) {
        const spotRecords = spots.map((s: any, idx: number) => ({
          tripId: trip.id,
          title: s.title,
          description: s.description || "",
          category: s.category || "Other",
          imageUrl: s.imageUrl || null,
          funFact: s.funFact || null,
          address: s.address || null,
          placeId: s.placeId || null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          sortOrder: s.sortOrder ?? idx,
        }));
        await storage.addTripSpots(spotRecords);
      }

      res.status(201).json(trip);
    } catch (error) {
      console.error("Error creating trip:", error);
      res.status(500).json({ error: "Failed to save trip" });
    }
  });

  app.post("/api/trips/:id/spots", async (req, res) => {
    try {
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const { spots } = req.body;
      if (!Array.isArray(spots) || spots.length === 0) {
        return res.status(400).json({ error: "Spots array is required" });
      }

      const existingSpots = await storage.getTripSpots(tripId);
      const existingTitles = new Set(existingSpots.map((s) => s.title.toLowerCase().trim()));
      const maxOrder = existingSpots.reduce((max, s) => Math.max(max, s.sortOrder), -1);

      const newSpots = spots
        .filter((s: any) => !existingTitles.has(s.title?.toLowerCase().trim()))
        .map((s: any, idx: number) => ({
          tripId,
          title: s.title,
          description: s.description || "",
          category: s.category || "Other",
          imageUrl: s.imageUrl || null,
          funFact: s.funFact || null,
          address: s.address || null,
          placeId: s.placeId || null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          sortOrder: maxOrder + 1 + idx,
        }));

      if (newSpots.length === 0) {
        return res.json({ added: 0, spots: existingSpots });
      }

      const addedSpots = await storage.addTripSpots(newSpots);
      const allSpots = await storage.getTripSpots(tripId);
      res.json({ added: addedSpots.length, spots: allSpots });
    } catch (error) {
      console.error("Error adding spots:", error);
      res.status(500).json({ error: "Failed to add spots" });
    }
  });

  app.patch("/api/trips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const trip = await storage.getTrip(id);
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const updates: Record<string, any> = {};
      if (req.body.score !== undefined) updates.score = req.body.score;
      if (req.body.totalQuestions !== undefined) updates.totalQuestions = req.body.totalQuestions;
      if (req.body.hotelLocation !== undefined) updates.hotelLocation = req.body.hotelLocation;

      if (Object.keys(updates).length > 0) {
        await storage.updateTrip(id, updates);
      }

      const updated = await storage.getTrip(id);
      const spots = await storage.getTripSpots(id);
      res.json({ ...updated, spots });
    } catch (error) {
      console.error("Error updating trip:", error);
      res.status(500).json({ error: "Failed to update trip" });
    }
  });

  app.delete("/api/trips/:id/spots/:spotId", async (req, res) => {
    try {
      const spotId = parseInt(req.params.spotId);
      await storage.deleteTripSpot(spotId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting spot:", error);
      res.status(500).json({ error: "Failed to delete spot" });
    }
  });

  app.delete("/api/trips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrip(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting trip:", error);
      res.status(500).json({ error: "Failed to delete trip" });
    }
  });

  const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ error: "Address is required" });
      }

      const cacheKey = address.toLowerCase().trim();
      if (geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey);
        if (cached) return res.json(cached);
        return res.status(404).json({ error: "Location not found" });
      }

      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        q: address,
        format: "json",
        limit: "1",
      })}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        headers: { "User-Agent": "BrainTrip/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        geocodeCache.set(cacheKey, null);
        return res.status(404).json({ error: "Location not found" });
      }

      const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
      geocodeCache.set(cacheKey, coords);
      res.json(coords);
    } catch (error: any) {
      if (error.name === "AbortError") {
        return res.status(504).json({ error: "Geocoding timed out" });
      }
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Geocoding failed" });
    }
  });

  return httpServer;
}

const CURATED_QUESTIONS: Record<string, any[]> = {
  "new york": [
    { question: "What year was the Statue of Liberty dedicated?", options: ["1876", "1886", "1896", "1906"], correctIndex: 1, funFact: "The statue was a gift from France to the United States." },
    { question: "Which borough of New York is the most populous?", options: ["Manhattan", "Queens", "Brooklyn", "The Bronx"], correctIndex: 2, funFact: "Brooklyn would be the fourth-largest city in the US if it were independent." },
    { question: "What was Times Square originally called?", options: ["Herald Square", "Longacre Square", "Madison Square", "Union Square"], correctIndex: 1, funFact: "It was renamed in 1904 after The New York Times moved its headquarters there." },
    { question: "How long is the Brooklyn Bridge?", options: ["1,825 feet", "3,460 feet", "5,989 feet", "8,120 feet"], correctIndex: 2, funFact: "When completed in 1883, it was the longest suspension bridge in the world." },
    { question: "Which park is the largest in Manhattan?", options: ["Central Park", "Riverside Park", "Inwood Hill Park", "Battery Park"], correctIndex: 0, funFact: "Central Park spans 843 acres and was the first public park in America." },
    { question: "What style of pizza is New York famous for?", options: ["Deep dish", "Thin crust foldable slices", "Sicilian square", "Stuffed crust"], correctIndex: 1, funFact: "New York-style pizza is characterized by its large, foldable slices with a thin, crispy crust." },
    { question: "Which museum has the Temple of Dendur?", options: ["MoMA", "The Met", "Guggenheim", "Whitney"], correctIndex: 1, funFact: "The temple is over 2,000 years old and was gifted by Egypt in 1965." },
    { question: "How many islands make up New York City?", options: ["1", "3", "5", "Over 40"], correctIndex: 3, funFact: "NYC sits on over 40 islands, including Manhattan, Staten Island, and Roosevelt Island." },
  ],
  paris: [
    { question: "In what year was the Eiffel Tower completed?", options: ["1879", "1889", "1899", "1909"], correctIndex: 1, funFact: "The tower was built for the 1889 World's Fair and was initially criticized by many Parisians." },
    { question: "How many artworks does the Louvre house?", options: ["38,000", "100,000", "280,000", "Over 380,000"], correctIndex: 3, funFact: "It would take about 200 days to see every piece spending 30 seconds on each." },
    { question: "What river runs through Paris?", options: ["Rhine", "Loire", "Seine", "Danube"], correctIndex: 2, funFact: "The Seine divides Paris into the Left Bank and Right Bank." },
    { question: "When did construction of Notre-Dame begin?", options: ["963 AD", "1063 AD", "1163 AD", "1263 AD"], correctIndex: 2, funFact: "It took nearly 200 years to complete the cathedral." },
    { question: "What keeps Sacre-Coeur white?", options: ["Annual painting", "Calcite in the stone", "Marble cladding", "Regular bleaching"], correctIndex: 1, funFact: "The stone exudes calcite when it rains, naturally whitening the basilica." },
    { question: "Who created the Jardin du Luxembourg?", options: ["Louis XIV", "Napoleon", "Marie de Medici", "Baron Haussmann"], correctIndex: 2, funFact: "The gardens were inspired by the Boboli Gardens in Florence." },
    { question: "Which arrondissement is the Latin Quarter in?", options: ["1st", "5th", "10th", "16th"], correctIndex: 1, funFact: "It is called the Latin Quarter because Latin was the language of learning there for centuries." },
    { question: "How tall is the Eiffel Tower?", options: ["224 meters", "270 meters", "330 meters", "400 meters"], correctIndex: 2, funFact: "The tower grows about 15 cm taller in summer due to thermal expansion of the iron." },
  ],
  rome: [
    { question: "How many spectators could the Colosseum hold?", options: ["25,000", "50,000", "80,000", "120,000"], correctIndex: 1, funFact: "The Colosseum could even be flooded for mock naval battles." },
    { question: "Who painted the Sistine Chapel ceiling?", options: ["Leonardo da Vinci", "Raphael", "Michelangelo", "Caravaggio"], correctIndex: 2, funFact: "Michelangelo painted it while standing, not lying on his back as commonly believed." },
    { question: "How much money is thrown into the Trevi Fountain daily?", options: ["About 300 euros", "About 1,000 euros", "About 3,000 euros", "About 10,000 euros"], correctIndex: 2, funFact: "The collected coins are donated to Caritas, a Catholic charity." },
    { question: "What is the hole at the top of the Pantheon called?", options: ["Cupola", "Oculus", "Rotunda", "Atrium"], correctIndex: 1, funFact: "The oculus is the Pantheon's only source of natural light and lets in rain and sunlight." },
    { question: "What does 'Trastevere' mean?", options: ["Old town", "Beyond the Tiber", "Holy ground", "Market place"], correctIndex: 1, funFact: "Trastevere was historically home to Rome's working class." },
    { question: "How old is the Pantheon approximately?", options: ["1,000 years", "1,500 years", "2,000 years", "2,500 years"], correctIndex: 2, funFact: "It has the world's largest unreinforced concrete dome, a feat of ancient engineering." },
    { question: "Which hill is NOT one of the seven hills of Rome?", options: ["Palatine", "Aventine", "Capitoline", "Vatican"], correctIndex: 3, funFact: "Vatican Hill is west of the Tiber and was not part of the original seven hills." },
    { question: "What is a traditional Roman pasta dish?", options: ["Pesto Genovese", "Cacio e Pepe", "Bolognese", "Puttanesca"], correctIndex: 1, funFact: "Cacio e Pepe means 'cheese and pepper' and uses just three ingredients." },
  ],
  tokyo: [
    { question: "How old is Senso-ji Temple?", options: ["About 500 years", "About 900 years", "About 1,400 years", "About 2,000 years"], correctIndex: 2, funFact: "Senso-ji was founded in 645 AD, making it Tokyo's oldest temple." },
    { question: "How many trees are in Meiji Shrine's forest?", options: ["10,000", "50,000", "120,000", "300,000"], correctIndex: 2, funFact: "All 120,000 trees were donated from across Japan when the shrine was built." },
    { question: "How many people cross Shibuya Crossing at once?", options: ["500", "1,000", "3,000", "5,000"], correctIndex: 2, funFact: "It is often called 'The Scramble' and is one of the most filmed locations in the world." },
    { question: "What was the original name of Tokyo?", options: ["Osaka", "Kyoto", "Edo", "Nara"], correctIndex: 2, funFact: "Edo was renamed Tokyo, meaning 'Eastern Capital,' in 1868." },
    { question: "Why is Tokyo Tower painted orange and white?", options: ["Cultural tradition", "Aviation safety", "Imperial decree", "Artistic choice"], correctIndex: 1, funFact: "The colors comply with international aviation safety regulations." },
    { question: "When did Shinjuku Gyoen open to the public?", options: ["1889", "1919", "1949", "1969"], correctIndex: 2, funFact: "It was originally a private garden for the Imperial family." },
    { question: "What is the busiest train station in the world?", options: ["Tokyo Station", "Shibuya Station", "Shinjuku Station", "Ikebukuro Station"], correctIndex: 2, funFact: "Shinjuku Station handles over 3.5 million passengers daily." },
    { question: "Which traditional market moved to Toyosu?", options: ["Ameyoko", "Tsukiji inner market", "Nakamise", "Omotesando"], correctIndex: 1, funFact: "The outer market at Tsukiji still operates with over 400 shops." },
  ],
  chicago: [
    { question: "What is Cloud Gate commonly known as?", options: ["The Mirror", "The Bean", "The Drop", "The Orb"], correctIndex: 1, funFact: "Cloud Gate is made of 168 stainless steel plates welded together with no visible seams." },
    { question: "When was Willis Tower the world's tallest building?", options: ["1963-1988", "1973-1998", "1983-2008", "1993-2010"], correctIndex: 1, funFact: "Willis Tower held the record for 25 years until the Petronas Towers surpassed it." },
    { question: "What color is the Chicago River dyed on St. Patrick's Day?", options: ["Blue", "Orange", "Green", "Gold"], correctIndex: 2, funFact: "The tradition of dyeing the river green has been going on since 1962." },
    { question: "What style of pizza is Chicago famous for?", options: ["Thin crust", "Deep dish", "Neapolitan", "Flatbread"], correctIndex: 1, funFact: "Deep dish pizza was invented at Pizzeria Uno in Chicago in 1943." },
    { question: "When was Navy Pier originally built?", options: ["1896", "1906", "1916", "1926"], correctIndex: 2, funFact: "Navy Pier served as a Navy training center during World War II." },
    { question: "What is Chicago's nickname?", options: ["The Big Apple", "The Windy City", "Motor City", "The Gateway"], correctIndex: 1, funFact: "The nickname may refer to boastful politicians rather than actual wind." },
    { question: "Which famous architect designed many buildings in Chicago?", options: ["Frank Gehry", "Frank Lloyd Wright", "I.M. Pei", "Zaha Hadid"], correctIndex: 1, funFact: "Wright's Home and Studio in Oak Park is one of Chicago's most visited landmarks." },
    { question: "What body of water borders Chicago?", options: ["Lake Erie", "Lake Huron", "Lake Michigan", "Lake Superior"], correctIndex: 2, funFact: "Chicago's lakefront trail stretches 18 miles along the shores of Lake Michigan." },
  ],
};

function getFallbackQuestions(city: string) {
  const key = city.toLowerCase().trim();
  for (const [name, questions] of Object.entries(CURATED_QUESTIONS)) {
    if (key.includes(name) || name.includes(key)) {
      return questions;
    }
  }
  return [
    { question: `What is a common way to explore ${city}?`, options: ["Walking tour", "Submarine ride", "Private helicopter", "Hot air balloon"], correctIndex: 0, funFact: "Walking tours are one of the best ways to discover hidden gems in any city." },
    { question: `What should travelers try when visiting ${city}?`, options: ["Local cuisine", "Only chain restaurants", "Only hotel food", "Packaged snacks"], correctIndex: 0, funFact: "Trying local food is often the highlight of any trip." },
    { question: `Which is the best way to learn about ${city}'s culture?`, options: ["Visit local museums", "Stay at the hotel", "Only read guidebooks", "Watch TV"], correctIndex: 0, funFact: "Museums offer fascinating insights into a city's culture and heritage." },
    { question: `What makes ${city} a popular travel destination?`, options: ["Rich history and culture", "Free hotels", "No other cities nearby", "Mandatory visits"], correctIndex: 0, funFact: "Cities with diverse cultural offerings tend to attract the most visitors." },
    { question: `What is often found in ${city}'s historic districts?`, options: ["Traditional architecture", "Only modern buildings", "Empty lots", "Parking garages"], correctIndex: 0, funFact: "Historic districts preserve the architectural heritage that tells a city's story." },
  ];
}

interface PlacePOI {
  name: string;
  lat: number;
  lng: number;
  category: string;
  address?: string;
  placeId?: string;
  rating?: number;
  userRatingCount?: number;
}

interface GooglePlaceResult {
  title: string;
  lat: number;
  lng: number;
  category: string;
  address?: string;
  placeId: string;
  rating: number;
  userRatingCount: number;
}

const GENERIC_NAMES = new Set([
  "city center", "main park", "central park", "downtown", "town square",
  "main street", "high street", "market", "the park", "the mall",
  "church", "old town", "bus station", "train station", "airport",
]);

const poolCache = new Map<string, { places: GooglePlaceResult[]; ts: number }>();
const POOL_CACHE_TTL = 60 * 60 * 1000;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const geocodeInternalCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeCached(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = address.toLowerCase().trim();
  if (geocodeInternalCache.has(key)) return geocodeInternalCache.get(key) || null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: address,
      format: "json",
      limit: "1",
    })}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { "User-Agent": "BrainTrip/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      geocodeInternalCache.set(key, null);
      return null;
    }
    const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    geocodeInternalCache.set(key, coords);
    return coords;
  } catch {
    geocodeInternalCache.set(key, null);
    return null;
  }
}

function mapGoogleCategory(types: string[]): string {
  const typeSet = new Set(types);
  if (typeSet.has("museum") || typeSet.has("art_gallery")) return "Culture";
  if (typeSet.has("restaurant") || typeSet.has("cafe") || typeSet.has("bakery") || typeSet.has("bar") || typeSet.has("meal_takeaway")) return "Food";
  if (typeSet.has("park") || typeSet.has("natural_feature") || typeSet.has("campground")) return "Nature";
  if (typeSet.has("shopping_mall") || typeSet.has("store") || typeSet.has("clothing_store") || typeSet.has("department_store")) return "Shopping";
  if (typeSet.has("amusement_park") || typeSet.has("stadium") || typeSet.has("movie_theater") || typeSet.has("night_club")) return "Entertainment";
  if (typeSet.has("church") || typeSet.has("hindu_temple") || typeSet.has("mosque") || typeSet.has("synagogue") || typeSet.has("place_of_worship")) return "Landmark";
  if (typeSet.has("tourist_attraction") || typeSet.has("point_of_interest") || typeSet.has("establishment")) return "Landmark";
  return "Landmark";
}

async function fetchGooglePlacesTextSearch(query: string): Promise<GooglePlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types",
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 20,
        languageCode: "en",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`Google Places API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    if (!data.places || !Array.isArray(data.places)) return [];

    return data.places
      .filter((p: any) => {
        const name = p.displayName?.text;
        if (!name || name.length < 3) return false;
        if (GENERIC_NAMES.has(name.toLowerCase().trim())) return false;
        return true;
      })
      .map((p: any) => ({
        title: p.displayName.text,
        lat: p.location?.latitude || 0,
        lng: p.location?.longitude || 0,
        category: mapGoogleCategory(p.types || []),
        address: p.formattedAddress || "",
        placeId: p.id || "",
        rating: p.rating || 0,
        userRatingCount: p.userRatingCount || 0,
      }));
  } catch (error) {
    console.error("Google Places Text Search error:", error);
    return [];
  }
}

async function fetchGooglePlacesPool(city: string): Promise<GooglePlaceResult[]> {
  const cacheKey = city.toLowerCase().trim();
  const cached = poolCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < POOL_CACHE_TTL) {
    return cached.places;
  }

  const queries = [
    `top attractions in ${city}`,
    `best landmarks in ${city}`,
    `best museums in ${city}`,
    `best parks and gardens in ${city}`,
    `best restaurants in ${city}`,
    `best viewpoints in ${city}`,
  ];

  const results = await Promise.all(queries.map((q) => fetchGooglePlacesTextSearch(q)));
  const all = results.flat();

  const deduped = new Map<string, GooglePlaceResult>();
  for (const place of all) {
    if (!deduped.has(place.placeId)) {
      deduped.set(place.placeId, place);
    }
  }

  const places = Array.from(deduped.values());
  poolCache.set(cacheKey, { places, ts: Date.now() });
  return places;
}

const BANNED_FUNFACT_PHRASES = [
  "popular spot",
  "notable",
  "destination",
  "must-visit",
  "must visit",
  "perfect for",
  "great place",
  "visitors",
  "atmosphere",
  "a popular",
  "well-known",
  "well known",
  "famous for being",
  "worth a visit",
  "must-see",
  "must see",
];

function isValidFunFact(fact: string): boolean {
  if (!fact || fact.length < 10) return false;
  const lower = fact.toLowerCase();
  for (const phrase of BANNED_FUNFACT_PHRASES) {
    if (lower.includes(phrase)) return false;
  }
  const words = fact.split(/\s+/).filter(Boolean);
  if (words.length < 12 || words.length > 25) return false;
  const sentences = fact.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 1) return false;
  const hasNumber = /\b\d{1,}/.test(fact);
  const hasYear = /\b(1[0-9]{3}|2[0-9]{3})\b/.test(fact);
  const hasMeasurement = /\b\d+[\s-]?(meter|metre|foot|feet|ton|kilo|mile|acre|year|centur|inch|pound|hectare|square|cubic)/i.test(fact);
  const hasProperNoun = /\b[A-Z][a-z]{2,}\b/.test(fact.slice(fact.indexOf(" ") + 1));
  return hasNumber || hasYear || hasMeasurement || hasProperNoun;
}

const CURATED_PLACES: Record<string, any[]> = {
  "new york": [
    { title: "Central Park", description: "An iconic 843-acre urban oasis in the heart of Manhattan, perfect for walks, boat rides, and people-watching.", category: "Nature", funFact: "Central Park was the first public park in America, designed by Olmsted and Vaux in 1858.", address: "Central Park, New York, NY", lat: 40.7829, lng: -73.9654 },
    { title: "The Metropolitan Museum of Art", description: "One of the world's largest art museums with over 2 million works spanning 5,000 years of history.", category: "Culture", funFact: "The Met's collection includes an entire Egyptian temple, the Temple of Dendur.", address: "1000 5th Ave, New York, NY 10028", lat: 40.7794, lng: -73.9632 },
    { title: "Statue of Liberty", description: "A colossal neoclassical sculpture on Liberty Island, a universal symbol of freedom and democracy.", category: "Landmark", funFact: "The Statue of Liberty was a gift from France, dedicated in 1886.", address: "Liberty Island, New York, NY 10004", lat: 40.6892, lng: -74.0445 },
    { title: "Times Square", description: "The dazzling commercial intersection known for its bright lights, Broadway theaters, and vibrant energy.", category: "Entertainment", funFact: "Times Square was originally called Longacre Square before being renamed in 1904.", address: "Manhattan, NY 10036", lat: 40.758, lng: -73.9855 },
    { title: "Brooklyn Bridge", description: "A historic suspension bridge connecting Manhattan and Brooklyn with stunning skyline views.", category: "Landmark", funFact: "When completed in 1883, the Brooklyn Bridge was the longest suspension bridge in the world.", address: "Brooklyn Bridge, New York, NY 10038", lat: 40.7061, lng: -73.9969 },
    { title: "Joe's Pizza", description: "A legendary Greenwich Village pizza spot serving classic New York slices since 1975.", category: "Food", funFact: "Joe's Pizza gained extra fame after appearing in Spider-Man 2.", address: "7 Carmine St, New York, NY 10014", lat: 40.7306, lng: -74.0021 },
  ],
  chicago: [
    { title: "Millennium Park", description: "A stunning lakefront park featuring Cloud Gate (The Bean), Crown Fountain, and beautiful gardens.", category: "Landmark", funFact: "Cloud Gate is made of 168 stainless steel plates welded together with no visible seams.", address: "201 E Randolph St, Chicago, IL 60602", lat: 41.8827, lng: -87.6233 },
    { title: "Art Institute of Chicago", description: "One of the oldest and largest art museums in the United States, home to iconic Impressionist works.", category: "Culture", funFact: "The museum's collection includes Grant Wood's American Gothic and Seurat's A Sunday on La Grande Jatte.", address: "111 S Michigan Ave, Chicago, IL 60603", lat: 41.8796, lng: -87.6237 },
    { title: "Willis Tower Skydeck", description: "Offers breathtaking views from 1,353 feet up, including the famous glass-floor Ledge experience.", category: "Landmark", funFact: "Willis Tower was the tallest building in the world from 1973 to 1998.", address: "233 S Wacker Dr, Chicago, IL 60606", lat: 41.8789, lng: -87.6359 },
    { title: "Navy Pier", description: "A 3,300-foot pier on Lake Michigan featuring rides, restaurants, shops, and stunning lakefront views.", category: "Entertainment", funFact: "Navy Pier was originally built in 1916 and served as a Navy training center during WWII.", address: "600 E Grand Ave, Chicago, IL 60611", lat: 41.8917, lng: -87.6086 },
    { title: "Chicago Riverwalk", description: "A pedestrian waterfront path along the Chicago River with dining, kayaking, and architectural views.", category: "Nature", funFact: "The Chicago River is famously dyed green every St. Patrick's Day.", address: "Chicago Riverwalk, Chicago, IL", lat: 41.8882, lng: -87.6198 },
    { title: "Lou Malnati's Pizzeria", description: "Iconic deep-dish pizza destination that has been a Chicago institution since 1971.", category: "Food", funFact: "Lou Malnati's uses a butter crust recipe that has remained unchanged since opening.", address: "439 N Wells St, Chicago, IL 60654", lat: 41.8905, lng: -87.6340 },
  ],
  paris: [
    { title: "Eiffel Tower", description: "The iconic iron lattice tower offering panoramic views of Paris from three observation levels.", category: "Landmark", funFact: "The Eiffel Tower was originally intended to be dismantled after 20 years.", address: "Champ de Mars, 5 Av. Anatole France, 75007 Paris", lat: 48.8584, lng: 2.2945 },
    { title: "Louvre Museum", description: "The world's largest art museum, home to the Mona Lisa and over 380,000 objects.", category: "Culture", funFact: "It would take 200 days to see every piece in the Louvre if you spent 30 seconds on each.", address: "Rue de Rivoli, 75001 Paris", lat: 48.8606, lng: 2.3376 },
    { title: "Notre-Dame Cathedral", description: "A medieval Catholic cathedral known for its French Gothic architecture and stunning rose windows.", category: "Landmark", funFact: "Construction of Notre-Dame began in 1163 and took nearly 200 years to complete.", address: "6 Parvis Notre-Dame, 75004 Paris", lat: 48.853, lng: 2.3499 },
    { title: "Sacre-Coeur Basilica", description: "A stunning white-domed basilica atop Montmartre hill with sweeping views of the city.", category: "Landmark", funFact: "Sacre-Coeur's stone exudes calcite when it rains, keeping the basilica perpetually white.", address: "35 Rue du Chevalier de la Barre, 75018 Paris", lat: 48.8867, lng: 2.3431 },
    { title: "Jardin du Luxembourg", description: "Beautiful formal gardens perfect for leisurely strolls, with fountains, statues, and a palace.", category: "Nature", funFact: "The gardens were created in 1612 by Marie de Medici, inspired by the Boboli Gardens in Florence.", address: "Rue de Medicis, 75006 Paris", lat: 48.8462, lng: 2.3372 },
    { title: "Le Comptoir du Pantheon", description: "A charming Parisian brasserie near the Pantheon serving classic French cuisine.", category: "Food", funFact: "The Latin Quarter where this restaurant sits has been the center of Parisian academic life since the Middle Ages.", address: "5 Rue Soufflot, 75005 Paris", lat: 48.8463, lng: 2.3461 },
  ],
  rome: [
    { title: "Colosseum", description: "The largest ancient amphitheater ever built, once hosting gladiatorial contests for 50,000 spectators.", category: "Landmark", funFact: "The Colosseum could be filled with water for mock naval battles called naumachiae.", address: "Piazza del Colosseo, 1, 00184 Roma", lat: 41.8902, lng: 12.4922 },
    { title: "Vatican Museums", description: "A vast collection of art and historical artifacts, culminating in the breathtaking Sistine Chapel.", category: "Culture", funFact: "Michelangelo painted the Sistine Chapel ceiling while standing, not lying on his back.", address: "Viale Vaticano, 00165 Roma", lat: 41.9065, lng: 12.4536 },
    { title: "Trevi Fountain", description: "Rome's most famous baroque fountain where visitors toss coins to ensure a return to the city.", category: "Landmark", funFact: "About 3,000 euros are thrown into the Trevi Fountain every day.", address: "Piazza di Trevi, 00187 Roma", lat: 41.9009, lng: 12.4833 },
    { title: "Pantheon", description: "A remarkably preserved 2,000-year-old Roman temple with the world's largest unreinforced concrete dome.", category: "Landmark", funFact: "The Pantheon's dome has an open hole (oculus) at the top that lets in rain and sunlight.", address: "Piazza della Rotonda, 00186 Roma", lat: 41.8986, lng: 12.4769 },
    { title: "Trastevere", description: "A charming medieval neighborhood with cobblestone streets, authentic trattorias, and vibrant nightlife.", category: "Food", funFact: "Trastevere means 'beyond the Tiber' and was historically home to Rome's working class.", address: "Trastevere, Roma", lat: 41.8869, lng: 12.4693 },
    { title: "Villa Borghese Gardens", description: "Rome's third-largest public park with museums, a lake, and beautiful landscaped gardens.", category: "Nature", funFact: "The park contains the Borghese Gallery, which houses works by Bernini, Caravaggio, and Raphael.", address: "Piazzale Napoleone I, 00197 Roma", lat: 41.9142, lng: 12.4853 },
  ],
  tokyo: [
    { title: "Senso-ji Temple", description: "Tokyo's oldest and most significant Buddhist temple, located in the colorful Asakusa district.", category: "Culture", funFact: "Senso-ji was founded in 645 AD, making it nearly 1,400 years old.", address: "2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032", lat: 35.7148, lng: 139.7967 },
    { title: "Meiji Shrine", description: "A serene Shinto shrine surrounded by a lush forest, dedicated to Emperor Meiji and Empress Shoken.", category: "Culture", funFact: "The shrine's forest contains 120,000 trees donated from all over Japan.", address: "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557", lat: 35.6764, lng: 139.6993 },
    { title: "Shibuya Crossing", description: "The world's busiest pedestrian crossing, where up to 3,000 people cross simultaneously.", category: "Landmark", funFact: "Shibuya Crossing is often called 'The Scramble' and appears in countless films.", address: "Shibuya, Tokyo 150-0041", lat: 35.6595, lng: 139.7004 },
    { title: "Tsukiji Outer Market", description: "A bustling marketplace offering the freshest sushi, street food, and Japanese culinary delights.", category: "Food", funFact: "While the inner wholesale market moved to Toyosu, the outer market retains over 400 shops.", address: "4 Chome-16-2 Tsukiji, Chuo City, Tokyo 104-0045", lat: 35.6654, lng: 139.7707 },
    { title: "Shinjuku Gyoen", description: "A spacious national garden blending Japanese, English, and French landscaping styles.", category: "Nature", funFact: "Shinjuku Gyoen was originally a private garden for the Imperial family before opening to the public in 1949.", address: "11 Naitomachi, Shinjuku City, Tokyo 160-0014", lat: 35.6852, lng: 139.71 },
    { title: "Tokyo Tower", description: "An iconic communications and observation tower inspired by the Eiffel Tower, with sweeping city views.", category: "Landmark", funFact: "Tokyo Tower is painted in white and international orange to comply with aviation safety regulations.", address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo 105-0011", lat: 35.6586, lng: 139.7454 },
  ],
};

function getCuratedFallback(city: string): any[] {
  const key = city.toLowerCase().trim();
  for (const [name, places] of Object.entries(CURATED_PLACES)) {
    if (key.includes(name) || name.includes(key)) return places;
  }
  return [];
}
