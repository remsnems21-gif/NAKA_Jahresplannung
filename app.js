"use strict";

(async () => {
  const STORAGE_KEY = "naka-yearplan-v1";
  const CATALOG_REVISION = 2;
  const TYPES = { fixed: "Fixpunkt", phase: "Handlungsphase", approximate: "Ungefährer Termin", ongoing: "Laufend" };
  const STATUSES = { planned: "Geplant", active: "In Bearbeitung", done: "Abgeschlossen" };
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const DAY = 86400000;
  const $ = (id) => document.getElementById(id);
  let activities = [];
  let management = null;
  let templateImports = [];
  let catalogRevision = CATALOG_REVISION;
  let templatesInitialized = false;
  let year = new Date().getFullYear();
  let view = "months";
  let timelineFocus = "";
  let editingId = null;
  let storageHealthy = true;
  let saving = false;
  let synchronizing = false;
  const cloud = window.NAKA_CLOUD;
  let cloudData;
  let toastTimer;

  try {
    cloudData = await cloud.connect();
    $("app-shell").hidden = false;
  } catch (error) {
    $("auth-panel").hidden = false;
    $("auth-error").textContent = `Start nicht möglich: ${error.message}`;
    return;
  }

  function showError(message) {
    $("error").textContent = message;
    $("error").hidden = false;
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500);
  }

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  }

  function validateActivity(activity) {
    if (!activity || typeof activity !== "object") throw new Error("Ungültige Aktivität.");
    for (const [field, max] of [["id", 100], ["title", 160], ["category", 80], ["owner", 120]]) {
      if (typeof activity[field] !== "string" || activity[field].length > max) throw new Error(`Ungültiges Feld: ${field}.`);
    }
    if (!activity.id.trim() || !activity.title.trim()) throw new Error("Jede Aktivität benötigt eine ID und einen Titel.");
    if (!Object.hasOwn(TYPES, activity.type) || !Object.hasOwn(STATUSES, activity.status)) throw new Error("Ungültiger Planungstyp oder Status.");
    const start = parseDate(activity.start);
    const end = parseDate(activity.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || activity.start < "1900-01-01" || activity.end > "2100-12-31" || end < start) {
      throw new Error("Bitte einen gültigen Zeitraum zwischen 1900 und 2100 eingeben. Das Ende darf nicht vor dem Beginn liegen.");
    }
    if (activity.type === "fixed" && activity.start !== activity.end) throw new Error("Ein Fixpunkt benötigt dasselbe Start- und Enddatum.");
    if (activity.provisional !== undefined && typeof activity.provisional !== "boolean") throw new Error("Ungültige Kennzeichnung eines vorläufigen Termins.");
    return { id: activity.id, title: activity.title.trim(), category: activity.category.trim(), owner: activity.owner.trim(), start: activity.start, end: activity.end, type: activity.type, status: activity.status, provisional: activity.provisional ?? false };
  }

  function validateBackup(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.activities)) throw new Error("Keine unterstützte NAKA-Sicherung (Version 1).");
    const validated = data.activities.map(validateActivity);
    if (new Set(validated.map((activity) => activity.id)).size !== validated.length) throw new Error("Die Sicherung enthält doppelte Aktivitäts-IDs.");
    const imports = data.templateImports ?? [];
    if (!Array.isArray(imports) || imports.some((key) => typeof key !== "string" || !/^all-v1:(19\d{2}|20\d{2}|2100)$/.test(key))) {
      throw new Error("Ungültige Vorlagen-Importhistorie.");
    }
    const revision = data.catalogRevision ?? 0;
    if (!Number.isInteger(revision) || revision < 0 || revision > CATALOG_REVISION) {
      throw new Error("Nicht unterstützte Version der Vorlagenbereinigung.");
    }
    const restoredManagement = Object.hasOwn(data, "management") ? window.NAKA_MANAGEMENT.validate(data.management) : undefined;
    return { activities: validated, templateImports: [...new Set(imports)], catalogRevision: revision, management: restoredManagement };
  }

  function updatedTemplateActivities(source, revision) {
    if (revision === CATALOG_REVISION) return source;
    return source.filter((activity) => {
      if (isNewsletterActivity(activity)) return false;
      if (revision >= 1) return true;
      if (!/^template-v1-\d{4}-(annual|newsletter|training)-/.test(activity.id)) return true;
      if (activity.type === "ongoing" || activity.type === "approximate") return false;
      const anniversary = new Date(parseDate(activity.start));
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
      return parseDate(activity.end) + DAY < anniversary.getTime();
    });
  }

  function isNewsletterActivity(activity) {
    return /newsletter|newsflash/i.test(`${activity.category} ${activity.title}`) ||
      /^template-v1-\d{4}-(newsletter-|annual-(75|76|78|79|80|81)-)/.test(activity.id);
  }

  async function persist(next, { restoring = false, imports = templateImports, revision = catalogRevision, management: nextManagement = management } = {}) {
    if (saving || synchronizing) {
      showError("Ein Speichervorgang oder eine Aktualisierung läuft bereits. Bitte warten und erneut versuchen.");
      return false;
    }
    if (!storageHealthy && !restoring) {
      showError("Die gespeicherten Daten konnten nicht gelesen werden. Bitte zuerst ein gültiges Backup laden. Bestehende Daten werden nicht überschrieben.");
      return false;
    }
    saving = true;
    $("save-status").textContent = cloud.enabled ? "Teamdaten werden gespeichert …" : "Wird gespeichert …";
    try {
      const payload = { version: 1, activities: next, templateImports: imports, catalogRevision: revision, management: nextManagement };
      if (cloud.enabled) await cloud.save(payload);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      showError(`Speichern nicht möglich: ${error.message} Die Änderung wurde nicht übernommen.`);
      $("save-status").textContent = "Nicht gespeichert – bitte Fehlermeldung beachten.";
      return false;
    } finally {
      saving = false;
    }
    activities = next;
    templateImports = imports;
    catalogRevision = revision;
    management = nextManagement;
    storageHealthy = true;
    $("error").hidden = true;
    $("save-status").textContent = cloud.enabled ? "Alle Änderungen im Team gespeichert." : "Alle Änderungen lokal gespeichert.";
    render();
    window.NAKA_MANAGEMENT.refresh();
    return true;
  }

  function templateDate(value, targetYear, endOfMonth = false) {
    const [month, day] = value.split("-").map(Number);
    const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
    return `${targetYear}-${String(month).padStart(2, "0")}-${String(endOfMonth ? lastDay : Math.min(day, lastDay)).padStart(2, "0")}`;
  }

  async function importTemplates(automatic = false) {
    const importKey = `all-v1:${year}`;
    if (templateImports.includes(importKey)) {
      notify(`Die Vorlagen für ${year} wurden bereits hinzugefügt. Ihre Änderungen und Löschungen bleiben erhalten.`);
      return;
    }
    if (!automatic && !confirm(`Aktivitäten aus Jahresplanung und Weiterbildungskontrolle für ${year} hinzufügen? Bestehende Aktivitäten bleiben erhalten. Newsletter sind nicht enthalten. Unklare Termine werden als vorläufig markiert.`)) return;
    let additions;
    try {
      if (!Array.isArray(window.NAKA_TEMPLATE_ACTIVITIES) || !window.NAKA_TEMPLATE_ACTIVITIES.length) {
        throw new Error("Die Datei template-activities.js fehlt oder enthält keine Aktivitäten.");
      }
      const existingIds = new Set(activities.map((activity) => activity.id));
      additions = window.NAKA_TEMPLATE_ACTIVITIES.map((template) => validateActivity({
        id: `template-v1-${year}-${template.key}`,
        title: template.title,
        category: template.category,
        owner: template.owner,
        start: templateDate(template.start, year),
        end: templateDate(template.end, year + template.endYearOffset, template.endOfMonth),
        type: template.type,
        status: "planned",
        provisional: template.provisional
      })).filter((activity) => !existingIds.has(activity.id));
    } catch (error) {
      showError(`Vorlagen konnten nicht hinzugefügt werden: ${error.message} Bestehende Aktivitäten bleiben unverändert.`);
      return;
    }
    if (await persist([...activities, ...additions], { imports: [...templateImports, importKey] })) {
      notify(`${additions.length} Aktivitäten aus den Vorlagen für ${year} hinzugefügt.`);
    }
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function iconButton(icon, label, action) {
    const button = make("button", "icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${icon}`);
    svg.append(use);
    button.append(svg);
    button.addEventListener("click", action);
    return button;
  }

  function bounds() {
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    return { start, end, days: (end - start) / DAY };
  }

  function yearActivities() {
    const { start, end } = bounds();
    return activities.filter((activity) => parseDate(activity.start) < end && parseDate(activity.end) >= start);
  }

  function percent(time) {
    const { start, end } = bounds();
    return (time - start) / (end - start) * 100;
  }

  function isoWeek(time) {
    const date = new Date(time);
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    return Math.ceil(((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  }

  function renderHeader() {
    const header = $("time-header");
    const now = new Date();
    header.replaceChildren();
    for (let month = 0; month < 12; month++) {
      const label = make("div", "month-label", MONTHS[month]);
      if (year === now.getFullYear() && month === now.getMonth()) {
        label.classList.add("current-month");
        label.setAttribute("aria-current", "date");
      }
      label.style.left = `${percent(Date.UTC(year, month, 1))}%`;
      label.style.width = `${percent(Date.UTC(year, month + 1, 1)) - percent(Date.UTC(year, month, 1))}%`;
      header.append(label);
    }
    if (view === "weeks") {
      const { start, end } = bounds();
      let cursor = start;
      while (cursor < end) {
        const weekday = new Date(cursor).getUTCDay() || 7;
        const next = Math.min(cursor + (8 - weekday) * DAY, end);
        const label = make("span", "week-label", `KW ${isoWeek(cursor)}`);
        label.style.left = `${percent(cursor)}%`;
        label.style.width = `${percent(next) - percent(cursor)}%`;
        header.append(label);
        cursor = next;
      }
    }
    $("timeline").classList.toggle("weeks", view === "weeks");
  }

  function focusCurrentMonth() {
    if ($("section-yearplan").hidden) return;
    const scroller = document.querySelector(".timeline-scroll");
    const month = $("time-header").querySelectorAll(".month-label")[new Date().getMonth()];
    const activityColumn = document.querySelector(".activity-column");
    scroller.scrollLeft += month.getBoundingClientRect().left - activityColumn.getBoundingClientRect().right;
  }

  function renderRow(activity) {
    const row = make("div", "activity-row");
    const info = make("div", "activity-info");
    const title = make("button", "activity-name", activity.title);
    title.title = `${activity.title} – bearbeiten`;
    title.addEventListener("click", () => openEditor(activity));
    const meta = make("div", "activity-meta");
    const dot = make("i", `status-dot ${activity.status}`);
    dot.title = STATUSES[activity.status];
    const detail = make("span", "", [activity.category, activity.owner].filter(Boolean).join(" · ") || "Noch nicht zugewiesen");
    detail.title = `${STATUSES[activity.status]} · ${detail.textContent}`;
    meta.append(dot, detail);
    if (activity.provisional) {
      const badge = make("span", "provisional-badge", "Termin prüfen");
      badge.title = "Vorläufiger Termin: Die Vorlage enthält keine eindeutige Tagesangabe oder widersprüchliche Datumsangaben.";
      meta.append(badge);
    }
    info.append(title, meta);

    const track = make("div", "row-track");
    for (let month = 1; month < 12; month++) {
      const line = make("span", "grid-line");
      line.style.left = `${percent(Date.UTC(year, month, 1))}%`;
      track.append(line);
    }
    const today = new Date();
    if (today.getFullYear() === year) {
      const marker = make("span", "today-line");
      marker.title = "Heute";
      marker.style.left = `${percent(Date.UTC(year, today.getMonth(), today.getDate()))}%`;
      track.append(marker);
    }
    const { start, end } = bounds();
    const left = percent(Math.max(start, parseDate(activity.start)));
    const right = percent(Math.min(end, parseDate(activity.end) + DAY));
    const bar = make("button", `time-bar ${activity.type}${activity.status === "done" ? " completed" : ""}`, activity.type === "fixed" ? "" : activity.title);
    bar.style.left = `${activity.type === "fixed" ? (left + right) / 2 : left}%`;
    bar.style.width = `${right - left}%`;
    const description = `${activity.title} · ${TYPES[activity.type]} · ${formatDate(activity.start)} – ${formatDate(activity.end)} · ${STATUSES[activity.status]}${activity.provisional ? " · Termin vorläufig – prüfen" : ""}`;
    bar.title = description;
    bar.setAttribute("aria-label", `${description} – bearbeiten`);
    bar.addEventListener("click", () => openEditor(activity));
    track.append(bar);
    const actions = make("div", "row-actions");
    actions.append(
      iconButton("edit", `${activity.title} bearbeiten`, () => openEditor(activity)),
      iconButton("trash", `${activity.title} löschen`, async () => {
        if (confirm(`Aktivität „${activity.title}“ endgültig löschen?`)) {
          if (await persist(activities.filter((item) => item.id !== activity.id))) notify("Aktivität gelöscht.");
        }
      })
    );
    row.append(info, track, actions);
    return row;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(parseDate(date)));
  }

  function render() {
    $("year").value = year;
    $("previous-year").disabled = year <= 1900;
    $("next-year").disabled = year >= 2100;
    renderHeader();
    const annual = yearActivities();
    const done = annual.filter((activity) => activity.status === "done").length;
    $("total-count").textContent = annual.length;
    $("progress-count").textContent = annual.filter((activity) => activity.status === "active").length;
    $("done-count").textContent = done;
    $("completion-label").textContent = annual.length ? `${Math.round(done / annual.length * 100)} % der Aktivitäten` : "Noch keine Aktivitäten";
    const provisionalCount = annual.filter((activity) => activity.provisional).length;
    $("template-notice").hidden = provisionalCount === 0;
    $("template-notice").textContent = `${provisionalCount} Aktivitäten mit vorläufigen Terminen: Wochen- und Monatsangaben sind Näherungen. Bitte prüfen Sie Datum und Zuständigkeit der markierten Einträge; bei bestätigten Terminen können Sie die Markierung im Editor entfernen.`;

    const category = $("category-filter").value;
    const categories = [...new Set(annual.map((activity) => activity.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
    $("category-filter").replaceChildren(new Option("Alle Bereiche", ""), ...categories.map((name) => new Option(name, name)));
    if (categories.includes(category)) $("category-filter").value = category;
    const allCategories = [...new Set(activities.map((activity) => activity.category).filter(Boolean))];
    $("category-suggestions").replaceChildren(...allCategories.map((name) => new Option(name, name)));
    const query = $("search").value.trim().toLocaleLowerCase("de");
    const selectedCategory = $("category-filter").value;
    const status = $("status-filter").value;
    const filtered = annual.filter((activity) =>
      (!query || `${activity.title} ${activity.owner} ${activity.category}`.toLocaleLowerCase("de").includes(query)) &&
      (!selectedCategory || activity.category === selectedCategory) &&
      (!status || activity.status === status)
    ).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "de"));
    $("activity-rows").replaceChildren(...filtered.map(renderRow));
    $("visible-count").textContent = `${filtered.length} ${filtered.length === 1 ? "Aktivität" : "Aktivitäten"}${filtered.length !== annual.length ? ` von ${annual.length}` : ""}`;
    $("reset-filters").hidden = !query && !selectedCategory && !status;
    const empty = $("empty-state");
    empty.hidden = filtered.length !== 0;
    empty.querySelector("h2").textContent = annual.length ? "Keine passenden Aktivitäten." : "Ein neues Jahr. Platz für Ihre Pläne.";
    empty.querySelector("p").textContent = annual.length ? "Passen Sie die Suche oder die Filter an, um Ihre Aktivitäten zu sehen." : "Beginnen Sie mit Ihrer ersten Aktivität. Termine, Zuständigkeiten und Fortschritt – alles an einem Ort.";
    $("empty-add").hidden = annual.length > 0;
    empty.querySelector("small").hidden = annual.length > 0;
    $("add-activity").disabled = !storageHealthy;
    $("empty-add").disabled = !storageHealthy;
    $("export").disabled = !storageHealthy;
    $("add-templates").disabled = !storageHealthy;
    const focusKey = `${year}:${view}`;
    if (timelineFocus !== focusKey) {
      timelineFocus = focusKey;
      focusCurrentMonth();
    }
  }

  function synchronizeDates() {
    const fixed = $("activity-type").value === "fixed";
    $("activity-end").readOnly = fixed;
    $("activity-end").min = $("activity-start").value || "1900-01-01";
    if (fixed) $("activity-end").value = $("activity-start").value;
  }

  function openEditor(activity = null) {
    if (saving || synchronizing || !storageHealthy) {
      showError("Bearbeitung derzeit nicht möglich. Bitte laufende Vorgänge abwarten oder die Fehlermeldung beachten.");
      return;
    }
    editingId = activity ? activity.id : null;
    $("activity-form").reset();
    $("form-error").textContent = "";
    $("dialog-title").textContent = activity ? "Aktivität bearbeiten" : "Aktivität hinzufügen";
    const now = new Date();
    const date = now.getFullYear() === year
      ? `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      : `${year}-01-01`;
    for (const field of ["title", "category", "owner", "start", "end", "type", "status"]) {
      $("activity-" + field).value = activity ? activity[field] : ({ start: date, end: date, type: "phase", status: "planned" }[field] || "");
    }
    $("activity-provisional").checked = activity?.provisional ?? false;
    synchronizeDates();
    $("activity-dialog").showModal();
    $("activity-title").focus();
  }

  $("activity-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    let activity;
    try {
      activity = validateActivity({ ...values, id: editingId || crypto.randomUUID(), provisional: $("activity-provisional").checked });
    } catch (error) {
      $("form-error").textContent = error.message;
      return;
    }
    const next = editingId ? activities.map((item) => item.id === editingId ? activity : item) : [...activities, activity];
    if (!await persist(next)) {
      $("form-error").textContent = $("error").textContent;
      return;
    }
    const { start, end } = bounds();
    if (parseDate(activity.start) >= end || parseDate(activity.end) < start) year = Number(activity.start.slice(0, 4));
    $("search").value = "";
    $("category-filter").value = "";
    $("status-filter").value = "";
    render();
    $("activity-dialog").close();
    notify(editingId ? "Aktivität aktualisiert." : "Aktivität hinzugefügt.");
  });
  $("add-activity").addEventListener("click", () => openEditor());
  $("empty-add").addEventListener("click", () => openEditor());
  $("add-templates").addEventListener("click", () => importTemplates());
  $("close-dialog").addEventListener("click", () => $("activity-dialog").close());
  $("cancel-dialog").addEventListener("click", () => $("activity-dialog").close());
  $("activity-start").addEventListener("change", synchronizeDates);
  $("activity-type").addEventListener("change", synchronizeDates);
  $("previous-year").addEventListener("click", () => { year--; render(); });
  $("next-year").addEventListener("click", () => { year++; render(); });
  $("current-month").addEventListener("click", () => {
    year = new Date().getFullYear();
    render();
    focusCurrentMonth();
  });
  $("year").addEventListener("change", () => {
    const value = Number($("year").value);
    if (!Number.isInteger(value) || value < 1900 || value > 2100) {
      $("year").value = year;
      notify("Bitte ein Jahr zwischen 1900 und 2100 wählen.");
      return;
    }
    year = value;
    render();
  });
  for (const mode of ["months", "weeks"]) {
    $(mode + "-view").addEventListener("click", () => {
      view = mode;
      for (const item of ["months", "weeks"]) {
        $(item + "-view").classList.toggle("selected", item === mode);
        $(item + "-view").setAttribute("aria-pressed", String(item === mode));
      }
      render();
      focusCurrentMonth();
    });
  }
  $("search").addEventListener("input", render);
  $("category-filter").addEventListener("change", render);
  $("status-filter").addEventListener("change", render);
  $("reset-filters").addEventListener("click", () => {
    $("search").value = "";
    $("category-filter").value = "";
    $("status-filter").value = "";
    render();
  });
  $("print").addEventListener("click", () => window.print());
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), activities, templateImports, catalogRevision, management }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = make("a");
    link.href = url;
    link.download = `NAKA-Gesamtbackup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Gesamtbackup für alle vier Bereiche exportiert.");
  });
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Die Backup-Datei darf höchstens 5 MB groß sein.");
      const restored = validateBackup(JSON.parse(await file.text()));
      const updated = updatedTemplateActivities(restored.activities, restored.catalogRevision);
      const removed = restored.activities.length - updated.length;
      const updateNotice = removed ? `${removed} ausgeschlossene Aktivitäten (Newsletter bzw. alte Vorlagen) werden dabei entfernt. ` : "";
      const scopeNotice = restored.management
        ? `Alle vier Bereiche werden ersetzt: ${restored.management.agms.length} HV, ${restored.management.resolutions.length} Beschlüsse und ${restored.management.meetings.length} Vorstandssitzungen im Backup.`
        : "Altes Jahresplan-Backup: Nur die Aktivitäten sämtlicher Jahre werden ersetzt. HV, Beschlussliste und Vorstandssitzungen bleiben erhalten.";
      if (!confirm(`Backup mit ${updated.length} Aktivitäten laden? ${updateNotice}${scopeNotice}`)) return;
      const nextManagement = restored.management ?? management ?? initialManagement();
      if (await persist(updated, { restoring: true, imports: restored.templateImports, revision: CATALOG_REVISION, management: nextManagement })) notify("Backup erfolgreich geladen.");
    } catch (error) {
      showError(`Backup konnte nicht geladen werden: ${error.message} Vorhandene Daten bleiben unverändert.`);
    } finally {
      event.target.value = "";
    }
  });

  function initialManagement() {
    return cloud.enabled ? { version: 1, agms: [], resolutions: [], meetings: [] } : window.NAKA_MANAGEMENT.createInitial();
  }

  function acceptData(data) {
    const restored = validateBackup(data);
    if (cloud.enabled && !restored.management) throw new Error("Teamdaten enthalten keine Verwaltungsdaten.");
    activities = restored.activities;
    templateImports = restored.templateImports;
    catalogRevision = restored.catalogRevision;
    management = restored.management ?? initialManagement();
    templatesInitialized = Object.hasOwn(data, "templateImports");
  }

  try {
    const stored = cloud.enabled ? cloudData : localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      acceptData(cloud.enabled ? stored : JSON.parse(stored));
    } else management = initialManagement();
  } catch (error) {
    storageHealthy = false;
    $("save-status").textContent = "Daten nicht verfügbar.";
    showError(`Daten konnten nicht gelesen werden: ${error.message} Bitte ein gültiges Backup laden oder die Konfiguration prüfen. Vorhandene Daten werden nicht überschrieben.`);
  }
  render();
  let catalogReady = true;
  if (storageHealthy && catalogRevision < CATALOG_REVISION) {
    const updated = updatedTemplateActivities(activities, catalogRevision);
    const removed = activities.length - updated.length;
    catalogReady = await persist(updated, { revision: CATALOG_REVISION });
    if (catalogReady && removed) notify(`Plan aktualisiert: ${removed} ausgeschlossene Newsletter- und Vorlagen-Aktivitäten entfernt.`);
  }
  if (!cloud.enabled && storageHealthy && catalogReady && !templatesInitialized) await importTemplates(true);
  if (!cloud.enabled && storageHealthy && management) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || !Object.hasOwn(stored, "management")) await persist(activities);
    } catch (error) {
      storageHealthy = false;
      showError(`Verwaltungsdaten konnten nicht gespeichert werden: ${error.message} Bitte ein Backup laden.`);
      render();
    }
  }
  window.NAKA_MANAGEMENT.init({
    get: () => management,
    healthy: () => storageHealthy && management !== null && !saving && !synchronizing,
    cloud: cloud.enabled,
    save: (next) => persist(activities, { management: next }),
    notify, showError, onShowPlanner: focusCurrentMonth
  });
  if (cloud.enabled) {
    $("add-templates").hidden = true;
    document.querySelector(".local-note").textContent = "Geschützter Teamzugang · Supabase";
    document.querySelector(".private-badge").textContent = "Team · Anmeldung erforderlich";
    $("storage-description").textContent = "Gemeinsame Daten in Supabase. Internetverbindung erforderlich. Regelmäßig ein Gesamtbackup exportieren.";
    $("save-status").textContent = "Teamdaten geladen.";
    $("empty-state").querySelector("small").textContent = "Neue Aktivitäten erstellen oder ein vorhandenes Gesamtbackup über „Backup laden“ ins Team übernehmen.";
    $("cloud-toolbar").hidden = false;
    const guide = document.querySelector(".user-guide");
    guide.querySelector("p").textContent = "Diese Web-Version speichert alle vier Arbeitsbereiche gemeinsam in Supabase. Vorlagen und interne Unterlagen werden nicht öffentlich mitgeliefert. Die Administration kann sie nach der Anmeldung über ein Gesamtbackup importieren.";
    guide.querySelector("li:last-child").textContent = "Daten sichern: Ein Gesamtbackup enthält alle vier Bereiche. Das Laden ersetzt die gemeinsamen Teamdaten nach Bestätigung – vorher mit dem Team abstimmen.";
    cloud.watch({
      blocked: () => saving || synchronizing || Boolean(document.querySelector("dialog[open]")),
      receive: (data) => {
        synchronizing = true;
        try {
          acceptData(data);
          storageHealthy = true;
          $("error").hidden = true;
          render();
        } finally { synchronizing = false; }
        window.NAKA_MANAGEMENT.refresh();
      },
      failed: (message) => showError(`Teamabgleich fehlgeschlagen: ${message}`)
    });
  }
  window.addEventListener("pageshow", () => requestAnimationFrame(focusCurrentMonth));
  window.addEventListener("resize", focusCurrentMonth);
})();
