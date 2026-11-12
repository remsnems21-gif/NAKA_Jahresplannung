"use strict";

(() => {
  const config = window.NAKA_SUPABASE_CONFIG;
  const $ = (id) => document.getElementById(id);
  const enabled = Boolean(config) || location.protocol !== "file:";
  let session = null;
  let revision = null;
  let resolvingLogin;
  let refreshing = null;
  let busy = false;
  let changed = false;
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (enabled && location.hash) history.replaceState(null, "", location.pathname + location.search);

  function message(value) {
    $("auth-error").textContent = value;
  }

  async function request(path, { method = "GET", body, authenticated = false, prefer } = {}) {
    if (!config || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) || !config.publishableKey?.startsWith("sb_publishable_")) {
      throw new Error("Supabase-Konfiguration fehlt oder ist ungültig. Bitte die Web-Version neu erstellen.");
    }
    if (authenticated) await ensureSession();
    const headers = { apikey: config.publishableKey, "Content-Type": "application/json" };
    if (authenticated) headers.Authorization = `Bearer ${session.access_token}`;
    if (prefer) headers.Prefer = prefer;
    let response;
    try {
      response = await fetch(config.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), cache: "no-store", credentials: "omit" });
    } catch (error) {
      throw new Error(`Supabase nicht erreichbar. Internetverbindung prüfen. Es wurde kein lokaler Ersatz gespeichert. (${error.name})`);
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { throw new Error(`Supabase lieferte keine gültige JSON-Antwort (HTTP ${response.status}).`); }
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        session = null;
        throw new Error("Sitzung abgelaufen. Entwurf kopieren und erneut anmelden.");
      }
      const detail = data?.msg || data?.message || data?.error_description || `HTTP ${response.status}`;
      throw new Error(`Supabase: ${detail}`);
    }
    return data;
  }

  function acceptSession(data) {
    if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || !Number.isFinite(data.expires_in)) {
      throw new Error("Ungültige Anmeldeantwort von Supabase.");
    }
    session = { access_token: data.access_token, refresh_token: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
  }

  async function ensureSession() {
    if (!session) throw new Error("Bitte erneut anmelden. Nicht gespeicherte Entwürfe vorher kopieren.");
    if (session.expiresAt > Date.now() + 60000) return;
    if (!refreshing) {
      refreshing = request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } })
        .then(acceptSession).finally(() => { refreshing = null; });
    }
    await refreshing;
  }

  async function read() {
    const rows = await request("/rest/v1/naka_workspace?id=eq.main&select=payload,revision", { authenticated: true });
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("Kein Zugriff auf die Teamdaten. Die Administration muss das SQL-Setup ausführen und Ihr Konto in naka_members freigeben.");
    }
    const row = rows[0];
    if (!Number.isSafeInteger(row.revision) || row.revision < 0 || !row.payload || typeof row.payload !== "object") {
      throw new Error("Ungültige Teamdaten. Bitte die Administration kontaktieren; die Daten wurden nicht ersetzt.");
    }
    return row;
  }

  async function finishLogin() {
    const user = await request("/auth/v1/user", { authenticated: true });
    if (!user?.id || !user.email) throw new Error("Benutzerkonto konnte nicht bestätigt werden.");
    const row = await read();
    revision = row.revision;
    $("auth-email").value = "";
    $("auth-password").value = "";
    $("new-password").value = "";
    $("confirm-password").value = "";
    $("auth-panel").hidden = true;
    $("app-shell").hidden = false;
    $("cloud-user").textContent = user.email;
    $("cloud-toolbar").hidden = false;
    resolvingLogin(row.payload);
  }

  async function save(payload) {
    if (changed) throw new Error("Eine andere Person hat Änderungen gespeichert. Entwurf kopieren, Dialog schließen und „Teamdaten neu laden“ wählen. Danach die Änderung erneut eintragen.");
    const serialized = JSON.stringify(payload);
    if (new Blob([serialized]).size > 5 * 1024 * 1024) throw new Error("Teamdaten überschreiten 5 MB. Bitte ein Backup erstellen und alte Einträge archivieren.");
    const rows = await request(`/rest/v1/naka_workspace?id=eq.main&revision=eq.${revision}&select=revision`, {
      method: "PATCH", authenticated: true, prefer: "return=representation",
      body: { payload, revision: revision + 1 }
    });
    if (!Array.isArray(rows) || rows.length !== 1) {
      changed = true;
      throw new Error("Speicherkonflikt oder Zugriff entzogen. Ihre Änderung wurde nicht übernommen. Entwurf kopieren, Dialog schließen und „Teamdaten neu laden“ wählen.");
    }
    if (rows[0].revision !== revision + 1) throw new Error("Speicherbestätigung ungültig. Bitte Teamdaten neu laden, bevor Sie weiterarbeiten.");
    revision = rows[0].revision;
  }

  async function connect() {
    if (!enabled) return null;
    $("app-shell").hidden = true;
    $("auth-panel").hidden = false;
    const ready = new Promise((resolve) => { resolvingLogin = resolve; });
    $("auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      $("auth-submit").disabled = true;
      message("Anmeldung wird geprüft …");
      try {
        const data = await request("/auth/v1/token?grant_type=password", {
          method: "POST", body: { email: $("auth-email").value.trim(), password: $("auth-password").value }
        });
        acceptSession(data);
        await finishLogin();
      } catch (error) {
        session = null;
        message(error.message);
      } finally {
        busy = false;
        $("auth-submit").disabled = false;
      }
    });
    $("password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      if ($("new-password").value !== $("confirm-password").value) {
        message("Die Passwörter stimmen nicht überein.");
        return;
      }
      busy = true;
      $("password-submit").disabled = true;
      try {
        await request("/auth/v1/user", { method: "PUT", authenticated: true, body: { password: $("new-password").value } });
        await finishLogin();
      } catch (error) {
        message(error.message);
      } finally {
        busy = false;
        $("password-submit").disabled = false;
      }
    });
    $("forgot-password").addEventListener("click", async () => {
      if (busy) return;
      if (!$("auth-email").reportValidity()) return;
      busy = true;
      try {
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, {
          method: "POST", body: { email: $("auth-email").value.trim() }
        });
        message("Falls ein Konto besteht, wurde eine E-Mail zum Zurücksetzen angefordert. Bitte auch den Spamordner prüfen.");
      } catch (error) {
        message(error.message);
      } finally { busy = false; }
    });
    $("cloud-logout").addEventListener("click", async () => {
      if (document.querySelector("dialog[open]") && !confirm("Ungespeicherten Entwurf verwerfen und abmelden?")) return;
      try {
        await request("/auth/v1/logout?scope=local", { method: "POST", authenticated: true });
      } catch (error) {
        alert(`${error.message} Die Abmeldung beim Server konnte nicht bestätigt werden. Die lokale Sitzung wird jetzt beendet.`);
      } finally {
        session = null;
        location.reload();
      }
    });
    if (fragment.get("error_description")) message(fragment.get("error_description"));
    if (fragment.has("access_token")) {
      try {
        acceptSession({ access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token"), expires_in: Number(fragment.get("expires_in")) });
        await request("/auth/v1/user", { authenticated: true });
        if (["invite", "recovery"].includes(fragment.get("type"))) {
          $("auth-form").hidden = true;
          $("password-form").hidden = false;
          message("Bitte ein eigenes Passwort festlegen. Das Konto benötigt zusätzlich eine Teamfreigabe.");
        } else await finishLogin();
      } catch (error) {
        session = null;
        message(error.message);
      }
    }
    return ready;
  }

  function watch({ blocked, receive, failed }) {
    let checking = false;
    async function reload(manual = false) {
      if (checking || blocked()) {
        if (manual) failed("Bitte zuerst den offenen Dialog schließen und einen laufenden Speichervorgang abwarten.");
        return;
      }
      checking = true;
      const startingRevision = revision;
      try {
        const row = await read();
        if (blocked() || startingRevision !== revision) return;
        if (row.revision !== revision || manual) {
          receive(row.payload);
          revision = row.revision;
          changed = false;
        }
        $("cloud-status").textContent = `Teamdaten aktuell · geprüft ${new Date().toLocaleTimeString("de-CH")}`;
      } catch (error) {
        failed(error.message);
      } finally { checking = false; }
    }
    $("cloud-reload").addEventListener("click", () => reload(true));
    setInterval(() => { if (!document.hidden && !changed) reload(); }, 20000);
  }

  window.NAKA_CLOUD = { enabled, connect, save, watch };
})();
