"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const TASK_STATUS = { planned: "Offen", active: "In Bearbeitung", done: "Erledigt" };
  const RESOLUTION_STATUS = { review: "Gültigkeit prüfen", valid: "Gültig", superseded: "Ersetzt", repealed: "Aufgehoben" };
  const LABELS = { yearplan: "Jahresplanung", agm: "Hauptversammlung", resolutions: "Beschlussliste", board: "Vorstandssitzungen" };
  const selected = { agms: null, meetings: null };
  const filters = { agms: { query: "", status: "" }, meetings: { query: "", status: "" }, resolutions: { query: "", status: "", topic: "" } };
  let api;
  let activeSection = "yearplan";
  let submitEditor;

  function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ungültiger Verwaltungseintrag.");
  }

  function text(value, field, max, required = false) {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
      throw new Error(`Ungültiges Feld „${field}“ (maximal ${max} Zeichen).`);
    }
    return value.trim();
  }

  function date(value) {
    if (value === "") return value;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2100-12-31") {
      throw new Error("Bitte ein gültiges Datum zwischen 1900 und 2100 eingeben.");
    }
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error("Ungültiges Kalenderdatum.");
    return value;
  }

  function status(value, choices) {
    if (!Object.hasOwn(choices, value)) throw new Error("Ungültiger Status.");
    return value;
  }

  function list(value, validate, max = 5000) {
    if (!Array.isArray(value) || value.length > max) throw new Error("Ungültige oder zu große Eintragsliste.");
    const result = value.map(validate);
    if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error("Doppelte Eintrags-IDs.");
    return result;
  }

  function validateTask(value) {
    record(value);
    if (typeof value.decision !== "boolean") throw new Error("Ungültige Beschlussmarkierung.");
    if (typeof value.time !== "string" || (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) throw new Error("Ungültige Uhrzeit.");
    return {
      id: text(value.id, "ID", 100, true), title: text(value.title, "Aufgabe", 160, true),
      owner: text(value.owner, "Verantwortlich", 120), group: text(value.group, "Bereich", 80),
      time: value.time, due: date(value.due), status: status(value.status, TASK_STATUS),
      decision: value.decision, notes: text(value.notes, "Hinweise", 10000)
    };
  }

  function validateMeeting(value) {
    record(value);
    return {
      id: text(value.id, "ID", 100, true), title: text(value.title, "Titel", 160, true),
      date: date(value.date), location: text(value.location, "Ort", 200),
      participants: text(value.participants, "Teilnehmende", 2000),
      notes: text(value.notes, "Hinweise", 20000), minutes: text(value.minutes, "Protokoll", 200000),
      tasks: list(value.tasks, validateTask, 2000)
    };
  }

  function validateResolution(value) {
    record(value);
    return {
      id: text(value.id, "ID", 100, true), title: text(value.title, "Titel", 160, true),
      topic: text(value.topic, "Thema", 100), text: text(value.text, "Beschlusstext", 20000, true),
      reference: text(value.reference, "Referenz", 1000), date: date(value.date),
      status: status(value.status, RESOLUTION_STATUS), notes: text(value.notes, "Hinweise", 10000)
    };
  }

  function validate(value) {
    record(value);
    if (value.version !== 1) throw new Error("Nicht unterstützte Version der Verwaltungsdaten.");
    return { version: 1, agms: list(value.agms, validateMeeting, 500), meetings: list(value.meetings, validateMeeting, 1000), resolutions: list(value.resolutions, validateResolution) };
  }

  function createInitial() {
    const source = window.NAKA_MANAGEMENT_DATA;
    if (!source || !Array.isArray(source.agmTasks) || !source.agmTasks.length || !Array.isArray(source.resolutions) || !source.resolutions.length) {
      throw new Error("Die Verwaltungs-Vorlagen fehlen. Bitte management-data.js mit der App ablegen.");
    }
    return validate({
      version: 1,
      agms: [{
        id: "agm-regiebuch-source", title: "HV – Regiebuch (Vorlage)", date: "", location: "Bern (Vorlage – prüfen)",
        participants: "", minutes: "",
        notes: "Quelle: Regiebuch HV 2025.xlsx. Die Überschrift lautet „Regiebuch Hauptversammlung vom 25.05.2024 in Bern“. Das Blatt Wahlen reicht bis 2026. Datum deshalb nicht vorbelegt. Personen, Beträge, Jahre und Hinweise sind historische Vorlagenangaben und müssen angepasst werden. Beschlussmarkierungen bedeuten Abstimmungsbedarf, nicht einen gefassten Beschluss.",
        tasks: source.agmTasks
      }],
      resolutions: source.resolutions, meetings: []
    });
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function button(label, action, className = "button secondary", writable = true) {
    const node = el("button", className, label);
    node.type = "button";
    node.disabled = writable && !api.healthy();
    node.addEventListener("click", () => {
      if (writable && !api.healthy()) {
        api.showError("Bitte laufende Vorgänge abwarten oder die Fehlermeldung beachten.");
        return;
      }
      action();
    });
    return node;
  }

  function badge(label) {
    return el("span", "management-badge", label);
  }

  function displayDate(value) {
    return value ? value.split("-").reverse().join(".") : "Termin offen";
  }

  function details(label, content) {
    const node = el("details", "record-notes");
    node.append(el("summary", "", label), el("p", "preserve-lines", content));
    return node;
  }

  async function commit(next) {
    try {
      const validated = validate(next);
      if (!await api.save(validated)) {
        $("management-form-error").textContent = $("error").textContent;
        refresh();
        return false;
      }
      api.notify(api.cloud ? "Änderung im Team gespeichert." : "Änderung lokal gespeichert.");
      return true;
    } catch (error) {
      $("management-form-error").textContent = error.message;
      api.showError(`Änderung nicht übernommen: ${error.message}`);
      return false;
    }
  }

  function updateMeeting(kind, meeting) {
    const state = api.get();
    const exists = state[kind].some((item) => item.id === meeting.id);
    return commit({ ...state, [kind]: exists ? state[kind].map((item) => item.id === meeting.id ? meeting : item) : [...state[kind], meeting] });
  }

  function openEditor(title, fields, values, save) {
    $("management-form").reset();
    $("management-dialog-title").textContent = title;
    $("management-form-error").textContent = "";
    $("management-fields").replaceChildren();
    for (const [name, label, type, max, required, choices] of fields) {
      const wrapper = el("label", type === "textarea" || name === "title" ? "wide" : "");
      wrapper.textContent = label;
      const control = el(type === "textarea" ? "textarea" : type === "select" ? "select" : "input");
      control.name = name;
      control.id = `management-${name}`;
      if (type !== "textarea" && type !== "select") control.type = type;
      if (type === "checkbox") {
        wrapper.classList.add("checkbox-label");
        control.checked = values[name] ?? false;
      } else {
        if (choices) for (const [value, caption] of Object.entries(choices)) control.append(new Option(caption, value));
        control.value = values[name] ?? "";
      }
      if (max) control.maxLength = max;
      if (required) control.required = true;
      if (type === "date") { control.min = "1900-01-01"; control.max = "2100-12-31"; }
      if (type === "textarea") control.rows = name === "minutes" ? 12 : 5;
      wrapper.append(control);
      $("management-fields").append(wrapper);
    }
    submitEditor = async () => {
      const data = Object.fromEntries(new FormData($("management-form")));
      for (const [name, , type] of fields) if (type === "checkbox") data[name] = $(`management-${name}`).checked;
      const submit = $("management-form").querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (await save(data)) $("management-dialog").close();
      } finally { submit.disabled = false; }
    };
    $("management-dialog").showModal();
    $("management-fields").querySelector("input,textarea,select").focus();
  }

  function editMeeting(kind, meeting = null, copy = null) {
    const values = meeting || { title: kind === "agms" ? "Nächste Hauptversammlung" : "Vorstandssitzung", date: "", location: "", participants: "", notes: "", minutes: "" };
    openEditor(meeting ? "Sitzung bearbeiten" : kind === "agms" ? "Hauptversammlung hinzufügen" : "Vorstandssitzung hinzufügen", [
      ["title", "Titel", "text", 160, true], ["date", "Datum (optional)", "date"],
      ["location", "Ort / Videokonferenz", "text", 200], ["participants", "Teilnehmende", "textarea", 2000],
      ["notes", "Organisation / Hinweise", "textarea", 20000], ["minutes", "Protokoll / Beschlüsse", "textarea", 200000]
    ], values, async (data) => {
      const id = meeting?.id || crypto.randomUUID();
      const next = {
        ...data, id, tasks: meeting?.tasks || (copy ? copy.tasks.map((task) => ({ ...task, id: crypto.randomUUID(), due: "", status: "planned" })) : [])
      };
      if (!await updateMeeting(kind, next)) return false;
      selected[kind] = id;
      refresh();
      return true;
    });
  }

  function editTask(kind, meeting, task = null) {
    openEditor(task ? "Aufgabe bearbeiten" : "Aufgabe hinzufügen", [
      ["title", "Aufgabe", "text", 160, true], ["group", "Bereich / Traktandum", "text", 80],
      ["owner", "Verantwortlich", "text", 120], ["due", "Frist (optional)", "date"],
      ["time", "Uhrzeit im Ablauf (optional)", "time"], ["status", "Status", "select", null, true, TASK_STATUS],
      ["decision", "Abstimmung / Beschluss erforderlich", "checkbox"], ["notes", "Hinweise / Ergebnis / nächste Schritte", "textarea", 10000]
    ], task || { group: kind === "agms" ? "Vorbereitung" : "Nachverfolgung", status: "planned" }, (data) => {
      const current = api.get()[kind].find((item) => item.id === meeting.id);
      const next = { ...data, id: task?.id || crypto.randomUUID() };
      return updateMeeting(kind, { ...current, tasks: task ? current.tasks.map((item) => item.id === task.id ? next : item) : [...current.tasks, next] });
    });
  }

  function editResolution(item = null) {
    openEditor(item ? "Beschluss bearbeiten" : "Beschluss hinzufügen", [
      ["title", "Titel", "text", 160, true], ["topic", "Thema", "text", 100],
      ["reference", "Protokoll- / Quellenreferenz", "text", 1000], ["date", "Beschlussdatum (optional)", "date"],
      ["status", "Gültigkeit", "select", null, true, RESOLUTION_STATUS],
      ["text", "Beschlusstext", "textarea", 20000, true], ["notes", "Hinweise / ersetzt durch", "textarea", 10000]
    ], item || { status: "review" }, (data) => {
      const state = api.get();
      const next = { ...data, id: item?.id || crypto.randomUUID() };
      return commit({ ...state, resolutions: item ? state.resolutions.map((entry) => entry.id === item.id ? next : entry) : [...state.resolutions, next] });
    });
  }

  function heading(panel, title, description, actions) {
    const header = el("header", "page-heading");
    const words = el("div");
    const h1 = el("h1", "", title);
    h1.tabIndex = -1;
    words.append(el("div", "eyebrow", "PLANUNG & ORGANISATION"), h1, el("p", "", description));
    const buttons = el("div", "management-actions");
    buttons.append(...actions);
    header.append(words, buttons);
    panel.append(header);
  }

  function filterControls(kind, choices, renderList) {
    const bar = el("div", "management-filters");
    const query = el("input");
    query.type = "search";
    query.placeholder = "Titel, Person oder Text suchen …";
    query.setAttribute("aria-label", `${kind === "resolutions" ? "Beschlüsse" : "Aufgaben"} suchen`);
    query.value = filters[kind].query;
    query.addEventListener("input", () => { filters[kind].query = query.value; renderList(); });
    const state = el("select");
    state.setAttribute("aria-label", kind === "resolutions" ? "Gültigkeit filtern" : "Aufgabenstatus filtern");
    state.append(new Option("Alle Status", ""), ...Object.entries(choices).map(([value, label]) => new Option(label, value)));
    state.value = filters[kind].status;
    state.addEventListener("change", () => { filters[kind].status = state.value; renderList(); });
    bar.append(query, state);
    return bar;
  }

  function matches(task, filter) {
    const query = filter.query.trim().toLocaleLowerCase("de");
    return (!filter.status || task.status === filter.status) &&
      (!query || `${task.title} ${task.owner} ${task.group} ${task.notes}`.toLocaleLowerCase("de").includes(query));
  }

  function taskTable(kind, meeting, container) {
    const tasks = meeting.tasks.filter((task) => matches(task, filters[kind]));
    container.replaceChildren();
    container.append(el("p", "record-count", `${tasks.length} von ${meeting.tasks.length} Aufgaben · ${meeting.tasks.filter((task) => task.status !== "done").length} offen`));
    if (!tasks.length) {
      container.append(el("p", "management-empty", "Keine Aufgaben vorhanden oder keine passenden Suchergebnisse."));
      return;
    }
    const scroll = el("div", "management-table-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "Aufgaben, horizontal scrollbar");
    const table = el("table", "management-table");
    const thead = el("thead");
    const header = el("tr");
    for (const name of ["Aufgabe / Bereich", "Verantwortlich", "Uhrzeit / Frist", "Status", "Aktionen"]) header.append(el("th", "", name));
    thead.append(header);
    const tbody = el("tbody");
    for (const task of tasks) {
      const row = el("tr");
      const title = el("td");
      title.append(button(task.title, () => editTask(kind, meeting, task), "record-title"));
      const meta = el("div", "record-meta");
      if (task.group) meta.append(badge(task.group));
      if (task.decision) meta.append(badge("Beschluss erforderlich"));
      title.append(meta);
      if (task.notes) title.append(details("Hinweise / Ergebnis", task.notes));
      const timing = el("td", "preserve-lines", [task.time, task.due ? `Frist: ${displayDate(task.due)}` : ""].filter(Boolean).join("\n") || "–");
      const stateCell = el("td");
      const state = el("select");
      state.setAttribute("aria-label", `Status: ${task.title}`);
      state.append(...Object.entries(TASK_STATUS).map(([value, label]) => new Option(label, value)));
      state.value = task.status;
      state.disabled = !api.healthy();
      state.addEventListener("change", () => {
        const current = api.get()[kind].find((item) => item.id === meeting.id);
        updateMeeting(kind, { ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: state.value } : item) });
      });
      stateCell.append(state);
      const actions = el("td", "record-actions");
      actions.append(button("Bearbeiten", () => editTask(kind, meeting, task), "text-button"),
        button("Löschen", () => {
          if (!confirm(`Aufgabe „${task.title}“ löschen?`)) return;
          const current = api.get()[kind].find((item) => item.id === meeting.id);
          updateMeeting(kind, { ...current, tasks: current.tasks.filter((item) => item.id !== task.id) });
        }, "text-button danger"));
      row.append(title, el("td", "", task.owner || "Noch offen"), timing, stateCell, actions);
      tbody.append(row);
    }
    table.append(thead, tbody);
    scroll.append(table);
    container.append(scroll);
  }

  function openBoardTasks(container) {
    const state = api.get();
    const tasks = state.meetings.flatMap((meeting) => meeting.tasks.filter((task) => task.status !== "done" && matches(task, { ...filters.meetings, status: "" })).map((task) => ({ meeting, task })))
      .sort((a, b) => (a.task.due || "9999").localeCompare(b.task.due || "9999"));
    container.replaceChildren(el("h2", "", `Offene Aufgaben aus allen Sitzungen (${tasks.length})`));
    if (!tasks.length) container.append(el("p", "management-empty", "Keine offenen Aufgaben für diese Suche. Aufgaben einer Sitzung hinzufügen und hier zentral nachverfolgen."));
    for (const { meeting, task } of tasks) {
      const row = el("div", "open-task");
      row.append(button(task.title, () => editTask("meetings", meeting, task), "record-title"),
        el("span", "", `${task.owner || "Zuständigkeit offen"} · ${task.due ? displayDate(task.due) : "Frist offen"} · ${TASK_STATUS[task.status]}`),
        button(meeting.title, () => { selected.meetings = meeting.id; refresh(); $("board-meeting-detail").scrollIntoView({ block: "start" }); }, "text-button", false));
      container.append(row);
    }
  }

  function renderMeetings(kind) {
    const isAgm = kind === "agms";
    const panel = $(isAgm ? "section-agm" : "section-board");
    panel.replaceChildren();
    const state = api.get();
    const meetings = state?.[kind] || [];
    if (!meetings.some((item) => item.id === selected[kind])) selected[kind] = meetings[0]?.id || null;
    const meeting = meetings.find((item) => item.id === selected[kind]);
    const actions = [button(isAgm ? "HV hinzufügen" : "Sitzung hinzufügen", () => editMeeting(kind), "button primary")];
    if (isAgm && meeting) actions.push(button("Nächste HV: Aufgaben kopieren", () => editMeeting(kind, null, meeting)));
    actions.push(button("Drucken", () => window.print(), "button secondary", false));
    heading(panel, isAgm ? "Hauptversammlung" : "Vorstandssitzungen", isAgm ? "Regiebuch, Material und Wahlplanung gemeinsam pflegen." : "Sitzungen, Protokolle und offene Aufgaben an einem Ort.", actions);
    const guide = api.cloud
      ? "Die Teamversion startet ohne öffentlich eingebettete Unterlagen. Vorhandene Informationen können über ein privates Gesamtbackup importiert werden. Zuständigkeiten, historische Datumsangaben und Beschlussmarkierungen vor der nächsten HV prüfen. Neue Sitzungen und Aufgaben ergänzen oder die Aufgaben einer vorhandenen HV mit „Nächste HV: Aufgaben kopieren“ übernehmen; Fristen und Status werden dabei zurückgesetzt. Protokolle werden nicht kopiert."
      : isAgm
      ? "Die Vorlage enthält 37 Ablaufpunkte, 14 Materialpunkte und 6 Wahlprüfungen. Namen, Uhrzeiten, Jahreszahlen und Sprechtexte wurden übernommen und sind editierbar. Dateiname 2025, Überschrift 25.05.2024, Wahlplanung bis 2026: bitte vor Verwendung prüfen. Das HV-Datum ist offen. „Beschluss erforderlich“ ist kein bestätigter Beschluss. Für die nächste HV Aufgaben kopieren: Status und Fristen werden zurückgesetzt; Zuständigkeiten, Uhrzeiten und Aufgabenhinweise bleiben zur Überarbeitung erhalten. Alte Sitzungsnotizen und Protokolle werden nicht kopiert. Die Materialliste „früher“ und ehemalige Mitglieder wurden nicht als neue Aufgaben importiert."
      : "Sitzung mit Datum, Teilnehmenden und Protokoll anlegen. Aufgaben erhalten Zuständigkeit, Frist und Status. Die offene Aufgabenliste bündelt unerledigte Punkte aus allen Sitzungen; auf den Sitzungstitel klicken, um zur zugehörigen Sitzung zu wechseln. Es wurden keine Sitzungen oder Protokolle erfunden.";
    panel.append(details("So nutzen Sie diesen Bereich / Quellenhinweise", !isAgm && api.cloud
      ? "Neue Sitzung mit Datum, Teilnehmenden und Protokoll anlegen. Aufgaben erhalten Zuständigkeit, Frist und Status. Die offene Aufgabenliste bündelt unerledigte Punkte aus allen Sitzungen. Änderungen werden gemeinsam in Supabase gespeichert; bei Speicherkonflikten Entwurf kopieren und Teamdaten neu laden."
      : guide));
    if (!state) return;
    const summary = el("p", "record-count", `${meetings.length} ${isAgm ? "Hauptversammlungen" : "Vorstandssitzungen"} · ${meetings.reduce((count, item) => count + item.tasks.filter((task) => task.status !== "done").length, 0)} offene Aufgaben`);
    panel.append(summary);
    const chooser = el("div", "meeting-toolbar");
    const select = el("select");
    select.setAttribute("aria-label", isAgm ? "Hauptversammlung auswählen" : "Vorstandssitzung auswählen");
    select.append(...meetings.map((item) => new Option(`${item.title} · ${displayDate(item.date)}`, item.id)));
    select.value = selected[kind] || "";
    select.disabled = !meetings.length;
    select.addEventListener("change", () => { selected[kind] = select.value; refresh(); });
    chooser.append(select);
    if (meeting) chooser.append(button("Sitzung / Protokoll bearbeiten", () => editMeeting(kind, meeting)),
      button("Sitzung löschen", () => {
        if (!confirm(`„${meeting.title}“ einschließlich Protokoll und ${meeting.tasks.length} Aufgaben löschen?`)) return;
        commit({ ...api.get(), [kind]: api.get()[kind].filter((item) => item.id !== meeting.id) });
      }, "text-button danger"));
    panel.append(chooser);
    const taskContainer = el("div");
    const openTasks = el("section", "management-card");
    openTasks.id = "board-open-tasks";
    const drawTasks = () => {
      if (meeting) taskTable(kind, meeting, taskContainer);
      if (!isAgm) openBoardTasks(openTasks);
    };
    panel.append(filterControls(kind, TASK_STATUS, drawTasks));
    if (!isAgm) panel.append(openTasks);
    if (!meeting) {
      panel.append(el("p", "management-empty", isAgm ? "Noch keine HV. Eine neue Hauptversammlung hinzufügen." : "Noch keine Vorstandssitzung. Beginnen Sie mit „Sitzung hinzufügen“."));
      drawTasks();
      return;
    }
    const card = el("article", "management-card");
    card.id = isAgm ? "agm-meeting-detail" : "board-meeting-detail";
    card.append(el("h2", "", meeting.title), el("p", "record-meta", `${displayDate(meeting.date)} · ${meeting.location || "Ort offen"}`));
    if (meeting.participants) card.append(el("p", "preserve-lines", `Teilnehmende: ${meeting.participants}`));
    if (meeting.notes) card.append(details("Organisation / Quellenhinweise", meeting.notes));
    card.append(details("Protokoll / Beschlüsse", meeting.minutes || "Noch kein Protokoll. Über „Sitzung / Protokoll bearbeiten“ erfassen."));
    const taskHeading = el("div", "management-actions task-heading");
    taskHeading.append(el("h2", "", "Aufgaben & Checkliste"), button("Aufgabe hinzufügen", () => editTask(kind, meeting), "button primary"));
    card.append(taskHeading, taskContainer);
    panel.append(card);
    drawTasks();
  }

  function renderResolutions() {
    const panel = $("section-resolutions");
    panel.replaceChildren();
    heading(panel, "Beschlussliste", "Beschlüsse alphabetisch finden, prüfen und weiterführen.", [
      button("Beschluss hinzufügen", () => editResolution(), "button primary"),
      button("Drucken", () => window.print(), "button secondary", false)
    ]);
    panel.append(details("So nutzen Sie die Beschlussliste / Quellenhinweise", api.cloud
      ? "Beschlüsse hinzufügen oder vorhandene Einträge über ein privates Gesamtbackup importieren. Nach Thema, Text, Referenz oder Gültigkeit suchen. Historische Beschlüsse vor der Kennzeichnung als gültig prüfen und Nachfolgebeschlüsse in den Hinweisen vermerken. Das Register erzeugt keine Aktivitäten im Jahresplan."
      : "162 Text-Einträge aus „Beschlussliste alphabetisch aktuell hoch.docx“ wurden mit Originaltext und Referenz übernommen. Leere Überschriften setzen das vorherige Thema fort; Mehrfachnennungen bleiben erhalten. Alle importierten Beschlüsse stehen zunächst auf „Gültigkeit prüfen“: historische Texte können später ersetzt worden sein. Das Beschlussdatum bleibt offen, da Referenzcodes nicht eindeutig sind. Nach Prüfung Gültigkeit setzen und Änderungen bzw. Nachfolgebeschlüsse in den Hinweisen vermerken. Die Liste ist ein Register, keine Aufgabenliste; historische Newsletter-Beschlüsse erzeugen keine Newsletter-Aktivitäten im Jahresplan."));
    const records = api.get()?.resolutions || [];
    const container = el("div");
    container.id = "resolution-list";
    const filter = filters.resolutions;
    const draw = () => {
      const query = filter.query.trim().toLocaleLowerCase("de");
      const visible = records.filter((item) => (!filter.status || item.status === filter.status) && (!filter.topic || item.topic === filter.topic) &&
        (!query || `${item.title} ${item.topic} ${item.text} ${item.reference} ${item.notes}`.toLocaleLowerCase("de").includes(query)))
        .sort((a, b) => a.title.localeCompare(b.title, "de") || a.reference.localeCompare(b.reference, "de"));
      container.replaceChildren(el("p", "record-count", `${visible.length} von ${records.length} Beschlüssen · ${records.filter((item) => item.status === "review").length} zu prüfen`));
      if (!visible.length) container.append(el("p", "management-empty", "Keine Beschlüsse vorhanden oder keine passenden Suchergebnisse."));
      for (const item of visible) {
        const card = el("article", "management-card resolution-card");
        const header = el("div", "resolution-heading");
        const title = el("h2");
        title.append(button(item.title, () => editResolution(item), "record-title"));
        header.append(title, badge(RESOLUTION_STATUS[item.status]));
        card.append(header, el("p", "record-meta", [item.topic, item.reference, item.date ? displayDate(item.date) : "Datum nicht erfasst"].filter(Boolean).join(" · ")),
          el("p", "preserve-lines resolution-text", item.text));
        if (item.notes) card.append(details("Hinweise / Quelle", item.notes));
        const actions = el("div", "management-actions record-edit-actions");
        actions.append(button("Bearbeiten", () => editResolution(item), "text-button"), button("Löschen", () => {
          if (confirm(`Beschluss „${item.title}“ löschen?`)) commit({ ...api.get(), resolutions: api.get().resolutions.filter((entry) => entry.id !== item.id) });
        }, "text-button danger"));
        card.append(actions);
        container.append(card);
      }
    };
    const controls = filterControls("resolutions", RESOLUTION_STATUS, draw);
    const topic = el("select");
    topic.setAttribute("aria-label", "Beschlussthema filtern");
    const topics = [...new Set(records.map((item) => item.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
    if (filter.topic && !topics.includes(filter.topic)) filter.topic = "";
    topic.append(new Option("Alle Themen", ""), ...topics.map((name) => new Option(name, name)));
    topic.value = filter.topic;
    topic.addEventListener("change", () => { filter.topic = topic.value; draw(); });
    controls.append(topic);
    panel.append(controls, container);
    draw();
  }

  function refresh() {
    if (!api) return;
    if (activeSection === "agm") renderMeetings("agms");
    if (activeSection === "board") renderMeetings("meetings");
    if (activeSection === "resolutions") renderResolutions();
  }

  function init(controller) {
    api = controller;
    for (const item of document.querySelectorAll("[data-section]")) {
      item.addEventListener("click", () => {
        activeSection = item.dataset.section;
        for (const [section] of Object.entries(LABELS)) $(`section-${section}`).hidden = section !== activeSection;
        for (const link of document.querySelectorAll("[data-section]")) {
          const current = link.dataset.section === activeSection;
          link.classList.toggle("nav-active", current);
          if (current) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
        $("current-section").textContent = LABELS[activeSection];
        const templates = $("add-templates");
        if (templates) templates.hidden = activeSection !== "yearplan" || api.cloud;
        refresh();
        const heading = $(`section-${activeSection}`).querySelector("h1");
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        if (activeSection === "yearplan") requestAnimationFrame(api.onShowPlanner);
      });
    }
    $("management-form").addEventListener("submit", (event) => { event.preventDefault(); submitEditor(); });
    for (const id of ["management-close", "management-cancel"]) $(id).addEventListener("click", () => $("management-dialog").close());
  }

  window.NAKA_MANAGEMENT = { validate, createInitial, init, refresh };
})();
