# BrainTrip - Travel Trivia & Itinerary Builder

## Overview
A travel app that lets users learn about destinations through trivia quizzes, discover real travel suggestions from external APIs, and build custom itineraries. Built with React + Express + PostgreSQL.

## Architecture
- **Frontend**: React with client-side state management via TripContext (no URL routing - uses screen state)
- **Backend**: Express API with OpenAI integration for quiz generation + Google Places API for real POI data
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-4o-mini for quiz generation and POI description enrichment)
- **External APIs**: Google Places Text Search API v1 (POI search, requires GOOGLE_PLACES_API_KEY), Nominatim (geocoding, free)

## Performance Architecture
- **Fast Path (Quiz)**: resolveCity + getCityContext + gpt-4o-mini trivia generation. Cold start ~8s, cached ~0.1s.
- **Fast Path (Suggestions)**: Google Places pool fetch + immediate return with placeholder text. ~1-2s.
- **Background Enrichment**: Per-POI AI enrichment via `/api/suggestions/enrich-poi`. Frontend calls with concurrency=2, updates items progressively. ~1s per POI.
- **No blocking**: Quiz and suggestions return immediately; enrichment happens after UI renders.

## Trivia Pipeline (Google Places + AI Grounded)
1. **resolveCity(cityText)**: Uses Google Places Text Search to resolve any city input into canonical label (e.g., "Springfield, IL, USA"), placeId, lat/lng, country, region. Cached 24h by cityText.
2. **getCityContext(placeId, cityLabel)**: Fetches 12-20 POIs via 2 parallel Google Places queries ("{city} top attractions landmarks", "{city} museums parks historical sites"). Dedupes by placeId. Cached 24h by placeId.
3. **AI Generation**: Sends POI list + city label to gpt-4o-mini with strict instructions to reference specific places. At least 60% of questions must reference a POI by name.
4. **Validation**: Filters generic questions (capital, currency, language patterns), ensures 4 unique options, correctIndex 0-3, concrete funFacts.
5. **Deduplication**: Hash-based questionId = hash(cityPlaceId + difficulty + questionText). Frontend stores seen IDs in localStorage (last 200 per city). Excluded IDs sent to backend. If pool exhausted, frontend clears seen IDs and shows "mastered city" toast.
6. **Fallback**: Curated questions for 5 major cities; generic city-specific fallback for unknown cities.

## Suggestions Pipeline (Google Places + Progressive AI Enrichment)
1. **Fast return**: 6 parallel Google Places Text Search queries (attractions, landmarks, museums, parks, restaurants, viewpoints). Deduplicate by placeId, filter generic names. Rank by popularity decile, guard outlier distances.
2. **Immediate render**: Top 5 results returned with `description: "Loading details..."` and empty funFact. Items with cached enrichment get real data immediately.
3. **Progressive enrichment**: Frontend calls `POST /api/suggestions/enrich-poi` for each unenriched POI, concurrency=2. As each returns, the corresponding suggestion updates in-place without reordering.
4. **Enrichment cache**: 30-day cache by placeId. Subsequent visits get instant enriched data.
5. **Fallback**: Curated data for 5 major cities (New York, Chicago, Paris, Rome, Tokyo).
6. **Load More**: Frontend sends excludePlaceIds + exclude titles for deduplication.

## App Flow
1. HOME -> City input, mode selection (Quiz/Planning), difficulty (Standard/Challenge), hotel input
2. LOADING -> Animated loading screen during API generation
3. QUIZ -> Multiple choice trivia about the city (if quiz mode)
4. QUIZ-RESULTS -> Score summary
5. SUGGESTIONS -> Real POI suggestions with progressive enrichment, distance from hotel, add-to-itinerary
6. ITINERARY -> Ordered list with reorder, undo/redo, custom spots, save
7. PROFILE -> Saved trips list

## Key Files
- `shared/schema.ts` - Database models (trips, tripSpots) and Zod schemas; Suggestion/QuizQuestion types
- `server/routes.ts` - All API endpoints, resolveCity/getCityContext, Google Places/Nominatim integration, enrichment cache, curated fallbacks
- `server/storage.ts` - Database CRUD operations
- `server/db.ts` - Database connection
- `client/src/lib/tripContext.tsx` - App state management with undo/redo, updateSuggestion for progressive enrichment
- `client/src/pages/loading.tsx` - Loading screen with quiz/suggestion fetch, question ID persistence
- `client/src/pages/suggestions.tsx` - Suggestions page with progressive enrichment via concurrency-limited fetch pool
- `client/src/hooks/use-distance-calculator.ts` - Distance calculation with direct lat/lng + geocode fallback
- `client/src/pages/` - All page components
- `client/src/components/theme-provider.tsx` - Dark mode toggle

## API Endpoints
- POST /api/quiz/generate - Generate grounded quiz questions. Accepts { city, difficulty, count, excludeQuestionIds, cityPlaceId?, cityLabel? }. Returns { questions, questionIds, cityLabel, cityPlaceId, poolExhausted }. When cityPlaceId is provided, skips resolveCity and uses it directly for POI context.
- POST /api/suggestions/generate - Fast POI return (no AI blocking). Returns { suggestions } with placeholder descriptions for unenriched items.
- POST /api/suggestions/enrich-poi - Enrich a single POI with AI description + fun fact. Accepts { city, name, category, address, placeId }. Returns { name, placeId, description, funFact }. Uses 30-day cache.
- POST /api/geocode - Geocode an address to lat/lng
- GET/POST/DELETE /api/trips - Trip CRUD. Trips now persist cityLabel and cityPlaceId for reliable Continue Trivia.
- POST /api/trips/:id/spots - Add spots to existing trip

## Difficulty Levels
- Standard: Accessible, interesting trivia
- Challenge: Deep, nuanced questions for experienced travelers

## Distance Feature
- Uses Haversine formula for distance calculations
- Suggestions with lat/lng skip geocoding (direct calculation)
- Falls back to Nominatim geocoding for places without coordinates
- First 5 suggestions auto-calculate, rest on-demand
- Results cached in localStorage

## Question Uniqueness
- Hash-based questionId: hash(cityPlaceId + difficulty + questionText)
- Server returns questionIds array alongside questions
- Frontend stores seen IDs in localStorage per city (last 200)
- Sent as excludeQuestionIds on quiz generation
- Pool exhaustion: if >30 excluded and <4 returned, frontend clears and starts fresh

## Caching Strategy
- City resolve: 24h cache by cityText (Map in-memory)
- City POI context: 24h cache by placeId (Map in-memory)
- Trivia pool: 24h cache by (cityPlaceId + difficulty) (Map in-memory)
- Suggestions pool: 1h cache by city name (Map in-memory)
- POI enrichment: 30d cache by placeId (Map in-memory)
- Geocode results: Indefinite cache (Map in-memory)

## Environment
- Uses Replit AI Integrations for OpenAI (no user API key needed)
- Google Places API via GOOGLE_PLACES_API_KEY
- PostgreSQL database via DATABASE_URL
- Session secret via SESSION_SECRET

## Design
- Primary color: Teal (hsl 173 58% 39%)
- Font: Plus Jakarta Sans
- Mobile-first responsive design
- Dark mode support
