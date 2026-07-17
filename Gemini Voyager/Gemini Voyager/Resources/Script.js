function show(enabled, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "The Safari extension is on and ready.";
        document.getElementsByClassName('state-off')[0].innerText = "The Safari extension is off. Turn it on in Safari Extensions.";
        document.getElementsByClassName('state-unknown')[0].innerText = "Turn on Voyager in Safari Extensions to get started.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Open Safari Extensions…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

function showUpdateControls(automaticUpdatesEnabled, canCheckForUpdates) {
    const automaticUpdates = document.querySelector(".automatic-updates");
    automaticUpdates.querySelector("input").checked = automaticUpdatesEnabled;
    automaticUpdates.classList.toggle("is-enabled", automaticUpdatesEnabled);
    document.querySelector("button.check-for-updates").disabled = !canCheckForUpdates;
}

function setAutomaticUpdates(event) {
    event.currentTarget.classList.toggle("is-enabled", event.target.checked);
    webkit.messageHandlers.controller.postMessage({
        action: "setAutomaticUpdates",
        enabled: event.target.checked,
    });
}

function checkForUpdates() {
    webkit.messageHandlers.controller.postMessage({ action: "checkForUpdates" });
}

function showDiagnostics(snapshot) {
    const list = document.querySelector(".diagnostics-list");
    list.replaceChildren();

    for (const item of snapshot.items ?? []) {
        const row = document.createElement("div");
        row.className = `diagnostic-row diagnostic-${item.level}`;

        const copy = document.createElement("div");
        copy.className = "diagnostic-copy";

        const label = document.createElement("strong");
        label.textContent = item.label;

        const detail = document.createElement("small");
        detail.textContent = item.detail;

        const value = document.createElement("span");
        value.className = "diagnostic-value";
        value.textContent = item.value;

        copy.append(label, detail);
        row.append(copy, value);
        list.append(row);
    }
}

function refreshDiagnostics() {
    document.querySelector(".diagnostics-list").innerHTML =
        '<p class="diagnostics-loading">Checking…</p>';
    webkit.messageHandlers.controller.postMessage({ action: "refreshDiagnostics" });
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
document.querySelector(".automatic-updates").addEventListener("change", setAutomaticUpdates);
document.querySelector("button.check-for-updates").addEventListener("click", checkForUpdates);
document.querySelector("button.refresh-diagnostics").addEventListener("click", refreshDiagnostics);
window.addEventListener("pageshow", () => {
    webkit.messageHandlers.controller.postMessage({ action: "ready" });
}, { once: true });
