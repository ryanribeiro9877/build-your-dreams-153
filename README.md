# JurisAI

Plataforma multi-agente de IA jurídica para escritórios de advocacia brasileiros. O sistema orquestra 91+ agentes especializados que auxiliam advogados em pesquisa jurisprudencial, redação de peças, cálculos trabalhistas/previdenciários, monitoramento de prazos e comunicação processual. Toda decisão técnica e assinatura final permanece com o advogado responsável.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite (SWC) |
| UI | Tailwind CSS 3 + shadcn/ui (Radix) |
| 3D | React Three Fiber + drei |
| State | TanStack Query + React Context |
| Routing | React Router v6 (lazy-loaded) |
| Backend | Supabase (Postgres + RLS + Auth + Edge Functions Deno) |
| Payments | Stripe (test mode) |
| Email | Resend (transactional invites) |
| Captcha | Cloudflare Turnstile |
| Deploy | Vercel (frontend) + Supabase (backend) |

## Prerequisites

- **Node.js** >= 18
- **Bun** >= 1.0 (preferred) or npm
- **Supabase CLI** (for migrations and edge function deployment)

## Setup

```bash
git clone https://github.com/ryanribeiro9877/build-your-dreams-153
cd build-your-dreams-153

# Install dependencies
bun install
# or: npm install --legacy-peer-deps

# Copy environment variables
cp .env.example .env.local
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

Edge functions read `RESEND_API_KEY`, `SITE_URL`, and `INVITE_EMAIL_FROM` from the `edge_runtime_secrets` database table (managed via `scripts/`).

### Start Development

```bash
bun run dev
# or: npx vite
```

The app runs at `http://localhost:5173` by default.

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Production build to `dist/` |
| `bun run lint` | ESLint check |
| `bun run preview` | Preview production build |
| `bun run test` | Run vitest |
| `bun run seed:admin` | Seed admin user |
| `bun run secrets:sync` | Sync edge function secrets to DB |
| `bun run types:regen` | Regenerate Supabase TypeScript types |
| `bun run deploy:edge` | Deploy all edge functions |

## Project Structure

```
src/
  pages/            24 pages (lazy-loaded via App.tsx)
    landing/        Landing page data constants
  components/
    ui/             60+ shadcn/ui primitives
    JurisCloudOS.tsx  Main app shell (chat + sidebar + panels)
  hooks/            15+ custom hooks (auth, agents, chat, tasks, workspace)
  lib/              Utilities (tracking, validation, Stripe, password policy)
  styles/           Extracted CSS modules (landing.css)
  types/            TypeScript type definitions
  config/           Role visibility config
  integrations/     Supabase client + auto-generated types
supabase/
  functions/        Edge Functions (chat-orchestrator, invite-employee, etc.)
  migrations/       29 SQL migration files (V1 through V19)
scripts/            Secret sync and admin seed scripts
docs/               Domain model specs and Resend config
```

## Database

The app uses Supabase Postgres with strict RLS. Key tables:

- **agents** / **agent_templates** -- AI agent definitions and per-user clones
- **role_templates** -- 10 organizational roles (socio, adv_confeccao_geral, etc.)
- **user_tasks** -- Human-to-human task assignment and tracking
- **chat_sessions** / **chat_messages** -- BYOK chat with orchestrator
- **profiles** -- User profiles with role_template_id linkage

Run migrations with:

```bash
supabase db push
```

Regenerate types after schema changes:

```bash
bun run types:regen
```

## Deployment

**Frontend**: Deployed to Vercel. Push to `main` triggers automatic deployment.

**Edge Functions**: Deploy manually:

```bash
supabase functions deploy invite-employee
supabase functions deploy chat-orchestrator
supabase functions deploy verify-turnstile
```

## Additional Documentation

- `AGENTS.md` -- Comprehensive guide for AI agents working on this codebase
- `docs/v14/domain-model.md` -- Canonical specification of roles, agents, and tasks
- `docs/RESEND.md` -- Resend email service configuration

## License

Private. Internal use only.
