# School Club Scheduler Project Roadmap

_Last updated: July 26, 2026_

## Product true north

Build a guided, repeatable school-year and club-block workflow that keeps identifiable student information inside the school's Google Workspace while using Scheduler for setup, coded choice import, matching, workflow control, finalization, and fairness history.

A club administrator should be able to complete the normal workflow without:

- running PowerShell
- opening Apps Script
- using clasp
- editing environment variables
- copying student codes
- editing SQL
- understanding Supabase or coded data tables

Technical setup should be handled once by the system deployer or district administrator. Normal school operations should happen through Scheduler's workflow page and the generated Google workbooks.

## Core architecture

### Scheduler and Supabase

Responsible for:

- school years and blocks
- club setup
- coded student choices
- matching and rematching
- capacity and eligibility rules
- coded draft and final assignments
- workflow state
- fairness history
- major structural changes

### Google Workspace

Responsible for:

- student names and identifiable information
- Student Map and homerooms
- Google Forms and responses
- named roster review
- direct roster edits
- Roster Manager sidebar
- change history
- printable and shareable rosters

### Google Roster Manager

Supports:

- students needing review
- club-by-club roster review
- individual student lookup
- guided add, move, and remove actions
- direct sheet edits followed by reconciliation
- final checks and change history

Student codes remain hidden technical infrastructure.

## Current stable capabilities

### Workflow and Google connection

- Google authorization and health checking
- year and block Google workspaces
- coded student identity architecture
- year Student Map and homeroom data
- Google callback route

### Test environment

- realistic 60-student fixture
- full active-block wipe and reseed
- cleanup of stale Google roster output tabs
- repeatable coded-choice import testing

### Matching

- limited and unlimited capacity handling
- grade-balance preference
- unlimited clubs are not blocked by grade-balance rationing
- final fallback placement pass
- final fallback assignment tracking
- multiple club assignments
- fairness history support

### Google roster workflow

- draft coded assignments
- draft named rosters
- editable final named rosters
- final coded assignments
- students with no club
- students needing more clubs
- club size checks
- final roster sync to Scheduler
- exact duplicate assignment protection

### Roster Manager sidebar

- home dashboard
- students needing review
- club roster review
- individual student search
- add, move, and remove actions
- mark reviewed
- change history
- requested-club recalculation
- high-interest review recalculation
- direct sheet edits followed by refresh

## Current focus: finish roster review and adjustment

### Required before the next stable commit

- [ ] Apply filter controls to review and roster sheets
- [ ] Freeze useful header rows
- [ ] Hide student-code and technical columns from ordinary users
- [ ] Populate Club Reference from Scheduler
- [ ] Populate Student Interest Reference from Scheduler
- [ ] Validate direct edits before regenerating coded assignments
- [ ] Detect unknown students and clubs
- [ ] Detect exact duplicate assignments
- [ ] Warn about capacity issues
- [ ] Warn about grade ineligibility
- [ ] Warn about meeting-day conflicts
- [ ] Preserve club sections and durable club identity
- [ ] Recalculate Students Needing Review after all edits
- [ ] Confirm direct edits and sidebar edits coexist
- [ ] Confirm Final Coded Assignments matches the working named roster
- [ ] Confirm Sync final rosters succeeds after mixed edits
- [ ] Confirm Change History records sidebar changes

### Mixed-edit acceptance test

1. Start from a clean test block.
2. Import 60 coded student choices.
3. Run matching.
4. Send draft rosters to Google.
5. Change one club assignment directly in Final Named Rosters.
6. Delete one assignment row directly.
7. Use the sidebar to add an underassigned student.
8. Use the sidebar to move a student.
9. Mark one student reviewed without a roster change.
10. Refresh review pages.
11. Confirm filters work on review sheets.
12. Confirm Students Needing Review recalculates correctly.
13. Confirm Club Rosters reflects all direct and sidebar changes.
14. Confirm Final Checks distinguishes blocking issues from advisories.
15. Confirm Final Coded Assignments matches Final Named Rosters.
16. Sync final rosters in Scheduler.
17. Confirm final assignments and fairness history are saved.
18. Run a production build.
19. Commit the stable checkpoint.

## Next milestone: Google Form response workflow

### Goal

Create a complete path from form generation to coded choices without technical manual linking.

### Required work

- [ ] Generate the student choice form for the current block
- [ ] Automatically connect the form to the correct school-controlled response destination
- [ ] Populate or link Form Responses predictably
- [ ] Produce Coded Choices Export automatically
- [ ] Handle duplicate and revised responses
- [ ] Show response counts and missing-student review
- [ ] Validate form choices against the current block's clubs
- [ ] Explain what happens if a club changes after the form is generated
- [ ] Support safe form close and reopen behavior
- [ ] Complete a true end-to-end test using real test form submissions

