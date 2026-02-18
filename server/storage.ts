import { db } from "./db";
import { trips, tripSpots, type Trip, type InsertTrip, type TripSpot, type InsertTripSpot } from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

export interface IStorage {
  getTrips(): Promise<Trip[]>;
  getTrip(id: number): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  updateTrip(id: number, updates: Partial<InsertTrip>): Promise<void>;
  deleteTrip(id: number): Promise<void>;
  getTripSpots(tripId: number): Promise<TripSpot[]>;
  addTripSpot(spot: InsertTripSpot): Promise<TripSpot>;
  addTripSpots(spots: InsertTripSpot[]): Promise<TripSpot[]>;
  deleteTripSpot(id: number): Promise<void>;
  updateSpotOrder(id: number, sortOrder: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(desc(trips.createdAt));
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [created] = await db.insert(trips).values(trip).returning();
    return created;
  }

  async updateTrip(id: number, updates: Partial<InsertTrip>): Promise<void> {
    await db.update(trips).set(updates).where(eq(trips.id, id));
  }

  async deleteTrip(id: number): Promise<void> {
    await db.delete(tripSpots).where(eq(tripSpots.tripId, id));
    await db.delete(trips).where(eq(trips.id, id));
  }

  async getTripSpots(tripId: number): Promise<TripSpot[]> {
    return db.select().from(tripSpots).where(eq(tripSpots.tripId, tripId)).orderBy(asc(tripSpots.sortOrder));
  }

  async addTripSpot(spot: InsertTripSpot): Promise<TripSpot> {
    const [created] = await db.insert(tripSpots).values(spot).returning();
    return created;
  }

  async addTripSpots(spots: InsertTripSpot[]): Promise<TripSpot[]> {
    if (spots.length === 0) return [];
    return db.insert(tripSpots).values(spots).returning();
  }

  async deleteTripSpot(id: number): Promise<void> {
    await db.delete(tripSpots).where(eq(tripSpots.id, id));
  }

  async updateSpotOrder(id: number, sortOrder: number): Promise<void> {
    await db.update(tripSpots).set({ sortOrder }).where(eq(tripSpots.id, id));
  }
}

export const storage = new DatabaseStorage();
