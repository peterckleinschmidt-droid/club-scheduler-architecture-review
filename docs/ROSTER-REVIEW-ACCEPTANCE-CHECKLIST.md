# Roster Review Acceptance Checklist

Use this checklist before committing the current Google roster-management work.

## Setup

- [ ] Repository starts clean
- [ ] Production build passes
- [ ] Current test block has 60 latest submissions
- [ ] Matching completes without viable students left unmatched
- [ ] Draft rosters are sent to Google

## Google workbook

- [ ] Final Named Rosters is populated
- [ ] Filters appear on useful tabs
- [ ] Header rows are frozen
- [ ] Student-code columns are hidden during normal use
- [ ] Club Reference is populated
- [ ] Student Interest Reference is populated
- [ ] Technical tabs are hidden

## Direct edits

- [ ] Change one club assignment directly
- [ ] Delete one assignment directly
- [ ] Refresh review pages
- [ ] Changes appear in Club Rosters
- [ ] Changes appear in Final Coded Assignments
- [ ] Invalid rows produce clear row-specific messages

## Sidebar edits

- [ ] Add an underassigned student
- [ ] Move a student
- [ ] Remove a student
- [ ] Mark a student reviewed
- [ ] Search for a student outside the review queue
- [ ] Review a club roster
- [ ] Change History records actions

## Recalculation

- [ ] Removed student returns to review when appropriate
- [ ] Fewer-clubs-than-requested reason is correct
- [ ] No-high-interest reason is correct
- [ ] Capacity warning is correct
- [ ] Grade eligibility warning is correct
- [ ] Meeting-day conflict warning is correct
- [ ] Duplicate assignments are blocked or cleaned safely

## Final sync

- [ ] Final Checks has no unresolved blocking issue
- [ ] Final Coded Assignments matches Final Named Rosters
- [ ] Sync final rosters succeeds
- [ ] Final assignments in Scheduler match Google
- [ ] Fairness history is saved
- [ ] Block finalization status is correct

## Commit cleanup

- [ ] Remove patch scripts
- [ ] Remove backup files
- [ ] Ensure `.clasp.json` is ignored
- [ ] Run `git status`
- [ ] Run `npm run build`
- [ ] Update `docs/PROJECT-ROADMAP.md`
- [ ] Commit and push
