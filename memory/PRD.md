# Iris Vision - PRD

## Original Problem Statement
Fix Railway backend deployment failure caused by missing .js extensions on local ESM imports.

## What's Been Implemented
- **2026-01-26**: Fixed all local imports across 17 backend TypeScript files by adding `.js` extensions for ESM compliance
  - Files: `_core/*.ts`, `db.ts`, `routers.ts`, `storage.ts`, `shared/types.ts`, `drizzle/relations.ts`, `index.ts`
  - Replaced non-existent `./scripts/load-env.js` with `"dotenv/config"`
  - Build verified with zero TypeScript errors
  - Changes pushed to GitHub

## Architecture
- Backend: Express + tRPC + TypeScript (ESM modules)
- Database: MySQL via Drizzle ORM
- Deployment: Railway

## Backlog
- P0: None (deployment fix complete)
- P1: Add ESLint rule or pre-commit hook to catch missing .js extensions
- P2: Review and optimize build configuration
