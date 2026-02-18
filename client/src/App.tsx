import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TripProvider, useTrip } from "@/lib/tripContext";

import HomePage from "@/pages/home";
import QuizPage from "@/pages/quiz";
import SuggestionsPage from "@/pages/suggestions";
import ItineraryPage from "@/pages/itinerary";
import ProfilePage from "@/pages/profile";
import LoadingPage from "@/pages/loading";
import TripDetailPage from "@/pages/trip-detail";

function AppRouter() {
  const { screen } = useTrip();

  switch (screen) {
    case "home":
      return <HomePage />;
    case "loading":
      return <LoadingPage />;
    case "quiz":
    case "quiz-results":
      return <QuizPage />;
    case "suggestions":
      return <SuggestionsPage />;
    case "itinerary":
      return <ItineraryPage />;
    case "profile":
      return <ProfilePage />;
    case "trip-detail":
      return <TripDetailPage />;
    default:
      return <HomePage />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TripProvider>
          <AppRouter />
        </TripProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
