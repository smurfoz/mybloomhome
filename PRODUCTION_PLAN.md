# MyBloomHome — 5-Day Production Plan

**Goal:** Take MyBloomHome from an empty repo to a live, production-ready marketing & booking website for a home services business (cleaning, lawn care, handyman, etc.) in 5 working days.

## Product scope

A public-facing site that lets homeowners:
- Learn about the services offered (service catalog with descriptions & pricing)
- See trust signals (reviews, service area, guarantees)
- Request/book a service via a contact or booking form
- Reach the business by phone, email, or form

Out of scope for this 5-day window: provider-side dashboards, in-app payments, real-time scheduling/calendar sync, native mobile apps. These are natural fast-follows once the core site is live.

## Recommended tech stack

Chosen for speed of delivery, low ops overhead, and a clean upgrade path.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | SSR/SSG for SEO, file-based routing, one deploy target |
| Styling | Tailwind CSS | Fast to build polished UI without a design system from scratch |
| Forms/backend | Next.js API routes + Resend (email) | No separate backend service needed for a booking/contact form |
| Data (if needed) | Supabase (Postgres) | Only if we persist bookings/leads beyond email; managed, generous free tier |
| Hosting | Vercel | Native Next.js support, preview deployments per PR, zero-config CI/CD |
| Analytics | Vercel Analytics or Plausible | Lightweight, privacy-friendly |
| Testing | Playwright (smoke) + basic TS type checks | Enough coverage for a marketing site in this timeframe |

## Day-by-day plan

### Day 1 — Foundations & setup
- Initialize Next.js + TypeScript + Tailwind project structure
- Set up ESLint/Prettier, `.editorconfig`, base `CLAUDE.md`/README with dev instructions
- Configure Vercel project, connect repo, verify a blank deploy goes live
- Define content model: services list, service areas, testimonials, FAQ — as structured data (JSON/TS) so content edits don't require touching layout code
- Draft site information architecture: Home, Services, Service detail, About, Contact/Booking, FAQ

**Exit criteria:** Empty scaffold builds, lints, and deploys to a Vercel preview URL.

### Day 2 — Core pages & layout
- Build shared layout: header/nav, footer, responsive shell
- Build Home page: hero, value props, service highlights, CTA to book
- Build Services listing page + individual service detail pages (driven by the content model from Day 1)
- Implement basic SEO: metadata, Open Graph tags, sitemap.xml, robots.txt

**Exit criteria:** All primary pages navigable and responsive on mobile/desktop.

### Day 3 — Booking/contact flow
- Build booking/contact form (name, contact info, service requested, address/zip, preferred date, notes)
- Wire form submission to an API route with server-side validation (zod)
- Send lead notification via email (Resend) to the business inbox; optional: persist lead in Supabase table for a record
- Add success/error states, spam protection (honeypot field + rate limiting)

**Exit criteria:** Submitting the form on a preview deploy delivers a real email/lead and shows a confirmation state.

### Day 4 — Polish, trust, and performance
- Add testimonials/reviews section, service-area map or list, guarantees/badges
- Add FAQ page/section
- Performance pass: image optimization (`next/image`), Lighthouse audit, fix any CLS/LCP issues
- Accessibility pass: semantic HTML, alt text, form labels, keyboard nav, color contrast
- Cross-browser/device smoke test

**Exit criteria:** Lighthouse scores ≥90 across Performance/Accessibility/SEO/Best Practices on key pages.

### Day 5 — QA, launch, and monitoring
- Write and run Playwright smoke tests for critical paths (home loads, navigate to services, submit booking form)
- Final content review/proofread; confirm business info (phone, email, hours, service area) is accurate
- Set up custom domain + SSL on Vercel, configure DNS
- Set up analytics and error monitoring (Vercel Analytics + basic logging on API route failures)
- Go-live: promote production deployment, verify live site end-to-end (including real form submission)
- Write a short post-launch runbook: how to update content, how to redeploy, who to contact for issues

**Exit criteria:** Site is live on the production domain, booking flow verified end-to-end in production, monitoring in place.

## Success criteria (end of Day 5)
- [ ] Site live on production domain with SSL
- [ ] All core pages (Home, Services, Service detail, About, Contact/Booking, FAQ) complete and responsive
- [ ] Booking/contact form delivers leads reliably with validation and spam protection
- [ ] Lighthouse ≥90 on Performance, Accessibility, SEO, Best Practices
- [ ] Smoke tests passing in CI
- [ ] Analytics and basic error monitoring active
- [ ] Runbook documented for content updates and redeploys

## Risks & mitigations
- **Content not ready in time (copy, photos, pricing):** use realistic placeholder content from Day 1 so layout work isn't blocked; swap in final content Day 4–5.
- **Scope creep toward marketplace features:** explicitly deferred (see Out of scope); revisit after launch based on real demand.
- **Email deliverability for leads:** use a dedicated transactional email provider (Resend) rather than a raw SMTP send from day one.

## Fast-follow backlog (post-launch)
- Online payments/deposits for bookings
- Provider-facing scheduling dashboard
- Customer accounts and booking history
- SMS notifications/reminders
- Multi-location support if the business expands service areas
