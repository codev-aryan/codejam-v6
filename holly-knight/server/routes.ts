import type { Express } from "express";
import type { Server } from "http";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // All score-related API routes removed as requested
  return httpServer;
}
