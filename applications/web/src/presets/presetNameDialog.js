// window.prompt is suppressed in the lab browser (returns ""), so Save never ran.
export function askPresetName(message, defaultValue = "") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "preset-overlay";

    const dialog = document.createElement("div");
    dialog.className = "preset-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const label = document.createElement("label");
    label.className = "preset-dialog-label";
    label.textContent = message;

    const input = document.createElement("input");
    input.className = "preset-input";
    input.type = "text";
    input.value = defaultValue || "";
    input.autocomplete = "off";

    const buttons = document.createElement("div");
    buttons.className = "preset-buttons";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    };

    const submit = () => {
      const name = input.value.trim();
      if (name) finish(name);
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };

    cancel.addEventListener("click", () => finish(null));
    save.addEventListener("click", submit);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });

    buttons.append(cancel, save);
    dialog.append(label, input, buttons);
    overlay.append(dialog);
    document.body.append(overlay);
    document.addEventListener("keydown", onKey);
    input.focus();
    input.select();
  });
}
