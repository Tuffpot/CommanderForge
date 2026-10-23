-- Shareable read-only deck links. Run once in the Supabase SQL Editor.
--
-- A deck is only readable by others once its owner presses Share. Shared
-- decks are read through get_shared_deck, one at a time by id, so nobody can
-- list every shared deck and the owner's user id is never sent out.

alter table decks add column if not exists shared boolean not null default false;

-- Lets owners turn sharing on and off. They can only change their own decks,
-- and can't hand a deck to someone else.
drop policy if exists "Users can update their own decks" on decks;
create policy "Users can update their own decks"
  on decks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.get_shared_deck(deck_id uuid)
returns table (
  id uuid,
  deck_name text,
  commander text,
  identity jsonb,
  source text,
  bracket_name text,
  picks jsonb,
  nonbasics jsonb,
  basics jsonb,
  price_source text,
  card_data jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.deck_name, d.commander, d.identity, d.source, d.bracket_name,
         d.picks, d.nonbasics, d.basics, d.price_source, d.card_data
  from decks d
  where d.id = deck_id and d.shared;
$$;

revoke all on function public.get_shared_deck(uuid) from public;
grant execute on function public.get_shared_deck(uuid) to anon, authenticated;
