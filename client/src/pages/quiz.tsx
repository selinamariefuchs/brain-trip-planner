import { API_BASE } from "@/lib/apiBase";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTrip } from "@/lib/tripContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight,
  Check,
  X,
  Brain,
  Star,
  Lightbulb,
  ArrowLeft,
  Trophy,
  Sparkles,
  Target,
  Flame,
  Zap,
  Award,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function ConfettiPiece({ delay, color, left }: { delay: number; color: string; left: string }) {
  return (
    <div
      className="fixed top-0 w-2 h-3 rounded-sm animate-confetti pointer-events-none z-50"
      style={{
        left,
        backgroundColor: color,
        animationDelay: `${delay}s`,
        animationDuration: `${2.5 + Math.random() * 1.5}s`,
      }}
    />
  );
}

function ConfettiExplosion() {
  const colors = [
    "hsl(173 58% 45%)",
    "hsl(38 92% 50%)",
    "hsl(340 65% 55%)",
    "hsl(262 60% 55%)",
    "hsl(142 71% 45%)",
    "hsl(197 37% 55%)",
  ];
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.8,
    color: colors[i % colors.length],
    left: `${5 + Math.random() * 90}%`,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} delay={p.delay} color={p.color} left={p.left} />
      ))}
    </div>
  );
}

