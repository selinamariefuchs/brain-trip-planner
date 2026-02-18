import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { QuizQuestion, Suggestion } from "@shared/schema";

export type AppScreen = "home" | "loading" | "quiz" | "quiz-results" | "suggestions" | "itinerary" | "profile" | "trip-detail";
export type GameMode = "quiz" | "planning";
export type Difficulty = "standard" | "challenge";

export interface ItineraryItem {
  id: string;
  title: string;
  description: string;
  category: string;
  funFact?: string;
  address?: string;
  imageUrl?: string;
  isCustom?: boolean;
}

interface UndoState {
  past: ItineraryItem[][];
  present: ItineraryItem[];
  future: ItineraryItem[][];
}

interface TripContextValue {
  screen: AppScreen;
  setScreen: (s: AppScreen) => void;
  city: string;
  setCity: (c: string) => void;
  cityLabel: string;
  setCityLabel: (l: string) => void;
  cityPlaceId: string;
  setCityPlaceId: (p: string) => void;
  hotelLocation: string;
  setHotelLocation: (h: string) => void;
  mode: GameMode;
  setMode: (m: GameMode) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  questions: QuizQuestion[];
  setQuestions: (q: QuizQuestion[]) => void;
  currentQuestionIndex: number;
  setCurrentQuestionIndex: (i: number) => void;
  score: number;
  setScore: (s: number) => void;
  userAnswers: (number | null)[];
  setUserAnswers: (a: (number | null)[]) => void;

  suggestions: Suggestion[];
  setSuggestions: (s: Suggestion[]) => void;
  updateSuggestion: (placeId: string, updates: Partial<Suggestion>) => void;
  addedSuggestionTitles: Set<string>;

  itinerary: ItineraryItem[];
  addToItinerary: (item: ItineraryItem) => void;
  removeFromItinerary: (id: string) => void;
  reorderItinerary: (fromIndex: number, toIndex: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearItinerary: () => void;
  setItinerary: (items: ItineraryItem[]) => void;

  loadingMessage: string;
  setLoadingMessage: (m: string) => void;

  activeTripId: number | null;
  setActiveTripId: (id: number | null) => void;

  fetchId: number;
  triggerFetch: () => void;

  resetTrip: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [city, setCity] = useState("");
  const [cityLabel, setCityLabel] = useState("");
  const [cityPlaceId, setCityPlaceId] = useState("");
  const [hotelLocation, setHotelLocation] = useState("");
  const [mode, setMode] = useState<GameMode>("quiz");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);

  const [suggestions, setSuggestionsRaw] = useState<Suggestion[]>([]);
  const setSuggestions = useCallback((s: Suggestion[]) => setSuggestionsRaw(s), []);
  const updateSuggestion = useCallback((placeId: string, updates: Partial<Suggestion>) => {
    setSuggestionsRaw(prev => prev.map(s => s.placeId === placeId ? { ...s, ...updates } : s));
  }, []);

  const [undoState, setUndoState] = useState<UndoState>({
    past: [],
    present: [],
    future: [],
  });

  const [loadingMessage, setLoadingMessage] = useState("");
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [fetchId, setFetchId] = useState(0);
  const triggerFetch = useCallback(() => setFetchId(n => n + 1), []);

  const addedSuggestionTitles = new Set(undoState.present.map((i) => i.title));

  const addToItinerary = useCallback(
    (item: ItineraryItem) => {
      setUndoState((prev) => {
        if (prev.present.some((i) => i.id === item.id || i.title === item.title)) return prev;
        const newPresent = [...prev.present, { ...item, id: item.id || crypto.randomUUID() }];
        return { past: [...prev.past, prev.present], present: newPresent, future: [] };
      });
    },
    []
  );

  const removeFromItinerary = useCallback(
    (id: string) => {
      setUndoState((prev) => {
        const newPresent = prev.present.filter((i) => i.id !== id);
        return { past: [...prev.past, prev.present], present: newPresent, future: [] };
      });
    },
    []
  );

  const reorderItinerary = useCallback(
    (fromIndex: number, toIndex: number) => {
      setUndoState((prev) => {
        const items = [...prev.present];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return { past: [...prev.past, prev.present], present: items, future: [] };
      });
    },
    []
  );

  const setItinerary = useCallback((items: ItineraryItem[]) => {
    setUndoState({ past: [], present: items, future: [] });
  }, []);

  const undo = useCallback(() => {
    setUndoState((prev) => {
      if (prev.past.length === 0) return prev;
      const newPast = [...prev.past];
      const previous = newPast.pop()!;
      return { past: newPast, present: previous, future: [prev.present, ...prev.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setUndoState((prev) => {
      if (prev.future.length === 0) return prev;
      const newFuture = [...prev.future];
      const next = newFuture.shift()!;
      return { past: [...prev.past, prev.present], present: next, future: newFuture };
    });
  }, []);

  const clearItinerary = useCallback(() => {
    setUndoState((prev) => ({
      past: [...prev.past, prev.present],
      present: [],
      future: [],
    }));
  }, []);

  const resetTrip = useCallback(() => {
    setCity("");
    setCityLabel("");
    setCityPlaceId("");
    setHotelLocation("");
    setMode("quiz");
    setDifficulty("standard");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setUserAnswers([]);
    setSuggestionsRaw([]);
    setUndoState({ past: [], present: [], future: [] });
    setLoadingMessage("");
    setActiveTripId(null);
    setScreen("home");
  }, []);

  return (
    <TripContext.Provider
      value={{
        screen, setScreen,
        city, setCity,
        cityLabel, setCityLabel,
        cityPlaceId, setCityPlaceId,
        hotelLocation, setHotelLocation,
        mode, setMode,
        difficulty, setDifficulty,
        questions, setQuestions,
        currentQuestionIndex, setCurrentQuestionIndex,
        score, setScore,
        userAnswers, setUserAnswers,
        suggestions, setSuggestions, updateSuggestion,
        addedSuggestionTitles,
        itinerary: undoState.present,
        addToItinerary, removeFromItinerary, reorderItinerary,
        undo, redo,
        canUndo: undoState.past.length > 0,
        canRedo: undoState.future.length > 0,
        clearItinerary,
        setItinerary,
        loadingMessage, setLoadingMessage,
        activeTripId, setActiveTripId,
        fetchId, triggerFetch,
        resetTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used within TripProvider");
  return ctx;
}
