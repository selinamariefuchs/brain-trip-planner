import { useState, useCallback } from "react";
import { useTrip, type ItineraryItem } from "@/lib/tripContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Trash2,
  Undo2,
  Redo2,
  Plus,
  Save,
  MapPin,
  GripVertical,
  Lightbulb,
  Check,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ItineraryPage() {
  const trip = useTrip();
  const { toast } = useToast();
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customCategory, setCustomCategory] = useState("");

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) trip.reorderItinerary(index, index - 1);
    },
    [trip]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < trip.itinerary.length - 1) trip.reorderItinerary(index, index + 1);
    },
    [trip]
  );

  const handleAddCustom = useCallback(() => {
    if (!customTitle.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    const item: ItineraryItem = {
      id: crypto.randomUUID(),
      title: customTitle.trim(),
      description: customDescription.trim() || "Custom added spot",
      category: customCategory.trim() || "Custom",
      isCustom: true,
    };
    trip.addToItinerary(item);
    setCustomTitle("");
    setCustomDescription("");
    setCustomCategory("");
    setShowAddCustom(false);
    toast({ title: "Spot added to your itinerary" });
  }, [customTitle, customDescription, customCategory, trip, toast]);

  const handleSave = useCallback(async () => {
    if (trip.itinerary.length === 0) {
      toast({ title: "Add some spots first", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const spotsPayload = trip.itinerary.map((item, idx) => ({
        title: item.title,
        description: item.description,
        category: item.category,
        imageUrl: item.imageUrl || null,
        funFact: item.funFact || null,
        address: item.address || null,
        sortOrder: idx,
      }));

      if (trip.activeTripId) {
        await apiRequest("POST", `/api/trips/${trip.activeTripId}/spots`, {
          spots: spotsPayload,
        });

        if (trip.mode === "quiz" && trip.score > 0) {
          await apiRequest("PATCH", `/api/trips/${trip.activeTripId}`, {
            score: trip.score,
            totalQuestions: trip.questions.length || null,
          });
        }

        toast({ title: "Trip updated!" });
      } else {
        await apiRequest("POST", "/api/trips", {
          city: trip.city,
          cityLabel: trip.cityLabel || null,
          cityPlaceId: trip.cityPlaceId || null,
          hotelLocation: trip.hotelLocation || null,
          mode: trip.mode,
          difficulty: trip.difficulty,
          score: trip.score || null,
          totalQuestions: trip.questions.length || null,
          spots: spotsPayload,
        });

        toast({ title: "Trip saved!" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      trip.resetTrip();
      trip.setScreen("profile");
    } catch (err: any) {
      toast({
        title: "Couldn't save trip",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [trip, toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b p-4">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => trip.setScreen("suggestions")}
              data-testid="button-itinerary-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-sm font-bold">{trip.city} Itinerary</h1>
              <p className="text-xs text-muted-foreground">
                {trip.itinerary.length} spot{trip.itinerary.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={trip.undo}
              disabled={!trip.canUndo}
              data-testid="button-undo"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={trip.redo}
              disabled={!trip.canRedo}
              data-testid="button-redo"
            >
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto pb-32">
        {trip.itinerary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MapPin className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No spots yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Go back and add some suggestions, or add a custom spot.
            </p>
            <Button variant="outline" onClick={() => trip.setScreen("suggestions")}>
              Browse Suggestions
            </Button>
          </div>
        ) : (
          <AnimatePresence>
            {trip.itinerary.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="mb-3"
              >
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-0.5 rounded hover-elevate disabled:opacity-20"
                          data-testid={`button-move-up-${index}`}
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === trip.itinerary.length - 1}
                          className="p-0.5 rounded hover-elevate disabled:opacity-20"
                          data-testid={`button-move-down-${index}`}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold" data-testid={`text-itinerary-title-${index}`}>
                          {item.title}
                        </h3>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground"
                          onClick={() => trip.removeFromItinerary(item.id)}
                          data-testid={`button-remove-${index}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {item.category}
                        </Badge>
                        {item.isCustom && (
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        )}
                      </div>
                      {item.funFact && (
                        <div className="flex items-start gap-1 mt-2 p-1.5 rounded bg-chart-2/5">
                          <Lightbulb className="w-3 h-3 text-chart-2 shrink-0 mt-0.5" />
                          <p className="text-xs text-foreground/70">{item.funFact}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <div className="flex gap-2 mt-4">
          <Dialog open={showAddCustom} onOpenChange={setShowAddCustom}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 gap-2" data-testid="button-add-custom">
                <Plus className="w-4 h-4" />
                Add Custom Spot
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Spot</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    placeholder="e.g. My favorite cafe"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    data-testid="input-custom-title"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    placeholder="What makes this spot special?"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="resize-none"
                    data-testid="input-custom-description"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    placeholder="e.g. Food, Nature, Culture"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    data-testid="input-custom-category"
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleAddCustom} data-testid="button-save-custom">
                  <Check className="w-4 h-4" />
                  Add to Itinerary
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      {trip.itinerary.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t">
          <div className="max-w-lg mx-auto">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleSave}
              disabled={isSaving}
              data-testid="button-save-trip"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {trip.activeTripId ? "Update Trip" : "Save Trip"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
