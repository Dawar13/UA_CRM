-- Calendars are shared, view only (10 Nov 2026, D-054): every active member reads every member's
-- events, connection status and event links, as with sheets. Writing does not change: events and
-- connections only from the server, links only by their owner on their own rows. Tokens
-- (calendar_secrets) and sign-in states (oauth_states) stay unreadable to every client role.

drop policy calendar_connections_select_own on public.calendar_connections;
create policy calendar_connections_select_members on public.calendar_connections
  for select to authenticated
  using ((select public.current_member_id()) is not null);

drop policy calendar_events_select_own on public.calendar_events;
create policy calendar_events_select_members on public.calendar_events
  for select to authenticated
  using ((select public.current_member_id()) is not null);

drop policy calendar_event_links_select_own on public.calendar_event_links;
create policy calendar_event_links_select_members on public.calendar_event_links
  for select to authenticated
  using ((select public.current_member_id()) is not null);