## Multi-block school-year workflow

Each block needs its own:

- club offerings
- student form
- form responses
- coded choices
- matching run
- Google block workbook
- roster review
- final assignments
- fairness snapshot

The school year should retain:

- administrators
- year Google folder and setup workbook
- Student Map
- homerooms
- reusable configuration
- final history from prior blocks

### Required design decisions

- [ ] How a new block is created and made current
- [ ] What copies forward from the prior block
- [ ] What always resets
- [ ] How repeat clubs can be copied forward
- [ ] How midyear Student Map and homeroom changes are handled
- [ ] How fairness history influences later blocks
- [ ] How a prior block can be reopened safely
- [ ] How Google folders and workbooks are named and organized

## New-year rollover

### Proposed workflow

1. Close and archive the current year.
2. Preserve final assignment history.
3. Create the next school year.
4. Create the new year Google workspace.
5. Refresh or import the new Student Map.
6. Update grades and homerooms.
7. Deactivate departed students.
8. Add new students.
9. Copy selected reusable settings.
10. Create the first block.

### Required design decisions

- [ ] Whether fairness carries across school years
- [ ] Whether student codes remain stable across years
- [ ] Which club settings can be copied forward
- [ ] How the administrator reviews Student Map changes
- [ ] How old workbooks remain accessible but protected

## Major change and rematching workflow

Major changes remain in Scheduler, not the Google sidebar.

Examples:

- club cancellation
- meeting-day change
- capacity change
- eligibility change
- leader backs out
- rerunning matching after Google review begins

### Required behavior

- [ ] Explain which Google edits may be replaced
- [ ] Show affected students
- [ ] Archive the current Google review roster
- [ ] Require explicit confirmation
- [ ] Apply the club change
- [ ] Rerun matching
- [ ] Deliberately replace the Google working roster
- [ ] Reset review statuses
- [ ] Preserve prior change history and roster snapshots

## Spanish and bilingual support

### Likely scope

- student choice form
- family-facing instructions
- public club submission form, if used
- club descriptions when Spanish content is provided
- validation and confirmation messages

### Required design decisions

- [ ] One bilingual form or separate language-specific forms
- [ ] Separate English and Spanish club description fields
- [ ] Who provides and reviews translations
- [ ] Fallback behavior when Spanish content is missing
- [ ] Whether administrative interfaces remain English-only

## Master block-workbook template

### Approved architectural direction

Use one school-owned master block-workbook template containing:

- tested bound Roster Manager script
- visible coordinator tabs
- hidden technical tabs
- filters
- formatting
- validations
- plain-language setup instructions

The template is system infrastructure registered once for the school. It is not a recurring club-admin setting.

### Do not commit as production-ready until

- [ ] The clean template contains no student data
- [ ] Copying preserves the bound script
- [ ] A copied workbook shows the Club Scheduler menu
- [ ] First-use authorization is tested with a club-admin account
- [ ] The template is stored in school-level Google configuration, not .env.local
- [ ] Generate block workbook copies the registered template automatically
- [ ] No clasp or Apps Script editor work is needed during normal administration
- [ ] Existing workbooks cannot be overwritten accidentally

## Deferred usability improvements

- faster previous and next navigation in the sidebar
- clearer add and move screens
- undo last change
- improved loading feedback
- fewer full-sheet rewrites where safe
- better club-by-club review progression
- clearer blocking versus advisory messages
- plain-language tab instructions
- simplified workflow labels
- better mobile and narrow-sidebar behavior
- handling long names and club titles
- printable roster views

## Deployment and governance

- identifiable student information stays in school-controlled Google Workspace
- Vercel and Supabase use coded identifiers
- the district may need to approve Google OAuth and Apps Script usage
- the first user of a copied bound script may receive a Google authorization prompt
- normal club administrators should not perform technical installation
- destructive test and reset tools must remain unavailable or clearly restricted in production

## Commit policy

Before each commit:

1. Run the relevant acceptance test.
2. Run `npm run build`.
3. Review `git status`.
4. Remove temporary patch scripts and backups.
5. Stage only intended files.
6. Use a descriptive checkpoint commit message.
7. Update this roadmap when a milestone changes.

## Next three milestones

1. **Roster review checkpoint**: filters, reference data, validation, mixed-edit test, final sync.
2. **Google Form workflow**: automatic response linking and complete form-to-roster acceptance test.
3. **Multi-block lifecycle**: new block progression, copy-forward behavior, rematching, and year rollover design.
