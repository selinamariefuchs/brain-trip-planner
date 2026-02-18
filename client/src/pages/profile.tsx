import { useCallback } from "react";
import { useTrip } from "@/lib/tripContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import type { Trip } from "@shared/schema";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Trash2,
  Globe,
  Plane,
  Star,
  Brain,
  Compass,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

export default function ProfilePage() {
  const trip = useTrip();
  const { toast } = useToast();

  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/trips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip deleted" });
    },
    onError: () => {
      toast({ title: "Couldn't delete trip", variant: "destructive" });
    },
  });

  const handleDelete = useCallback(
    (id: number) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const handleOpenTrip = useCallback(
    (id: number) => {
      trip.setActiveTripId(id);
      trip.setScreen("trip-detail");
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
              onClick={() => trip.setScreen("home")}
              data-testid="button-profile-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-sm font-bold">Saved Trips</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : !trips || trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Globe className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No saved trips yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start exploring a city and save your itinerary!
            </p>
            <Button onClick={() => trip.setScreen("home")} data-testid="button-start-exploring">
              <Plane className="w-4 h-4 mr-2" />
              Start Exploring
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((t, index) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className="p-4 hover-elevate cursor-pointer"
                  data-testid={`card-trip-${t.id}`}
                  onClick={() => handleOpenTrip(t.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-0.5" data-testid={`text-trip-city-${t.id}`}>
                          {t.city}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs gap-1">
                            {t.mode === "quiz" ? (
                              <Brain className="w-3 h-3" />
                            ) : (
                              <Compass className="w-3 h-3" />
                            )}
                            {t.mode === "quiz" ? "Quiz" : "Planning"}
                          </Badge>
                          {t.score != null && t.totalQuestions != null && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Star className="w-3 h-3" />
                              {t.score}/{t.totalQuestions}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(t.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t.id);
                        }}
                        data-testid={`button-delete-trip-${t.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
