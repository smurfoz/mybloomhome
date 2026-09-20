# Olumba Quality CRM

A CRM built for **Olumba Quality Construction Consultancy** — a product that helps
contractors reduce cost through documentation and task quality inspections during
construction.

It covers the full loop the business runs on: winning contractor/developer clients
through a sales pipeline, then tracking the construction projects, quality
inspections, defect documentation, and cost savings delivered on each one.

## Stack

- **Next.js 14** (App Router, Server Actions) + TypeScript
- **Prisma** + SQLite (swap `DATABASE_URL` for Postgres in production)
- **Tailwind CSS** for styling
- Lightweight custom auth (signed JWT session cookie, no external auth provider)

## Domain model

- **Companies** — general contractors, subcontractors, developers, architects, owners
- **Contacts** — people at those companies
- **Deals** — sales pipeline (Lead → Qualified → Proposal → Negotiation → Won/Lost), Kanban board
- **Projects** — construction projects, linked to a company (and optionally the deal that won them)
- **Inspections** — quality inspections per project: trade, status, defects found, cost impact avoided
- **Documents** — photos, reports, permits, punch lists, compliance certs (real file upload to `public/uploads`)
- **Tasks** — follow-ups tied to deals or projects
- **Activities** — notes/calls/emails/meetings timeline on companies, deals, and projects

## Getting started

```bash
npm install
cp .env.example .env      # then edit SESSION_SECRET for anything beyond local dev
npm run db:push           # creates prisma/dev.db from schema.prisma
npm run db:seed           # loads realistic demo data
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

### Demo accounts

All seeded users share the password `olumba2026`:

| Email | Role |
|---|---|
| admin@olumbaquality.com | Admin |
| priya@olumbaquality.com | Sales |
| marcus@olumbaquality.com | Inspector |

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — generate the Prisma client and build for production
- `npm run db:push` — sync the Prisma schema to the database
- `npm run db:seed` — (re)load demo data
- `npm run db:reset` — drop, recreate, and reseed the database

## Deploying

The app is stateless aside from the database and `public/uploads`. To ship it:

1. Point `DATABASE_URL` at a managed Postgres instance and change the
   `datasource` provider in `prisma/schema.prisma` from `sqlite` to `postgresql`.
2. Replace local-disk document uploads (`src/app/(app)/projects/actions.ts`,
   `src/app/(app)/inspections/actions.ts`) with an object store (e.g. S3) if you
   need uploads to survive redeploys.
3. Set a strong, unique `SESSION_SECRET`.
