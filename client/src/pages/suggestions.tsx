import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTrip } from "@/lib/tripContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDistanceCalculator } from "@/hooks/use-distance-calculator";
import type { Suggestion } from "@shared/schema";
import type { ItineraryItem } from "@/lib/tripContext";
import {
  ArrowLeft,
  Plus,
  Check,
  ChevronRight,
  Lightbulb,
  MapPin,
  Loader2,
  RefreshCw,
  Utensils,
  Camera,
  Landmark,
  ShoppingBag,
  Trees,
  Music,
  Star,
  Navigation,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ICONS: Record<string, typeof Utensils> = {
  food: Utensils,
  restaurant: Utensils,
  dining: Utensils,
  photography: Camera,
  photo: Camera,
  landmark: Landmark,
  history: Landmark,
  historical: Landmark,
  museum: Landmark,
  shopping: ShoppingBag,
  market: ShoppingBag,
  nature: Trees,
  park: Trees,
  outdoor: Trees,
  garden: Trees,
  entertainment: Music,
  nightlife: Music,
  culture: Star,
  art: Star,
};

function getCategoryIcon(category: string) {
  const lower = category.toLowerCase();
  for (const [key, Icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return MapPin;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  restaurant: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  landmark: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  history: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  nature: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  park: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  shopping: "bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300",
  culture: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
  art: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
  entertainment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
};

function getCategoryColor(category: string): string {
  const lower = category.toLowerCase();
  for (const [key, cls] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return "bg-muted text-muted-foreground";
}

async function enrichPool<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

export default function SuggestionsPage() {
  const trip = useTrip();
  const { toast } = useToast();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreDisabled, setLoadMoreDisabled] = useState(false);
  const enrichingRef = useRef(new Set<string>());
  const { getDistance, requestDistance, hasHotel } = useDistanceCalculator(
    trip.hotelLocation,
    trip.suggestions
  );

  useEffect(() => {
    const unenriched = trip.suggestions.filter(
      s => s.placeId && s.description === "Loading details\u2026" && !enrichingRef.current.has(s.placeId)
    );
    if (unenriched.length === 0) return;

    for (const s of unenriched) {
      if (s.placeId) enrichingRef.current.add(s.placeId);
    }

    enrichPool(unenriched, async (s) => {
      try {
        const res = await apiRequest("POST", "/api/suggestions/enrich-poi", {
          city: trip.city,
          name: s.title,
          category: s.category,
          address: s.address,
          placeId: s.placeId,
        });
        const data = await res.json();
        if (data.description && s.placeId) {
          trip.updateSuggestion(s.placeId, {
            description: data.description,
            funFact: data.funFact || "",
          });
        }
      } catch {
      } finally {
        if (s.placeId) enrichingRef.current.delete(s.placeId);
      }
    }, 2);
  }, [trip.suggestions.length]);

  const existingTitles = useMemo(
    () => new Set(trip.suggestions.map((s) => s.title.toLowerCase())),
    [trip.suggestions]
  );

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || loadMoreDisabled) return;
    setIsLoadingMore(true);

    try {
      const res = await apiRequest("POST", "/api/suggestions/generate", {
        city: trip.city,
        hotelLocation: trip.hotelLocation || undefined,
        exclude: trip.suggestions.map((s) => s.title),
        excludePlaceIds: trip.suggestions.map((s) => s.placeId).filter(Boolean),
      });
      const data = await res.json();
      const newSuggestions = (data.suggestions as Suggestion[]).filter(
        (s) => !existingTitles.has(s.title.toLowerCase())
      );
      if (newSuggestions.length === 0) {
        setLoadMoreDisabled(true);
        toast({ title: "No more unique suggestions found" });
      } else {
        trip.setSuggestions([...trip.suggestions, ...newSuggestions]);
      }
    } catch (err: any) {
      toast({
        title: "Couldn't load more",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [trip, toast, isLoadingMore, loadMoreDisabled, existingTitles]);

  const handleAddToItinerary = useCallback(
    (suggestion: Suggestion) => {
      const item: ItineraryItem = {
        id: crypto.randomUUID(),
        title: suggestion.title,
        description: suggestion.description,
        category: suggestion.category,
        funFact: suggestion.funFact,
        address: suggestion.address,
        imageUrl: suggestion.imageUrl,
      };
      trip.addToItinerary(item);
    },
    [trip]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b p-4">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => trip.setScreen(trip.mode === "quiz" ? "quiz-results" : "home")}
              data-testid="button-suggestions-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-sm font-bold">{trip.city}</h1>
              <p className="text-xs text-muted-foreground">
                {trip.suggestions.length} spots found
              </p>
            </div>
          </div>

          {trip.itinerary.length > 0 && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => trip.setScreen("itinerary")}
              data-testid="button-go-itinerary"
            >
              Itinerary
              <Badge variant="secondary" className="ml-1 text-xs">
                {trip.itinerary.length}
              </Badge>
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto pb-24">
        <AnimatePresence>
          {trip.suggestions.map((suggestion, index) => {
            const isAdded = trip.addedSuggestionTitles.has(suggestion.title);
            const CategoryIcon = getCategoryIcon(suggestion.category);
            const dist = hasHotel ? getDistance(suggestion.title) : null;

            return (
              <motion.div
                key={suggestion.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="mb-3"
              >
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                      <CategoryIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold leading-snug" data-testid={`text-suggestion-title-${index}`}>
                          {suggestion.title}
                        </h3>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColor(suggestion.category)}`}>
                          {suggestion.category}
                        </span>
                      </div>
                      {suggestion.description === "Loading details\u2026" ? (
                        <div className="mb-2 space-y-1.5">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {suggestion.description}
                        </p>
                      )}

                      {suggestion.address && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{suggestion.address}</span>
                        </div>
                      )}

                      {dist && (
                        <div
                          className="flex items-center gap-1 text-xs mb-2 cursor-pointer"
                          onClick={() => {
                            if (dist.status === "idle") requestDistance(suggestion.title);
                          }}
                          data-testid={`distance-${index}`}
                        >
                          <Navigation className="w-3 h-3 text-primary" />
                          {dist.status === "calculating" && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Calculating...
                            </span>
                          )}
                          {dist.status === "done" && dist.distance && (
                            <span className="text-foreground/70 font-medium">
                              {dist.distance} from hotel
                            </span>
                          )}
                          {dist.status === "error" && (
                            <span className="text-muted-foreground">Distance unavailable</span>
                          )}
                          {dist.status === "idle" && (
                            <span className="text-muted-foreground">Tap to calculate distance</span>
                          )}
                        </div>
                      )}

                      {suggestion.funFact && (
                        <div className="flex items-start gap-1.5 p-2 rounded-md bg-chart-2/5 mb-2">
                          <Lightbulb className="w-3 h-3 text-chart-2 shrink-0 mt-0.5" />
                          <p className="text-xs text-foreground/70">{suggestion.funFact}</p>
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant={isAdded ? "secondary" : "default"}
                        className="gap-1"
                        onClick={() => handleAddToItinerary(suggestion)}
                        disabled={isAdded}
                        data-testid={`button-add-suggestion-${index}`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            Added
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            Add to Itinerary
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="flex flex-col gap-2 mt-4">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleLoadMore}
            disabled={isLoadingMore || loadMoreDisabled}
            data-testid="button-load-more"
          >
            {isLoadingMore ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {loadMoreDisabled ? "No More Suggestions" : "Load More Suggestions"}
          </Button>

          {trip.itinerary.length > 0 && (
            <Button
              className="w-full gap-2"
              onClick={() => trip.setScreen("itinerary")}
              data-testid="button-continue-itinerary"
            >
              Continue to Itinerary
              <Badge variant="secondary" className="ml-1">{trip.itinerary.length}</Badge>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
