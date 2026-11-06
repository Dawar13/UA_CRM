# Backlog

Ideas and feedback not yet scheduled. Items move into a phase brief only after the founders choose them at a phase review. Newest additions go at the bottom of each section.

## After Phase 2

From `CLAUDE.md` §8.

| Item                       | Notes                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| Board view                 | A kanban by stage, as an alternative to the grid, for sheets that have stages     |
| Group customers by company | Several people at one plant shown together, with the deal at company level        |
| Phone quick-add            | An installable web app for adding contacts and logging touches on the go          |
| Daily email digest         | A morning email of overdue and due-today follow-ups, using free-tier sending only |
| Change history             | Who edited what and when, per row                                                 |
| Phone layout               | A responsive layout below 1024px (`CLAUDE.md` §3.6 makes phone layout backlog)    |

## Technical follow-ups from Phase 1

| Item                      | Notes                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Smaller first load        | The main chunk is about 1.5 MB; split the quick-add parser, the Supabase client in local mode and other late features (D-045)          |
| Lighter grid rows         | Scrolling 2,000 rows runs 130 to 210 ms per jump on the development machine: fewer class merges and elements per cell, row containment |
| Move to the Mumbai region | The project is in Tokyo; a Mumbai project plus the restore in `docs/RUNBOOK.md` §5 would cut each round trip, best before real data    |
| Encrypted backups         | Dumps sit unencrypted in the private backup repository (D-042); a passphrase kept by the founders would add a second lock              |
| Transfer sheet ownership  | From `CLAUDE.md` §2.14                                                                                                                 |

## Founder feedback

Nothing yet. Feedback from each phase review is added here.
