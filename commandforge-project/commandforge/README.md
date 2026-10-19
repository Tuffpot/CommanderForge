# Commander Forge

A standalone EDH/Commander deck builder — runs as a real local web app instead of a Claude.ai artifact, so it isn't sandboxed and Scryfall's live pricing/images can actually load.

## First-time setup

1. Install **Node.js** (LTS version) from https://nodejs.org if you don't already have it.
2. Open a terminal in this folder.
3. Run:
   ```
   npm install
   ```
4. Run:
   ```
   npm run dev
   ```
5. Open the URL it prints (usually `http://localhost:5173`) in your browser.

That's it — the app is running on your own machine now, with normal internet access.

## Setting up accounts (Supabase) — required for Save Deck to work

Saving decks to a real account needs a free database + login service called **Supabase**. This is a one-time setup.

### 1. Create a Supabase project
1. Go to https://supabase.com and sign up (free, no credit card).
2. Click **New Project**. Pick any name/region and set a database password (save it somewhere, though you won't need it day-to-day).
3. Wait ~1 minute for the project to finish setting up.

### 2. Create the decks table
1. In your new project, open the **SQL Editor** (left sidebar).
2. Paste in the following and click **Run**:

```sql
create table decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_name text not null,
  commander text not null,
  identity jsonb not null,
  source text not null,
  bracket_name text not null,
  picks jsonb not null,
  nonbasics jsonb not null,
  basics jsonb not null,
  price_source text not null default 'none',
  card_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table decks enable row level security;

create policy "Users can view their own decks"
  on decks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own decks"
  on decks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own decks"
  on decks for delete
  using (auth.uid() = user_id);
```

This creates the table and locks it down so each person can only ever see or touch their *own* saved decks — that's what "Row Level Security" (RLS) means.

### 3. (Recommended for easy testing) Turn off email confirmation
By default, Supabase makes new users click a confirmation link in their email before they can sign in. For a small personal project this is usually more friction than it's worth:

1. Go to **Authentication → Providers → Email** (or **Authentication → Settings** depending on Supabase's current layout).
2. Turn **Confirm email** off.
3. Save.

You can always turn this back on later if you want real email verification — it's just a toggle, no code changes needed.

### 4. Get your API keys
1. Go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key (not the `service_role` key — never use that one in a browser app).

### 5. Add the keys to this project
1. In this project folder, copy `.env.example` to a new file named `.env`.
2. Paste in your Project URL and anon key:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
   ```
3. Restart `npm run dev` if it was already running (it needs to restart to pick up the new `.env` file).

That's it — **Sign In** in the top-right should now let you create an account and save decks, synced to that account from any device.

**Note on the anon key:** it's fine that this key is visible in your app's code (even after hosting it publicly) — it's designed to be public. Real protection comes from the Row Level Security policies from step 2, not from hiding this key.

## How the code is laid out

- `src/CommandForge.jsx` holds the app's shared state and switches between screens.
- `src/views/` has the three screens: setting up a deck, the finished deck, and My Decks.
- `src/components/` has the header, pop-ups and small pieces like card rows.
- `src/lib/` has the deck-building logic with no screen code: Scryfall searches (`scryfall.js`, `queries.js`), colours (`colors.js`), budget maths (`budget.js`) and the builder itself (`buildDeck.js`).

## Checking a change

- `npm test` runs the automated tests in `src/lib/*.test.js`. They use a fake Scryfall, so they work offline.
- `npm run lint` checks the code for mistakes such as a misspelt name.

## Putting it online for free (optional)

If you want a real public link instead of just running it locally:

- **Netlify Drop**: run `npm run build`, then drag the resulting `dist` folder onto https://app.netlify.com/drop
- **Vercel**: connect this folder as a GitHub repo, import it at https://vercel.com/new — it auto-detects Vite and deploys it

Both have generous free tiers and neither requires a credit card for a project this size. If you host it this way, remember to also add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in that host's dashboard (both Netlify and Vercel have a place for this under project settings) — otherwise accounts won't work on the hosted version.
