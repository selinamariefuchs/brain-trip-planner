import { useCallback } from "react";
import { useTrip, type GameMode, type Difficulty } from "@/lib/tripContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin,
  Brain,
  Compass,
  Hotel,
  ChevronRight,
  Plane,
  Globe,
  Sparkles,
  User,
  Map,
  Landmark,
  Mountain,
} from "lucide-react";
import { motion } from "framer-motion";

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; desc: string }[] = [
  { value: "standard", label: "Standard", desc: "Interesting & accessible" },
  { value: "challenge", label: "Challenge", desc: "Deeper facts" },
];

export default function HomePage() {
  const trip = useTrip();
  const { toast } = useToast();
  const handleStart = useCallback(() => {
    if (!trip.city.trim()) {
      toast({ title: "Please enter a city", variant: "destructive" });
      return;
    }

    trip.setActiveTripId(null);
    trip.setCityLabel("");
    trip.setCityPlaceId("");
    trip.setSuggestions([]);
    trip.setItinerary([]);
    trip.setLoadingMessage(
      trip.mode === "quiz"
        ? `Crafting trivia about ${trip.city}...`
        : `Finding the best spots in ${trip.city}...`
    );
    trip.triggerFetch();
    trip.setScreen("loading");
  }, [trip, toast]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-chart-5/5 to-chart-2/8 pointer-events-none" />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <Globe className="absolute top-20 right-8 w-24 h-24 text-primary/[0.06] animate-float-icon" style={{ animationDelay: "0s" }} />
        <Plane className="absolute top-40 left-6 w-16 h-16 text-chart-2/[0.08] animate-float-icon" style={{ animationDelay: "1s" }} />
        <Map className="absolute bottom-32 right-12 w-20 h-20 text-chart-5/[0.06] animate-float-icon" style={{ animationDelay: "2s" }} />
        <Landmark className="absolute bottom-48 left-10 w-14 h-14 text-chart-4/[0.07] animate-float-icon" style={{ animationDelay: "1.5s" }} />
        <Mountain className="absolute top-60 right-1/3 w-12 h-12 text-chart-3/[0.06] animate-float-icon" style={{ animationDelay: "0.5s" }} />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full game-gradient-bg flex items-center justify-center">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">BrainTrip</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => trip.setScreen("profile")}
            data-testid="button-profile"
          >
            <User className="w-4 h-4" />
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 px-4 pb-8 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 mt-4"
        >
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full game-gradient-bg mb-4"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Plane className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">Where to next?</h2>
          <p className="text-muted-foreground text-sm">
            Learn about your destination through trivia, then build the perfect itinerary.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="p-5 mb-4">
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Destination
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                  <Input
                    placeholder="Enter a city (e.g. Paris, Tokyo, NYC)"
                    value={trip.city}
                    onChange={(e) => trip.setCity(e.target.value)}
                    className="pl-10"
                    data-testid="input-city"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Mode
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => trip.setMode("quiz")}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      trip.mode === "quiz"
                        ? "border-primary bg-primary/10"
                        : "border-border hover-elevate"
                    }`}
                    data-testid="button-mode-quiz"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.mode === "quiz" ? "game-gradient-bg" : "bg-muted"
                    }`}>
                      <Brain className={`w-4 h-4 ${trip.mode === "quiz" ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                    <span className={`text-sm font-medium ${trip.mode === "quiz" ? "text-primary" : ""}`}>
                      Quiz
                    </span>
                    <span className="text-xs text-muted-foreground">Learn & play</span>
                  </button>
                  <button
                    onClick={() => trip.setMode("planning")}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      trip.mode === "planning"
                        ? "border-primary bg-primary/10"
                        : "border-border hover-elevate"
                    }`}
                    data-testid="button-mode-planning"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.mode === "planning" ? "game-gradient-bg" : "bg-muted"
                    }`}>
                      <Compass className={`w-4 h-4 ${trip.mode === "planning" ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                    <span className={`text-sm font-medium ${trip.mode === "planning" ? "text-primary" : ""}`}>
                      Planning
                    </span>
                    <span className="text-xs text-muted-foreground">Skip to spots</span>
                  </button>
                </div>
              </div>

              {trip.mode === "quiz" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Difficulty
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => trip.setDifficulty(opt.value)}
                        className={`flex flex-col items-center gap-0.5 p-2.5 rounded-md border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          trip.difficulty === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover-elevate"
                        }`}
                        data-testid={`button-difficulty-${opt.value}`}
                      >
                        <span className={`text-sm font-medium ${trip.difficulty === opt.value ? "text-primary" : ""}`}>
                          {opt.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Hotel / Starting Point
                  <Badge variant="secondary" className="ml-2 text-xs">Optional</Badge>
                </Label>
                <div className="relative">
                  <Hotel className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Hotel name or address"
                    value={trip.hotelLocation}
                    onChange={(e) => trip.setHotelLocation(e.target.value)}
                    className="pl-10"
                    data-testid="input-hotel"
                  />
                </div>
              </div>


            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Button
            size="lg"
            onClick={handleStart}
            disabled={!trip.city.trim()}
            className="w-full gap-2 game-gradient-bg border-primary-border text-white"
            data-testid="button-start"
          >
            <Sparkles className="w-4 h-4" />
            {trip.mode === "quiz" ? "Start Trivia" : "Find Spots"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
