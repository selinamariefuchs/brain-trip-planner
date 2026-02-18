import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(),
  cityLabel: text("city_label"),
  cityPlaceId: text("city_place_id"),
  hotelLocation: text("hotel_location"),
  mode: text("mode").notNull().default("quiz"),
  difficulty: text("difficulty").notNull().default("standard"),
  score: integer("score"),
  totalQuestions: integer("total_questions"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tripSpots = pgTable("trip_spots", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  funFact: text("fun_fact"),
  address: text("address"),
  placeId: text("place_id"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  createdAt: true,
});

export const insertTripSpotSchema = createInsertSchema(tripSpots).omit({
  id: true,
});

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type TripSpot = typeof tripSpots.$inferSelect;
export type InsertTripSpot = z.infer<typeof insertTripSpotSchema>;

export const quizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().min(0).max(3),
  funFact: z.string(),
});

export const suggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  funFact: z.string(),
  address: z.string().optional(),
  imageUrl: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
