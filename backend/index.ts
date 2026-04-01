/**
 * Iris Vision Server Entry Point
 * 
 * This is the main entry point for the server. It imports and starts the Express server
 * from _core/index.ts. This file exists at the root level so that the compiled output
 * (dist/index.js) can be run directly by Railway or other deployment platforms.
 */

import "dotenv/config";
export { startServer } from "./_core/index.js";

// Start the server immediately when this module is loaded
import { startServer } from "./_core/index.js";
startServer().catch(console.error);