export default function QuizPage() {
  const trip = useTrip();
  const { toast } = useToast();
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [streak, setStreak] = useState(0);
  const [scorePop, setScorePop] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [correctKey, setCorrectKey] = useState(0);

  const question = trip.questions[trip.currentQuestionIndex];
  const progress = ((trip.currentQuestionIndex + 1) / trip.questions.length) * 100;
  const isLastQuestion = trip.currentQuestionIndex === trip.questions.length - 1;

  const handleAnswer = useCallback(
    (index: number) => {
      if (showResult) return;
      setSelectedAnswer(index);
      setShowResult(true);
      const isCorrect = index === question.correctIndex;
      if (isCorrect) {
        trip.setScore(trip.score + 1);
        setStreak((s) => s + 1);
        setScorePop((p) => p + 1);
        setCorrectKey((k) => k + 1);
      } else {
        setStreak(0);
        setShakeKey((k) => k + 1);
      }
      const newAnswers = [...trip.userAnswers];
      newAnswers[trip.currentQuestionIndex] = index;
      trip.setUserAnswers(newAnswers);
    },
    [showResult, question, trip]
  );

  const handleNext = useCallback(() => {
    if (isLastQuestion) {
      trip.setScreen("quiz-results");
    } else {
      trip.setCurrentQuestionIndex(trip.currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  }, [isLastQuestion, trip]);

  const handleContinueToSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    trip.setMode("planning");
    trip.setLoadingMessage(`Finding amazing spots in ${trip.city}...`);
    trip.triggerFetch();
    trip.setScreen("loading");
  }, [trip]);

  if (trip.screen === "quiz-results") {
    return <QuizResults onContinue={handleContinueToSuggestions} isLoading={isLoadingSuggestions} />;
  }

  if (!question) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b p-4">
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => trip.setScreen("home")}
            data-testid="button-quiz-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Brain className="w-3 h-3" />
                  {trip.currentQuestionIndex + 1}/{trip.questions.length}
                </Badge>
                {streak >= 2 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/50 animate-streak-glow"
                  >
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{streak}</span>
                  </motion.div>
                )}
              </div>
              <motion.div
                key={scorePop}
                className={`flex items-center gap-1 ${scorePop > 0 ? "animate-score-pop" : ""}`}
              >
                <Star className="w-3.5 h-3.5 text-chart-2" />
                <span className="text-sm font-bold">{trip.score}</span>
              </motion.div>
            </div>
            <div className="game-gradient-bar">
              <Progress value={progress} className="h-2" data-testid="progress-quiz" />
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 pb-8 pt-4 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={trip.currentQuestionIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="p-5 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-full game-gradient-bg shrink-0">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-semibold leading-snug pt-1" data-testid="text-question">
                  {question.question}
                </h2>
              </div>

              <div className="space-y-2">
                {question.options.map((option, index) => {
                  const isCorrectAnswer = index === question.correctIndex;
                  const isSelectedWrong = index === selectedAnswer && !isCorrectAnswer;

                  let variant: "correct" | "incorrect" | "neutral" = "neutral";
                  if (showResult) {
                    if (isCorrectAnswer) variant = "correct";
                    else if (isSelectedWrong) variant = "incorrect";
                  }

                  return (
                    <motion.button
                      key={`${trip.currentQuestionIndex}-${index}`}
                      onClick={() => handleAnswer(index)}
                      disabled={showResult}
                      className={`w-full text-left p-3 rounded-md border transition-all flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        variant === "correct"
                          ? "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-950/30 animate-correct-pulse"
                          : variant === "incorrect"
                            ? "border-destructive bg-red-50 dark:bg-red-950/30 animate-shake"
                            : selectedAnswer === index && !showResult
                              ? "border-primary bg-primary/5"
                              : "border-border hover-elevate"
                      }`}
                      whileTap={!showResult ? { scale: 0.98 } : undefined}
                      data-testid={`button-answer-${index}`}
                    >
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-all ${
                          variant === "correct"
                            ? "bg-green-500 text-white"
                            : variant === "incorrect"
                              ? "bg-destructive text-white"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {variant === "correct" ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : variant === "incorrect" ? (
                          <X className="w-3.5 h-3.5" />
                        ) : (
                          String.fromCharCode(65 + index)
                        )}
                      </div>
                      <span className="text-sm">{option}</span>
                    </motion.button>
                  );
                })}
              </div>
            </Card>

            <AnimatePresence>
              {showResult && selectedAnswer === question.correctIndex && streak >= 2 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 mb-3"
                >
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {streak} Streak!
                    </span>
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showResult && question.funFact && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card className="p-4 mb-4 border-chart-2/30 bg-chart-2/5">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-chart-2 block mb-0.5">Fun Fact</span>
                        <p className="text-sm text-foreground/80" data-testid="text-funfact">
                          {question.funFact}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {showResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Button className="w-full gap-2" onClick={handleNext} data-testid="button-next-question">
                  {isLastQuestion ? "See Results" : "Next Question"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function QuizResults({
  onContinue,
  isLoading,
}: {
  onContinue: () => void;
  isLoading: boolean;
}) {
  const trip = useTrip();
  const { toast } = useToast();
  const percentage = Math.round((trip.score / trip.questions.length) * 100);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (percentage >= 60) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [percentage]);

  const getGrade = useMemo(() => {
    if (percentage >= 90) return { letter: "A+", color: "text-green-500" };
    if (percentage >= 80) return { letter: "A", color: "text-green-500" };
    if (percentage >= 70) return { letter: "B", color: "text-blue-500" };
    if (percentage >= 60) return { letter: "C", color: "text-chart-2" };
    if (percentage >= 50) return { letter: "D", color: "text-orange-500" };
    return { letter: "F", color: "text-destructive" };
  }, [percentage]);

  const starCount = useMemo(() => {
    if (percentage >= 90) return 3;
    if (percentage >= 60) return 2;
    if (percentage >= 30) return 1;
    return 0;
  }, [percentage]);

  const getMessage = useMemo(() => {
    if (percentage >= 80) return { text: "Amazing! You're a true explorer!", icon: Trophy };
    if (percentage >= 50) return { text: "Great job! You know your stuff!", icon: Award };
    return { text: "Nice try! You'll learn more as you explore!", icon: Target };
  }, [percentage]);

  const handleSaveTrip = useCallback(async () => {
  setIsSaving(true);

  try {
    const url = `${API_BASE}/api/trips`;
    console.log("Saving trip to:", url);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        city: trip.city,
        cityLabel: trip.cityLabel,
        cityPlaceId: trip.cityPlaceId,
        mode: trip.mode === "planning" ? "planning" : "quiz",
        difficulty: trip.difficulty,
        score: trip.score,
        totalQuestions: trip.questions.length,
        spots: [],
      }),
    });

    const data = await res.json().catch(() => null);

    // ✅ First: handle HTTP errors properly
    if (!res.ok) {
      console.error("Save trip failed:", res.status, data);
      toast({
        title: "Couldn't save trip",
        description: data?.error || `Server error (${res.status})`,
        variant: "destructive",
      });
      return;
    }

    // ✅ Then: ensure we got an id back
    if (!data?.id) {
      console.error("Save trip succeeded but no id returned:", data);
      toast({
        title: "Saved, but missing trip id",
        description: "Backend returned success without an id.",
        variant: "destructive",
      });
      return;
    }

    trip.setActiveTripId(data.id);
    toast({ title: "Trip saved!" });
  } catch (err) {
    console.error("Save trip request error:", err);
    toast({ title: "Couldn't save trip", variant: "destructive" });
  } finally {
    setIsSaving(false);
  }
}, [trip, toast]);

  const scoreCircleSize = 140;
  const strokeWidth = 8;
  const radius = (scoreCircleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {showConfetti && <ConfettiExplosion />}

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="max-w-sm w-full"
      >
        <Card className="p-6 text-center">
          <div className="relative inline-block mb-4">
            <svg width={scoreCircleSize} height={scoreCircleSize} className="transform -rotate-90">
              <circle
                cx={scoreCircleSize / 2}
                cy={scoreCircleSize / 2}
                r={radius}
                stroke="hsl(var(--border))"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <motion.circle
                cx={scoreCircleSize / 2}
                cy={scoreCircleSize / 2}
                r={radius}
                stroke="url(#scoreGradient)"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(173 58% 45%)" />
                  <stop offset="100%" stopColor="hsl(38 92% 50%)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className={`text-3xl font-bold ${getGrade.color}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1, type: "spring", stiffness: 200 }}
              >
                {getGrade.letter}
              </motion.span>
              <span className="text-xs text-muted-foreground">{percentage}%</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 mb-3">
            {Array.from({ length: 3 }, (_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0, rotate: -30 }}
                animate={{
                  opacity: i < starCount ? 1 : 0.2,
                  scale: 1,
                  rotate: 0,
                }}
                transition={{ delay: 1.5 + i * 0.2, type: "spring" }}
              >
                <Star
                  className={`w-7 h-7 ${i < starCount ? "text-chart-2 fill-chart-2" : "text-muted-foreground"}`}
                />
              </motion.div>
            ))}
          </div>

          <h2 className="text-xl font-bold mb-1" data-testid="text-quiz-results-title">
            Quiz Complete!
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{getMessage.text}</p>

          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary" data-testid="text-score">
                {trip.score}/{trip.questions.length}
              </div>
              <span className="text-xs text-muted-foreground">Correct</span>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <div className="text-2xl font-bold text-chart-2">{percentage}%</div>
              <span className="text-xs text-muted-foreground">Score</span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              onClick={onContinue}
              disabled={isLoading}
              data-testid="button-continue-suggestions"
            >
              <Sparkles className="w-4 h-4" />
              Discover {trip.city}
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!trip.activeTripId && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleSaveTrip}
                disabled={isSaving}
                data-testid="button-save-trip"
              >
                <Award className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Trip"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => trip.setScreen("home")}
              data-testid="button-back-home"
            >
              Try Another City
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
