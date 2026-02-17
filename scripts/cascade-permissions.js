/**
 * Cascade Folder Permissions
 *
 * Adds an "Apply to all contents" checkbox to the Configure Ownership dialog
 * when editing a Folder. When checked, the chosen ownership settings are
 * applied to every document (Item, JournalEntry, Actor, etc.) inside the
 * folder and all of its sub-folders recursively.
 *
 * Folder ownership is NOT modified — Foundry automatically shows a folder
 * in the sidebar when it contains at least one visible document.
 *
 * Compatible with Foundry VTT v11 – v13.
 *
 * NOTE: Foundry v13 migrated DocumentOwnershipConfig to a V2 Application,
 * so _updateObject no longer exists. This module intercepts the form
 * submission directly via a DOM "submit" listener, which works across all
 * Foundry versions.
 */

const MODULE_ID = "cascade-folder-permissions";
const LOG = (...args) => console.log(`${MODULE_ID} |`, ...args);

/* -------------------------------------------------------------------------- */
/*  Initialization                                                            */
/* -------------------------------------------------------------------------- */

Hooks.once("init", () => {
  LOG("Initializing Cascade Folder Permissions");
});

/* -------------------------------------------------------------------------- */
/*  Inject checkbox + submit handler into DocumentOwnershipConfig for folders */
/* -------------------------------------------------------------------------- */

Hooks.on("renderDocumentOwnershipConfig", (app, html, data) => {
  // Detect whether this dialog is for a folder.
  const doc = app.document ?? app.object;
  const isFolder = data?.isFolder ?? (doc instanceof Folder);
  if (!isFolder) return;

  LOG("Injecting cascade checkbox for folder:", doc?.name);

  const loc = (key) => game.i18n.localize(`CASCADE_PERMS.${key}`);

  // --- Inject the checkbox UI ---
  const wrapper = document.createElement("div");
  wrapper.classList.add("cascade-folder-permissions");
  wrapper.innerHTML = `
    <label class="cascade-checkbox">
      <input type="checkbox" name="cascade-to-subfolders" />
      ${loc("CascadeHint")}
    </label>
    <p class="cascade-note">${loc("CascadeNote")}</p>
  `;

  const formEl = html instanceof jQuery ? html[0] : html;
  const form = formEl.querySelector?.("form") ?? formEl.closest?.("form") ?? formEl;

  const footer =
    form.querySelector("footer") ??
    form.querySelector(".sheet-footer") ??
    form.querySelector('button[type="submit"]')?.parentElement;

  if (footer) {
    footer.insertAdjacentElement("beforebegin", wrapper);
  } else {
    form.appendChild(wrapper);
  }

  if (typeof app.setPosition === "function") {
    app.setPosition({ height: "auto" });
  }

  // --- Attach submit listener to cascade after normal save ---
  // Use the actual <form> element for the event listener
  const actualForm =
    formEl.tagName === "FORM" ? formEl : formEl.querySelector("form") ?? formEl;

  // Guard against double-registration when Foundry re-renders the dialog
  if (actualForm.dataset.cascadeListenerAttached) return;
  actualForm.dataset.cascadeListenerAttached = "true";

  LOG("Attaching submit listener to form for folder:", doc?.name);

  actualForm.addEventListener("submit", async (event) => {
    const checkbox = actualForm.querySelector(
      'input[name="cascade-to-subfolders"]'
    );
    const shouldCascade = checkbox?.checked;

    LOG("Form submitted. cascade:", shouldCascade, "folder:", doc?.name);

    if (!shouldCascade || !(doc instanceof Folder)) return;

    // Read ownership data from the form's <select> elements
    const formData = {};
    const selects = actualForm.querySelectorAll("select");
    for (const sel of selects) {
      if (sel.name) {
        formData[sel.name] = sel.value;
      }
    }
    LOG("Ownership form data:", JSON.stringify(formData));

    // Small delay to let Foundry's own save complete first
    await new Promise((resolve) => setTimeout(resolve, 250));

    await _cascadeOwnership(doc, formData);
  });
});

/* -------------------------------------------------------------------------- */
/*  Core cascade logic                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Apply ownership to every document inside the target folder and all of its
 * sub-folders recursively. Does NOT modify folder ownership — Foundry
 * automatically shows folders that contain visible documents.
 *
 * @param {Folder} folder    The folder whose contents should be updated.
 * @param {object} formData  The raw ownership form data (user-id → level).
 */
async function _cascadeOwnership(folder, formData) {
  // Build ownership object from formData.
  // Valid Foundry permission levels: 0 (None), 1 (Limited), 2 (Observer), 3 (Owner).
  // V1 forms use -1 for "inherit"; V2 forms (Foundry v13) use -10 for "no change".
  // We skip any value that is not a valid concrete level (0–3).
  const VALID_LEVELS = new Set([0, 1, 2, 3]);
  const ownership = {};
  for (const [key, value] of Object.entries(formData)) {
    const level = Number(value);
    if (!VALID_LEVELS.has(level)) {
      LOG(
        `  Skipping "${key}" with value ${value} (not a concrete permission level)`
      );
      continue;
    }
    ownership[key] = level;
  }

  if (Object.keys(ownership).length === 0) {
    LOG("No ownership values to apply (all set to inherit). Skipping.");
    return;
  }
  LOG("Ownership to apply:", JSON.stringify(ownership));

  // Collect all folders in the tree: the target folder + all descendants
  let allFolders = [folder];
  try {
    const subs = folder.getSubfolders(true);
    allFolders = allFolders.concat(subs);
  } catch (err) {
    LOG("getSubfolders failed, using manual traversal:", err);
    allFolders = allFolders.concat(_getSubfoldersManual(folder));
  }

  LOG(`Processing ${allFolders.length} folder(s) (including target)`);

  // Collect ALL documents across every folder in the tree
  const docClass = folder.documentClass;
  const allUpdates = [];

  for (const f of allFolders) {
    const docs = f.contents ?? [];
    LOG(`  Folder "${f.name}": ${docs.length} document(s)`);
    for (const d of docs) {
      allUpdates.push({ _id: d.id, ownership });
    }
  }

  LOG(`Total documents to update: ${allUpdates.length}`);

  if (allUpdates.length === 0) {
    ui.notifications.info(
      game.i18n.localize("CASCADE_PERMS.NoDocuments") ||
        "No documents found to update."
    );
    return;
  }

  // Batch-update all documents at once
  try {
    await docClass.updateDocuments(allUpdates);
    LOG(`Successfully updated ${allUpdates.length} document(s)`);
  } catch (err) {
    console.error(`${MODULE_ID} | Error cascading ownership:`, err);
    ui.notifications.error(
      game.i18n.localize("CASCADE_PERMS.ErrorCascade") ||
        "Error applying cascaded permissions. Check console for details."
    );
    return;
  }

  ui.notifications.info(
    game.i18n.format("CASCADE_PERMS.SuccessCascade", {
      count: allUpdates.length,
      folders: allFolders.length - 1,
    })
  );
}

/**
 * Manual fallback to collect sub-folders if getSubfolders is unavailable.
 */
function _getSubfoldersManual(root) {
  const result = [];
  const stack = [...(root.children ?? []).map((c) => c.folder ?? c)];
  while (stack.length) {
    const f = stack.pop();
    if (!(f instanceof Folder)) continue;
    result.push(f);
    for (const child of f.children ?? []) {
      stack.push(child.folder ?? child);
    }
  }
  return result;
}
