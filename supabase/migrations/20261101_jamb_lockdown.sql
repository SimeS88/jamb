-- Close the client-trusted write paths. Apply only after the client that
-- uses 20261101_jamb_server_dice.sql is deployed.

-- the old move RPC took the score from the client
drop function if exists public.jamb_play_move(uuid, text, text, int);

-- scores are written only by jamb_solo_move / jamb_play_move
drop policy if exists "jamb_games_insert_own" on public.jamb_games;

-- matches change only through RPCs (find/challenge/respond/roll/announce/move/abandon)
drop policy if exists "jamb_matches_update_participant" on public.jamb_matches;
