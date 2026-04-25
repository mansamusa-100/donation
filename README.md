# GambiaFund

GambiaFund is a React + Vite frontend paired with a scaffolded Express + Prisma + PostgreSQL backend for a crowdfunding platform focused on causes across The Gambia.

## Monorepo Structure

This is an npm workspaces monorepo with separate frontend and backend packages:

```
Donation_App/
├── frontend/          # React + Vite frontend
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── ...
├── backend/           # Express + Prisma backend
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   ├── tsconfig.json
│   └── ...
├── package.json       # Root workspace configuration
└── ...
```

## Frontend Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- React Router

## Backend Stack

- Express
- Prisma
- PostgreSQL
- Zod

## Root Scripts

### Development

- `npm run dev` - Start frontend dev server
- `npm run dev:backend` - Start backend dev server
- `npm run dev:all` - Start both frontend and backend concurrently

### Building

- `npm run build` - Build both frontend and backend
- `npm run build:frontend` - Build frontend only
- `npm run build:backend` - Build backend only

### Database & Seeding

- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run migrations
- `npm run seed` - Seed sample data

### Other

- `npm run lint` - Lint frontend code
- `npm run type-check` - Type check frontend
- `npm run preview` - Preview frontend build
- `npm run start:backend` - Start backend server (production)

## Environment Setup

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=""
```

### Backend (`backend/.env`)
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gambiafund?schema=public"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment files:
   ```bash
   cp frontend/.env.example frontend/.env
   cp backend/.env.example backend/.env
   ```

3. Set up the database:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run seed
   ```

4. Start development servers:
   ```bash
   npm run dev:all
   ```
   - Frontend: http://localhost:5173
   - Backend: http://localhost:4000

During local development, Vite proxies `/api/*` requests to `http://localhost:4000`.

## Current State

- The backend exposes `health`, `stats`, `categories`, `campaigns`, and donation creation routes.
- The frontend home, explore, and campaign detail pages attempt to load real API data first.
- Those pages fall back to mock data if the backend or database is unavailable, keeping the UI usable during setup.
