# NAKA Planung & Organisation

Two modes are available in version **2026.11.12.4**:

- **Offline:** Open the root `index.html` directly as a local file in Edge, Chrome or Firefox. No installation, server, account or internet connection is required. Keep the original local catalogs with the app.
- **Shared website:** Build and publish the clean `dist` frontend. Supabase provides email/password login and a private shared database. Internet access is required; team data and login tokens are kept in memory, not browser storage. Reloading requires signing in again.

See [Supabase and GitHub Pages setup](#supabase-and-github-pages-setup) before publishing. Do not publish the workspace root or the internal source documents.

The German-language app has four sidebar sections: **Jahresplanung**, **Hauptversammlung**, **Beschlussliste** and **Vorstandssitzungen**. For offline use keep `index.html`, `styles.css`, `app.js`, `cloud.js`, `template-activities.js`, `management.js` and `management-data.js` together. The public website deliberately omits both source catalogs.

The annual planner follows the structure of `Vorlage/Plandiagramm Jahresplanung.xls`: activity, responsible person, yearly timeline and the four planning types (Fixpunkt, Handlungsphase, ungefährer Termin, laufend).

## Activities from the templates

On the first launch, the app adds 36 template entries for the current year, preserving any existing activities:

- 28 annual-planning entries from the latest sheet, `2015-2016`. Earlier versions are not duplicated. Separate recurring dates and colored phases remain separate entries; section headings and "see separate diagram" references are not activities.
- 8 training-control activities.

The catalog contains only blue fixed dates and green action phases. Full-year, purple **Laufend** and yellow **Ungefährer Termin** entries were removed previously. All 84 remaining newsletter-related entries have now also been removed: 68 detailed newsletter tasks and 16 newsletter/newsflash preparation, translation and dispatch phases from annual planning. The original workbook files remain unchanged.

App version **2026.11.12.4** retains the existing one-time planner updates. Cleanup revision 2 removes newsletter/newsflash entries identified by their title, area or original generated newsletter ID, including renamed imported tasks. Unrelated personal activities, retained edits, deletions and import history remain intact. The earlier purple/yellow/full-year cleanup runs only when upgrading a plan older than revision 1, so deliberate edits made after that update are preserved. Cleanup history is included in backups; old backups receive the appropriate updates with a removal count shown before confirmation.

For another selected year, choose **Vorlagen hinzufügen**. Each year is imported only once: reloading or pressing the button again does not restore deleted entries or overwrite edits. This import history is included in backups.

Month and day are transferred to the target year; cross-year ranges keep their year offset. Month-end ranges adapt to leap years. All entries initially have status **Geplant**.

**Review provisional dates before use.** Some retained action phases still have approximate week/month ranges or conflicting source dates. These entries are marked **Termin prüfen**; uncheck **Termin vorläufig – prüfen** in the editor after confirming their dates. This small yellow review badge is a warning, not a yellow activity bar. Undated January–December placeholders are no longer included.

Historical example dates embedded in the fair-days title and multiline flyer instructions are omitted from the activity title.

## Use

The app includes a short, collapsible **So nutzen Sie die Jahresplanung** guide explaining the scope, editing, date review and backups.

- Add an activity with a title, optional area and responsible person, dates, planning type and status.
- Edit by clicking its title, timeline marker or pencil. Delete with the trash icon and confirm.
- A fixed date is a single day; other types support date ranges, including across years.
- All four planning types remain available for your own manually created activities; the bundled templates now use only fixed dates and action phases.
- Select a year (1900–2100), switch between months and calendar weeks, and filter by search, area or status. Summary counts always describe the whole selected year.
- The view remains January–December, not a rolling 12-month period. On opening/reopening the page, changing the year/time scale or resizing the window, the timeline automatically brings the current calendar month into view using your device's date. If all months fit, they remain visible together. The current month is highlighted in the current year. **Aktueller Monat** returns to the current month and year; searching or editing does not reset a manually scrolled view.
- Use the print button for the currently selected year and filters. Choose landscape orientation if your browser overrides the print layout.

## Hauptversammlung

The first launch of the expanded app adds an editable **HV – Regiebuch (Vorlage)** record from `Vorlage/Regiebuch HV 2025.xlsx`, without changing the annual planner:

- 37 agenda/runbook points, preserving titles, responsible people, explicit times, speaking notes and the seven original decision-required markers.
- 14 material checklist items above the source's **früher** divider. Old packing marks are retained as notes, not treated as completed tasks or assigned owners.
- Six election-review tasks for the people above **Austritte**, with their source roles and election history in the notes. Former members and the historical material list are not imported as new tasks.

**The filename and contents disagree:** the heading says **25.05.2024 in Bern**, while the filename says 2025 and election planning extends to 2026. The meeting date is therefore left unset. Names, dues, years and speaking notes are historical source information, not verified current facts. All tasks start open. A decision-required marker is not a recorded vote or outcome.

Select an HV, edit its title/date/location/participants/notes/minutes, and add, edit or delete tasks. Tasks have an area, owner, optional deadline and agenda time, status, decision flag and notes/results. Material items use the same status control as other tasks.

**Nächste HV: Aufgaben kopieren** creates a separate editable meeting from the selected HV. Task titles, owners, times, areas, decision flags and task notes are copied; statuses reset to open and deadlines are cleared. Meeting date, location, participants, meeting notes and minutes are not copied. Review all copied information for the new year. **HV hinzufügen** creates an empty HV instead. Deleting a meeting also deletes its tasks and minutes after confirmation.

## Beschlussliste

The app imports **162 non-empty text entries** from `Vorlage/Beschlussliste alphabetisch aktuell hoch.docx`, including original paragraph text and source references. Empty separator rows and heading-only rows are not decisions. Blank headings continue the previous heading; parenthesized subheadings inherit the preceding topic. These inferred labels and original headings/row numbers are recorded in the notes. Alphabetical cross-references and duplicate mentions remain separate records.

All imported decisions initially say **Gültigkeit prüfen**. The app does not infer that a historical decision is still valid, detect repeals automatically, or decode ambiguous reference codes into dates. After reviewing the source and later decisions, edit the status to **Gültig**, **Ersetzt** or **Aufgehoben**, enter a date if known and record successor references in the notes.

Search full text/references/notes, filter by topic or validity, and add, edit or delete decisions. Historical newsletter decisions remain part of this source register; they do not create newsletter activities in the annual plan.

## Vorstandssitzungen

This area starts empty: no existing meetings, minutes or outcomes were fabricated. Add meetings with dates, locations, participants, organizational notes and plain-text minutes. Manage linked tasks with owners, deadlines, status and results. **Offene Aufgaben aus allen Sitzungen** combines all unfinished tasks, sorted by deadline, and links back to their meeting. Task search also filters this central list; the status filter applies to the selected meeting's checklist. Minutes and task notes can be expanded for reading or printing.

All three new sections include a short **So nutzen Sie … / Quellenhinweise** explanation. Their bundled source information is imported only when management data is first initialized. Reloading does not overwrite edits or restore deleted records, including when a restored backup intentionally contains empty lists. The supplied Excel and Word documents remain unchanged; subsequent document changes are not imported automatically.

## Saving and backups

**Offline mode:** Changes are saved automatically in this browser's local storage. Keep using the same browser and file location: moving the app, private browsing or deleting browser data can make saved data unavailable. Offline tabs do not synchronize automatically; avoid editing in multiple tabs at the same time.

The VS Code preview and Microsoft Edge have separate saved plans. Open `C:\Code\NAKA Jahresplanung\index.html` in Edge and reload with **Ctrl+F5** to load the updated app. The version is shown below the planner; its scripts and stylesheet have versioned URLs to avoid stale cached assets. The one-time cleanup applies in Edge too, but personal activity changes still do not synchronize between browsers: use backup export/import to transfer them.

**Export backups regularly.** **Gesamtbackup exportieren** includes all four sections, all years, minutes, linked tasks, source notes and import history, regardless of the visible filters. Offline data is saved together under the existing `naka-yearplan-v1` browser-storage key. In team mode it is saved together in Supabase instead. A failed write does not apply the attempted change.

Loading a validated new backup replaces all four sections after confirmation. **Older planner-only version-1 backups replace only the annual activities and leave the three management areas intact.** Older backups without provisional flags or import history remain supported. Invalid management data, duplicate IDs, invalid calendar dates, unknown statuses and unsupported versions reject the entire import before anything is changed. Files are limited to 5 MB. Corrupt local data blocks edits until a valid backup is restored; it is not silently overwritten.

The bundled catalogs are snapshots, not live Excel/Word imports. Excel/Word import/export, file attachments, cloud synchronization and multi-user editing are not included. Minutes are editable plain text; use the area's print button to print the visible information and expand notes beforehand if needed.

The offline version uses no network services. The shared version contacts only the configured Supabase project; no external JavaScript libraries or fonts are loaded.

## Supabase and GitHub Pages setup

### 1. Protect and initialize the database

In the Supabase project dashboard:

1. Open **SQL Editor**, paste [supabase/setup.sql](supabase/setup.sql), and run it. It creates a single shared workspace and an approved-user list. It can be rerun without replacing existing team data.
2. Under **Authentication**, disable **Allow new users to sign up**. Keep the email/password provider enabled. Configure a minimum password length of 12 or more.
3. Use **Authentication > Users** to invite your 4-5 colleagues, including yourself. For reliable invitations and password recovery to arbitrary email addresses, configure a custom SMTP provider: Supabase's default email service has delivery restrictions and low limits. Alternatively, create confirmed users with individual temporary passwords in the dashboard and distribute them privately. Never share passwords or secret/service-role keys in source code or chat.
4. After creating/inviting each account, approve it using its email in the SQL Editor:

   ```sql
   insert into public.naka_members (user_id)
   select id from auth.users where lower(email) = lower('REPLACE_WITH_APPROVED_EMAIL')
   on conflict (user_id) do nothing;
   ```

   The command must report one inserted row (or the user must already be a member). Creating an Auth account alone does **not** give access. Repeat for each approved user. An administrator can remove access with:

   ```sql
   delete from public.naka_members
   where user_id in (
     select id from auth.users where lower(email) = lower('REPLACE_WITH_REMOVED_EMAIL')
   );
   ```

The public browser key is deliberately present in [supabase-config.js](supabase-config.js). It is not a secret and does not grant data access by itself. Database row-level security grants read/write access only to approved authenticated users. Users cannot approve themselves, insert/delete the workspace or change its identity. All approved team members have equal editing and backup/import privileges; this version has no read-only role.

Never disable RLS or add public read/write policies to make a connection error disappear.

### 2. Build and publish the frontend

Keep the GitHub repository private if your plan supports GitHub Pages for private repositories. A private repository does **not** make a normal Pages website private: its frontend is public; the data is protected by Supabase. If Pages is unavailable for your private repository, the same built folder can be deployed to another static host.

Run in PowerShell:

```powershell
.\build-web.ps1
```

The build produces exactly seven files under `dist`: HTML, stylesheet, application scripts, Supabase's public configuration and `.nojekyll`. It never copies `Vorlage`, `management-data.js`, `template-activities.js`, backups or source records. It can safely overwrite a previous build; if unexpected files exist in `dist`, it stops for inspection without deleting them. The `.gitignore` also excludes internal catalogs, source documents, backups and generated output.

Publish using the included [.github/workflows/pages.yml](.github/workflows/pages.yml). After pushing the tracked source files to `main`, set **Repository Settings > Pages > Source** to **GitHub Actions**, then run the workflow or push again. It builds and uploads **only `dist`**. Do not select deployment from the repository root.

Expected project URL:

```text
https://remsnems21-gif.github.io/NAKA_Jahresplannung/
```

Use the URL actually shown by GitHub Pages if it differs.

### 3. Configure authentication redirects

In **Supabase > Authentication > URL Configuration**, set the Site URL to the exact published URL above and add that same URL to the redirect allowlist. Include the trailing slash. Do this **before** sending invitations. Avoid wildcard redirect URLs.

Invitations and password-recovery links open the app's password form. The app removes tokens from the URL, verifies them with Supabase, and keeps tokens only in memory. An invalid/expired invite must be resent by the administrator. The login form does not offer public registration.

### 4. Import the association information privately

1. In your existing offline app, export a **Gesamtbackup**. Keep that file private.
2. Open the published app, sign in with an approved account, and choose **Backup laden**.
3. Confirm replacement of the shared workspace. The approved team then sees the same four areas.

The web version starts empty on purpose. It never silently uploads browser-local records or includes historical source documents in publicly downloadable assets.

### Shared editing and failures

The app checks for team updates every 20 seconds while the page is visible and no editor is open. **Teamdaten neu laden** refreshes immediately after closing an editor. Every write includes a revision condition, enforced together with a database trigger; an older view cannot overwrite a newer save. This is optimistic conflict detection, not simultaneous collaborative text editing.

If a colleague saves first, your save is rejected and the editor stays open. Copy your unsaved text, close the dialog, reload team data, then reapply the change. There is no automatic merge. A lost network response may mean a write reached the server even though confirmation failed: reload and inspect before retrying.

Team mode never falls back to local saving. Offline, permission, session and quota failures are shown explicitly. Membership removal prevents future reads/writes; information already viewed or exported cannot be recalled remotely. After reload or sign-out, authentication is required again. Supabase Free projects may pause after inactivity; unpause them in the dashboard if needed.

### Validation

Open [tests/cloud.html](tests/cloud.html) directly in a modern browser for synthetic cloud-connector tests. The test mocks every request and sends no credentials or records to Supabase. Live deployment still requires the SQL rules, approved accounts, redirect settings and an authenticated end-to-end check in your project.
