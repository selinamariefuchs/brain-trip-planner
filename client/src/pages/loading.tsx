import { useEffect, useRef } from "react";
import { useTrip } from "@/lib/tripContext";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plane,
  Globe,
  MapPin,
  Compass,
  Camera,
  Landmark,
  Mountain,
  Map,
} from "lucide-react";
import { motion } from "framer-motion";

function getSeenQuestionIds(city: string): string[] {
  try {
    const stored = localStorage.getItem(`braintrip_seen_${city}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSeenQuestionIds(city: string, ids: string[]) {
  try {
    const existing = getSeenQuestionIds(city);
    const merged = Array.from(new Set([...existing, ...ids])).slice(-200);
    localStorage.setItem(`braintrip_seen_${city}`, JSON.stringify(merged));
  } catch {}
}

function clearSeenQuestionIds(city: string) {
  try {
    localStorage.removeItem(`braintrip_seen_${city}`);
  } catch {}
}

export default function LoadingPage() {
  const trip = useTrip();
  const { toast } = useToast();
  const lastFetchId = useRef(-1);

  useEffect(() => {
    if (lastFetchId.current === trip.fetchId) return;
    lastFetchId.current = trip.fetchId;

    const fetchData = async () => {
      try {
        let city = trip.city;
        let cityLabel = trip.cityLabel;
        let cityPlaceId = trip.cityPlaceId;
        let difficulty = trip.difficulty;
        let mode = trip.mode;

        if (trip.activeTripId) {
          try {
            const tripRes = await fetch(`/api/trips/${trip.activeTripId}`);
            if (tripRes.ok) {
              const tripData = await tripRes.json();
              city = tripData.city || city;
              cityLabel = tripData.cityLabel || cityLabel;
              cityPlaceId = tripData.cityPlaceId || cityPlaceId;
              difficulty = (tripData.difficulty as "standard" | "challenge") || difficulty;
              if (cityLabel) trip.setCityLabel(cityLabel);
              if (cityPlaceId) trip.setCityPlaceId(cityPlaceId);
              if (city) trip.setCity(city);
              trip.setDifficulty(difficulty);
            }
          } catch {}
        }

        if (!city) {
          toast({
            title: "Trip not found",
            description: "Could not load trip data. Please try again.",
            variant: "destructive",
          });
          trip.setScreen(trip.activeTripId ? "profile" : "home");
          return;
        }

        if (mode === "quiz") {
          const excludeQuestionIds = getSeenQuestionIds(city);
          const payload: Record<string, any> = {
            city,
            difficulty,
            count: 8,
            excludeQuestionIds,
          };
          if (cityPlaceId) {
            payload.cityPlaceId = cityPlaceId;
          }
          if (cityLabel) {
            payload.cityLabel = cityLabel;
          }
          const res = await apiRequest("POST", "/api/quiz/generate", payload);
          const data = await res.json();

          if (data.error || !Array.isArray(data.questions) || data.questions.length === 0) {
            toast({
              title: "Couldn't generate trivia",
              description: "Please try again in a moment.",
              variant: "destructive",
            });
            trip.setScreen(trip.activeTripId ? "trip-detail" : "home");
            return;
          }

          if (data.poolExhausted) {
            clearSeenQuestionIds(city);
            toast({
              title: `You've mastered ${data.cityLabel || city}!`,
              description: "Starting a fresh set of questions.",
            });
          }

          if (Array.isArray(data.questionIds) && data.questionIds.length > 0) {
            saveSeenQuestionIds(city, data.questionIds);
          }

          if (data.cityLabel) trip.setCityLabel(data.cityLabel);
          if (data.cityPlaceId) trip.setCityPlaceId(data.cityPlaceId);

          trip.setQuestions(data.questions);
          trip.setCurrentQuestionIndex(0);
          trip.setScore(0);
          trip.setUserAnswers(new Array(data.questions.length).fill(null));
          trip.setScreen("quiz");
        } else {
          const exclude = trip.itinerary.map((item) => item.title);
          const res = await apiRequest("POST", "/api/suggestions/generate", {
            city,
            hotelLocation: trip.hotelLocation || undefined,
            exclude,
            excludePlaceIds: [],
          });
          const data = await res.json();
          trip.setSuggestions(data.suggestions);
          trip.setScreen("suggestions");
        }
      } catch (err: any) {
        toast({
          title: "Something went wrong",
          description: err.message || "Please try again",
          variant: "destructive",
        });
        trip.setScreen(trip.activeTripId ? "trip-detail" : "home");
      }
    };

    fetchData();
  }, [trip.fetchId]);

  const floatingIcons = [
    { Icon: Globe, delay: 0, x: "15%", y: "20%", size: "w-8 h-8" },
    { Icon: MapPin, delay: 0.5, x: "75%", y: "15%", size: "w-6 h-6" },
    { Icon: Compass, delay: 1, x: "85%", y: "45%", size: "w-7 h-7" },
    { Icon: Camera, delay: 1.5, x: "10%", y: "55%", size: "w-6 h-6" },
    { Icon: Landmark, delay: 2, x: "70%", y: "70%", size: "w-7 h-7" },
    { Icon: Mountain, delay: 0.8, x: "25%", y: "75%", size: "w-6 h-6" },
    { Icon: Map, delay: 1.3, x: "60%", y: "30%", size: "w-5 h-5" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-chart-5/3 to-chart-2/5 pointer-events-none" />

      {floatingIcons.map(({ Icon, delay, x, y, size }, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{ left: x, top: y }}
          animate={{
            y: [0, -15, 0],
            rotate: [0, 8, -8, 0],
            opacity: [0.08, 0.15, 0.08],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay,
          }}
        >
          <Icon className={`${size} text-primary`} />
        </motion.div>
      ))}

      <header className="relative z-10 p-4">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => trip.setScreen("home")}
          data-testid="button-loading-cancel"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </header>

      <main className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="text-center">
          <div className="relative inline-block mb-8">
            <motion.div
              className="w-24 h-24 rounded-full game-gradient-bg flex items-center justify-center"
              animate={{
                y: [0, -12, 0],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Plane className="w-12 h-12 text-white" />
            </motion.div>

            <motion.div
              className="absolute -inset-3 rounded-full border-2 border-primary/20"
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -inset-6 rounded-full border border-chart-2/15"
              animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.05, 0.2] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
          </div>

          <motion.p
            className="text-base font-medium text-foreground mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            data-testid="text-loading-message"
          >
            {trip.loadingMessage || "Getting things ready..."}
          </motion.p>

          <motion.div
            className="flex justify-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: `hsl(${173 + i * 20} ${58 - i * 5}% ${39 + i * 5}%)`,
                }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
