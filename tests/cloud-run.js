"use strict";

(async () => {
  const output = document.getElementById("results");
  const messages = [];
  function assert(value, label) {
    if (!value) throw new Error(label);
    messages.push(`PASS ${label}`);
    output.textContent = messages.join("\n");
  }
  async function waitFor(test) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (test()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for test state");
  }
  async function login(password) {
    document.getElementById("auth-email").value = "test@example.invalid";
    document.getElementById("auth-password").value = password;
    document.getElementById("auth-form").requestSubmit();
    await waitFor(() => !document.getElementById("auth-submit").disabled);
  }
  try {
    const state = window.cloudTest;
    const cloud = window.NAKA_CLOUD;
    const ready = cloud.connect();
    assert(document.getElementById("app-shell").hidden, "App stays hidden before login");
    await login("wrong");
    assert(document.getElementById("auth-error").textContent.includes("Invalid login"), "Invalid login is reported");
    await login("correct");
    assert(document.getElementById("app-shell").hidden && document.getElementById("auth-error").textContent.includes("Kein Zugriff"), "Unapproved account cannot open team data");
    state.authorized = true;
    await login("correct");
    const initial = await ready;
    assert(initial.activities.length === 0 && !document.getElementById("app-shell").hidden, "Approved login loads shared state");
    assert(document.getElementById("auth-password").value === "", "Password field is cleared after login");
    await cloud.save({ ...initial, testValue: "first" });
    assert(state.revision === 1 && state.payload.testValue === "first", "Save waits for revision-checked server confirmation");
    state.failWrite = true;
    let failed = false;
    try { await cloud.save({ ...initial, testValue: "network failure" }); }
    catch (error) { failed = error.message.includes("kein lokaler Ersatz"); }
    assert(failed && state.revision === 1 && state.payload.testValue === "first", "Network failure does not apply a change");
    state.failWrite = false;
    await cloud.save({ ...initial, testValue: "second" });
    assert(state.revision === 2, "Network failure does not advance client revision");
    state.revision++;
    failed = false;
    try { await cloud.save({ ...initial, testValue: "stale" }); }
    catch (error) { failed = error.message.includes("Speicherkonflikt"); }
    assert(failed && state.payload.testValue === "second", "Concurrent update is not overwritten");
    const before = state.calls.length;
    try { await cloud.save({ ...initial, testValue: "still stale" }); }
    catch (error) { failed = error.message.includes("andere Person"); }
    assert(failed && state.calls.length === before, "Further stale saves require an explicit reload");
    let received = null;
    let error = "";
    let blocked = true;
    cloud.watch({ blocked: () => blocked, receive: (data) => { received = data; }, failed: (value) => { error = value; } });
    document.getElementById("cloud-reload").click();
    assert(received === null && error.includes("Dialog"), "Reload does not replace an open editor");
    blocked = false;
    document.getElementById("cloud-reload").click();
    await waitFor(() => received !== null);
    await cloud.save({ ...initial, testValue: "after reload" });
    assert(state.revision === 4 && state.payload.testValue === "after reload", "Reload permits saving against the latest revision");
    state.badResponse = true;
    failed = false;
    try { await cloud.save(initial); }
    catch (caught) { failed = caught.message.includes("JSON"); }
    assert(failed && state.revision === 4, "Malformed API response is reported");
    state.badResponse = false;
    assert(state.calls.every((call) => call.headers.apikey === "sb_publishable_test"), "Only the public key and synthetic session are used");
    output.dataset.result = "passed";
    output.textContent += `\n\n${messages.length} tests passed. No external requests were sent.`;
  } catch (error) {
    output.dataset.result = "failed";
    output.textContent += `\nFAIL ${error.message}`;
  }
})();
