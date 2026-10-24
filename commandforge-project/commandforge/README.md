# Brewhall

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

### 2b. Let people delete their account
The app stores require a "Delete my account" button (it's at the bottom of **My Decks** when signed in). It needs this database function. In the **SQL Editor**, paste this and click **Run**:

```sql
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  -- Saved decks go with it: decks.user_id cascades on delete.
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

It only ever deletes the account of the person who is signed in and pressing the button.

### 2c. Let people save their card collection
**My Collection** (the Collection tab) saves each person's imported cards to their account. It needs this table. In the **SQL Editor**, paste this and click **Run**:

```sql
create table collections (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table collections enable row level security;

create policy "Users can view their own collection"
  on collections for select
  using (auth.uid() = user_id);

create policy "Users can insert their own collection"
  on collections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own collection"
  on collections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Each row holds one person's cards as a list of names and quantities. Deleting an account deletes its collection too. Without this table, signed-in people see "Couldn't load the collection saved to your account"; signed-out visitors' collections are kept in their browser either way.

### 2d. Let people share decks
The **Share** button in **My Decks** makes a read-only link to a saved deck. It needs a `shared` column, a rule that lets people turn sharing on for their own decks, and a function that reads one shared deck by its link. In the **SQL Editor**, paste the contents of [`supabase/share-decks.sql`](supabase/share-decks.sql) and click **Run**.

Shared decks are only ever read one at a time through that function, so nobody can list every shared deck, and the owner's account is never sent with it. Until this has been run, pressing **Share** shows "Couldn't change sharing for this deck."

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

### 6. (Optional) Sign in with Google or Apple
The sign-in pop-up shows **Continue with Google** and **Continue with Apple** buttons, but each one only appears once you switch it on in Supabase. Nothing changes until then.

First, tell Supabase where people may be sent back to after signing in. Go to **Authentication → URL Configuration**:
- **Site URL:** `https://brewhall.co.uk`
- **Redirect URLs:** add `https://brewhall.co.uk`, `http://localhost:5173` (for testing on your own computer) and `uk.co.brewhall.app://auth-callback` (for the Android and iPhone apps).

**Google** (free):
1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the **Callback URL** it shows (it looks like `https://your-project-ref.supabase.co/auth/v1/callback`).
2. Go to https://console.cloud.google.com, create a project (any name), then open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**).
3. Fill in the app name (Brewhall), your support email, and under **Authorised domains** add `brewhall.co.uk` and `your-project-ref.supabase.co`. Choose **External** for the audience and publish the app, so anyone can sign in rather than just test users.
4. Under **Clients**, click **Create client**, pick **Web application**, add `https://brewhall.co.uk` under **Authorised JavaScript origins**, and paste the Callback URL from step 1 under **Authorised redirect URIs**. Create it.
5. Copy the **Client ID** and **Client secret** into the Google page in Supabase, turn Google on, and save.

**Apple** (needs an Apple Developer account, which you already need for the App Store). The App Store requires this button in the iPhone app whenever Google sign-in is offered there, so switch it on before sending an iPhone build with Google sign-in for review.
1. At https://developer.apple.com/account go to **Certificates, Identifiers & Profiles → Identifiers**. Open the app's ID (`uk.co.brewhall.app`) and tick **Sign in with Apple**.
2. Add a new identifier of type **Services IDs** (for example `uk.co.brewhall.web`). Tick **Sign in with Apple**, click **Configure**, choose the app ID as the primary, add `your-project-ref.supabase.co` under **Domains** and the Supabase Callback URL under **Return URLs**.
3. Under **Keys**, create a key with **Sign in with Apple** ticked and download the `.p8` file. Note the **Key ID** and your **Team ID** (top right of the page).
4. In Supabase, open **Authentication → Sign In / Providers → Apple**, turn it on, put the Services ID in **Client IDs**, and paste a secret key made from the `.p8` file (Supabase's Apple sign-in guide has a tool that makes it from the Team ID, Key ID and `.p8`). Save. Apple makes this secret expire every 6 months, so set a reminder to make a new one.

Someone who signs in with Google using the same email as an existing account gets the same account and saved decks.

The Android and iPhone apps open Google or Apple in an in-app browser, then come back to the app signed in. Run `npm run app:sync` after pulling this change so the apps pick up the two new Capacitor plugins it uses.

## How the code is laid out

- `src/CommandForge.jsx` holds the app's shared state and switches between screens.
- `src/views/` has the four screens: setting up a deck, the finished deck, My Collection and My Decks.
- `src/components/` has the header, pop-ups and small pieces like card rows.
- `src/lib/` has the deck-building logic with no screen code: Scryfall searches (`scryfall.js`, `queries.js`), colours (`colors.js`), budget maths (`budget.js`) and the builder itself (`buildDeck.js`), plus reading a card collection (`collection.js`) and building from one (`buildFromCollection.js`).

## Checking a change

- `npm test` runs the automated tests in `src/lib/*.test.js`. They use a fake Scryfall, so they work offline. Netlify runs them before every deploy and stops the deploy if one fails.
- `npm run lint` checks the code for mistakes such as a misspelt name.

## Putting it online for free (optional)

If you want a real public link instead of just running it locally:

- **Netlify Drop**: run `npm run build`, then drag the resulting `dist` folder onto https://app.netlify.com/drop
- **Vercel**: connect this folder as a GitHub repo, import it at https://vercel.com/new — it auto-detects Vite and deploys it

Both have generous free tiers and neither requires a credit card for a project this size. If you host it this way, remember to also add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in that host's dashboard (both Netlify and Vercel have a place for this under project settings) — otherwise accounts won't work on the hosted version.

## Showing adverts (Google AdSense)

The site is ready for Google AdSense but shows no ads until you switch it on:

1. Sign up at https://adsense.google.com with `brewhall.co.uk` as your site.
2. In Netlify, under Site configuration → Environment variables, add `VITE_ADSENSE_CLIENT` with your `ca-pub-…` publisher ID, then redeploy. This adds the ownership tag and the `ads.txt` file AdSense checks for. Then press "Verify" in AdSense and request a review.
3. In AdSense → Privacy & messaging, create a "European regulations" message for the UK and EU. That is the cookie consent pop-up; the site has no banner of its own. The "Cookie settings" link in the footer reopens it.
4. Once approved, either turn on Auto ads in AdSense, or make a display ad unit under Ads → By ad unit and add its number as `VITE_ADSENSE_SLOT` in Netlify to show it under each forged deck.

Ads never load in the Android or iOS app, since AdSense is for websites only.

## Getting found and shared

- **Link previews.** Links to the site show the Brewhall image and description (`public/og-image.png`, tags in `index.html`). Shared deck links show the deck's name, commander and the commander's art instead; `netlify/edge-functions/deck-preview.js` writes those in, using the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the site. To check one, paste a shared deck link into https://www.opengraph.xyz or a Discord message.
- **Commander links.** `https://brewhall.co.uk/?commander=<name>` opens the builder with that commander picked, e.g. `?commander=Krenko, Mob Boss`. Handy when replying to "help me build" posts.
- **Search engines.** `public/sitemap.xml` lists the pages and `robots.txt` points to it. Add the site in Google Search Console (https://search.google.com/search-console) and submit `https://brewhall.co.uk/sitemap.xml` there once.
- **Analytics.** Make a free account at https://umami.is, add `brewhall.co.uk` as a website, and add its Website ID as `VITE_UMAMI_WEBSITE_ID` in Netlify's environment variables, then redeploy. Umami sets no cookies, so it needs no consent banner. Besides visits it records these actions: `deck-built`, `deck-saved`, `deck-shared`, `deck-link-sent`, `deck-exported`, `shared-deck-opened`, `brew-from-shared-deck` and `commander-link-opened`. It's off in the Android and iOS apps.

## Installing it like an app

**From the website (free, works today).** On an Android phone, open brewhall.co.uk in Chrome and tap **Install app** (or menu > **Add to Home screen**). On an iPhone, open it in Safari, tap **Share** > **Add to Home Screen**. On a computer, Chrome and Edge show an install button in the address bar. It then opens full screen with its own icon, like any other app.

**Store apps (Google Play and the App Store).** The `android/` and `ios/` folders are the store apps. They're built with [Capacitor](https://capacitorjs.com), which wraps this same website code in a native app, so any change to the site goes into the apps too the next time you build them.

After changing the site, copy it into the apps with:

```
npm run app:sync
```

- **Android:** needs [Android Studio](https://developer.android.com/studio) (free, any computer). `npm run app:android` opens the project; use **Build > Generate Signed App Bundle** to make the file you upload to Google Play.
- **iPhone:** needs a Mac with Xcode (free from the Mac App Store), or a cloud build service. `npm run app:ios` opens the project in Xcode; use **Product > Archive** to upload to App Store Connect.

Make sure your `.env` file has the Supabase values before building, or sign-in won't work in the app.

The **Mobile apps** check on GitHub builds both apps on every change. Each run's page has a test Android APK to download and install on a phone.

To change the app icon or splash screen, replace the images in `assets/` and run `npx @capacitor/assets generate`.
