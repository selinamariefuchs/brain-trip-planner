import { useCallback, useState } from "react";
import { useTrip } from "@/lib/tripContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import type { Trip, TripSpot } from "@shared/schema";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Trash2,
  Brain,
  Compass,
  Star,
  Plus,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TripWithSpots extends Trip {
  spots: TripSpot[];
}

export default function TripDetailPage() {
  const trip = useTrip();
  const { toast } = useToast();
  const [deletingSpotId, setDeletingSpotId] = useState<number | null>(null);

  const { data: tripData, isLoading } = useQuery<TripWithSpots>({
    queryKey: ["/api/trips", trip.activeTripId],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${trip.activeTripId}`);
      if (!res.ok) throw new Error("Failed to load trip");
      return res.json();
    },
    enabled: !!trip.activeTripId,
  });

  const deleteSpotMutation = useMutation({
    mutationFn: async (spotId: number) => {
      setDeletingSpotId(spotId);
      await apiRequest("DELETE", `/api/trips/${trip.activeTripId}/spots/${spotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", trip.activeTripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Spot removed" });
    },
    onError: () => {
      toast({ title: "Couldn't remove spot", variant: "destructive" });
    },
    onSettled: () => {
      setDeletingSpotId(null);
    },
  });

  const handleContinueTrivia = useCallback(() => {
    if (!tripData) return;
    trip.setCity(tripData.city);
    trip.setCityLabel(tripData.cityLabel || "");
    trip.setCityPlaceId(tripData.cityPlaceId || "");
    trip.setMode("quiz");
    trip.setDifficulty((tripData.difficulty as "standard" | "challenge") || "standard");
    trip.setHotelLocation(tripData.hotelLocation || "");
    trip.setActiveTripId(tripData.id);

    const existingItems = (tripData.spots || []).map((s) => ({
      id: `saved-${s.id}`,
      title: s.title,
      description: s.description,
      category: s.category,
      funFact: s.funFact || undefined,
      address: s.address || undefined,
      imageUrl: s.imageUrl || undefined,
    }));
    trip.setItinerary(existingItems);
    trip.setLoadingMessage(`Generating trivia about ${tripData.cityLabel || tripData.city}...`);
    trip.triggerFetch();
    trip.setScreen("loading");
  }, [tripData, trip]);

  const handleAddMoreSpots = useCallback(() => {
    if (!tripData) return;
    trip.setCity(tripData.city);
    trip.setCityLabel(tripData.cityLabel || "");
    trip.setCityPlaceId(tripData.cityPlaceId || "");
    trip.setMode("planning");
    trip.setHotelLocation(tripData.hotelLocation || "");
    trip.setActiveTripId(tripData.id);

    const existingItems = (tripData.spots || []).map((s) => ({
      id: `saved-${s.id}`,
      title: s.title,
      description: s.description,
      category: s.category,
      funFact: s.funFact || undefined,
      address: s.address || undefined,
      imageUrl: s.imageUrl || undefined,
    }));
    trip.setItinerary(existingItems);
    trip.setLoadingMessage(`Finding more spots in ${tripData.city}...`);
    trip.triggerFetch();
    trip.setScreen("loading");
  }, [tripData, trip]);

  const spots = tripData?.spots || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b p-4">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => trip.setScreen("profile")}
              data-testid="button-trip-detail-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-sm font-bold" data-testid="text-trip-detail-city">
                {tripData?.city || "Loading..."}
              </h1>
              <p className="text-xs text-muted-foreground">
                {spots.length} saved spot{spots.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto pb-8">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : !tripData ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">Trip not found</p>
            <Button className="mt-4" onClick={() => trip.setScreen("profile")}>
              Back to Trips
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  {tripData.mode === "quiz" ? <Brain className="w-3 h-3" /> : <Compass className="w-3 h-3" />}
                  {tripData.mode === "quiz" ? "Quiz" : "Planning"}
                </Badge>
                {tripData.score != null && tripData.totalQuestions != null && (
                  <Badge variant="outline" className="gap-1">
                    <Star className="w-3 h-3" />
                    {tripData.score}/{tripData.totalQuestions}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(tripData.createdAt).toLocaleDateString()}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleContinueTrivia}
                  data-testid="button-continue-trivia"
                >
                  <Brain className="w-4 h-4" />
                  Continue Trivia
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleAddMoreSpots}
                  data-testid="button-add-more-spots"
                >
                  <Plus className="w-4 h-4" />
                  Add More Spots
                </Button>
              </div>
            </div>

            {spots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MapPin className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold mb-1">No spots saved yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add spots to this trip by exploring suggestions.
                </p>
                <Button onClick={handleAddMoreSpots} data-testid="button-explore-spots">
                  <Plus className="w-4 h-4 mr-2" />
                  Find Spots
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Itinerary
                </h2>
                <AnimatePresence>
                  {spots.map((spot, index) => (
                    <motion.div
                      key={spot.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.04 }}
                    >
                      <Card className="p-4" data-testid={`card-spot-${spot.id}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold" data-testid={`text-spot-title-${spot.id}`}>
                                {spot.title}
                              </h3>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="shrink-0 text-muted-foreground"
                                onClick={() => deleteSpotMutation.mutate(spot.id)}
                                disabled={deletingSpotId === spot.id}
                                data-testid={`button-delete-spot-${spot.id}`}
                              >
                                {deletingSpotId === spot.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                              {spot.description}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {spot.category}
                              </Badge>
                              {spot.address && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span className="truncate max-w-[150px]">{spot.address}</span>
                                </span>
                              )}
                            </div>
                            {spot.funFact && (
                              <div className="flex items-start gap-1 mt-2 p-1.5 rounded-md bg-chart-2/5">
                                <Lightbulb className="w-3 h-3 text-chart-2 shrink-0 mt-0.5" />
                                <p className="text-xs text-foreground/70">{spot.funFact}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
