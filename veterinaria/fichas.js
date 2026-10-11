import { el, message } from "./datos.js";
import {
  patientFields,
  visitFields,
  clinicalWrite,
  clinicalChanges,
  clinicalTime,
  clinicalDay,
  clinicalToday,
} from "./fichas-modelo.js";
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function createClinicalPanel({ getContext }) {
  const root = document.getElementById("clinicalPanel");
  const listPage = el("section"),
    detail = el("section");
  detail.hidden = true;
  const status = el("p");
  status.setAttribute("role", "status");
  const title = el("h2", "Mis pacientes"),
    hint = el(
      "p",
      "Fichas privadas · atenciones y cambios con fecha y hora.",
      "hint",
    );
  const toolbar = el("div", undefined, "toolbar"),
    searchLabel = el("label", "Buscar por paciente o tutor");
  const search = el("input");
  search.type = "search";
  search.id = "clinicalSearch";
  searchLabel.htmlFor = search.id;
  const searchHint = el("p", undefined, "hint"),
    patientList = el("div", undefined, "list");
  const patientMore = action(
    "Cargar más fichas",
    () => loadPatients(false),
    true,
  );
  toolbar.append(
    action("Nueva ficha", () => editRecord("patient")),
    action("Actualizar", () => loadPatients(), true),
  );
  listPage.append(
    title,
    hint,
    toolbar,
    searchLabel,
    search,
    searchHint,
    patientList,
    patientMore,
  );
  root.append(status, listPage, detail);

  const editor = el("dialog");
  editor.id = "clinicalEditor";
  editor.setAttribute("aria-labelledby", "clinicalEditorTitle");
  const close = action("×", () => closeEditor(), true);
  close.className = "close secondary";
  close.setAttribute("aria-label", "Cerrar ficha");
  const editorTitle = el("h2");
  editorTitle.id = "clinicalEditorTitle";
  const form = el("form"),
    fieldsRoot = el("div", undefined, "clinical-fields"),
    editorStatus = el("p");
  editorStatus.setAttribute("role", "status");
  const save = el("button", "Guardar");
  save.type = "submit";
  form.append(fieldsRoot, save, editorStatus);
  editor.append(close, editorTitle, form);
  document.body.append(editor);
  editor.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeEditor();
  });

  let patients = [],
    patientCursor = null,
    patientHasMore = false,
    selected = null,
    current = null,
    generation = 0,
    listRun = 0,
    visible = false,
    listBusy = false,
    visitsBusy = false,
    historyBusy = false,
    visitsRun = 0,
    auditRun = 0,
    controls = {},
    visits = [],
    visitCursor = null,
    visitHasMore = false,
    auditCursor = null,
    auditHasMore = false,
    visitsRoot,
    visitsMore,
    auditRoot,
    auditMore,
    auditPanel,
    draftOwner = null,
    saving = false;
  const drafts = new Set();
  function draftKey(kind, id) {
    return `vet-clinica-${getContext().user?.uid}-${kind}-${kind === "visit" ? selected?.id + "-" : ""}${id || "nueva"}`;
  }
  function forgetDraft(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
    drafts.delete(key);
  }
  function action(text, fn, secondary = false) {
    const button = el("button", text, secondary ? "secondary" : "");
    button.type = "button";
    button.onclick = async () => {
      button.disabled = true;
      try {
        await fn();
      } catch (e) {
        message(status, errorText(e), true);
      } finally {
        button.disabled = false;
      }
    };
    return button;
  }
  function errorText(e) {
    if (e.code === "permission-denied")
      return "No tienes permiso para consultar o guardar fichas. Verifica que las reglas de fichas clínicas estén activadas y tu cuenta habilitada.";
    if (e.code === "unavailable")
      return "No se pudo conectar. Tu texto sigue en el formulario; vuelve a intentar cuando tengas conexión.";
    return e.code
      ? "No se pudo completar la acción. Revisa tu conexión y vuelve a intentar."
      : e.message || "No se pudo completar la acción.";
  }
  function isCurrent(mark, uid) {
    return visible && mark === generation && getContext().user?.uid === uid;
  }
  function renderPatients() {
    const needle = search.value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const filtered = patients.filter((p) =>
      (p.data.name + " " + p.data.tutor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(needle),
    );
    patientList.replaceChildren();
    for (const patient of filtered) {
      const card = el("article", undefined, "item clinical-patient");
      card.append(
        el("span", patient.data.species, "badge"),
        el("h3", patient.data.name),
        el("p", "Tutor: " + patient.data.tutor),
        el(
          "p",
          "Último cambio: " + clinicalTime(patient.data.updatedAt),
          "hint",
        ),
        action("Abrir ficha", () => openPatient(patient)),
      );
      patientList.append(card);
    }
    if (!filtered.length)
      patientList.append(
        el(
          "p",
          patients.length
            ? "No hay coincidencias en las fichas cargadas."
            : "Todavía no tienes pacientes registrados.",
        ),
      );
    searchHint.textContent = `${patients.length} fichas cargadas.${patientHasMore ? " La búsqueda incluye solo estas fichas. Carga más para ampliar la búsqueda." : ""}`;
    patientMore.hidden = !patientHasMore;
  }
  search.addEventListener("input", renderPatients);
  async function loadPatients(reset = true) {
    const { db, user } = getContext();
    if (!user || (listBusy && !reset)) return;
    const mark = generation,
      run = ++listRun;
    listBusy = true;
    patientMore.disabled = true;
    message(status, "Cargando fichas…");
    if (reset) {
      patientCursor = null;
      patients = [];
      patientList.replaceChildren();
      patientMore.hidden = true;
    }
    try {
      const parts = [orderBy("updatedAt", "desc"), limit(25)];
      if (patientCursor) parts.push(startAfter(patientCursor));
      const result = await getDocs(
        query(collection(db, "vetPacientes"), ...parts),
      );
      if (!isCurrent(mark, user.uid) || run !== listRun) return;
      patients.push(...result.docs.map((s) => ({ id: s.id, data: s.data() })));
      patientCursor = result.docs.at(-1) || patientCursor;
      patientHasMore = result.size === 25;
      renderPatients();
      message(status, "");
    } catch (e) {
      if (isCurrent(mark, user.uid) && run === listRun)
        message(status, errorText(e), true);
    } finally {
      if (mark === generation && run === listRun) {
        listBusy = false;
        patientMore.disabled = false;
      }
    }
  }
  function labelledText(label, value) {
    const box = el("div");
    box.append(el("dt", label), el("dd", value || "Sin registrar"));
    return box;
  }
  function renderDetail() {
    const patient = selected;
    detail.replaceChildren();
    detail.append(
      action("← Mis pacientes", () => history.back(), true),
      el("p", "Ficha privada", "badge"),
      el("h2", patient.data.name),
    );
    const summary = el("dl", undefined, "clinical-summary");
    for (const [key, [label]] of Object.entries(patientFields))
      summary.append(
        labelledText(
          label,
          key === "birthDate" && patient.data[key]
            ? clinicalDay(patient.data[key])
            : patient.data[key],
        ),
      );
    detail.append(
      summary,
      el("p", "Creada: " + clinicalTime(patient.data.createdAt), "hint"),
      el(
        "p",
        "Última modificación: " +
          clinicalTime(patient.data.updatedAt) +
          " · " +
          patient.data.updatedEmail,
        "hint",
      ),
    );
    const buttons = el("div", undefined, "actions");
    buttons.append(
      action("Editar datos", () => editRecord("patient", patient), true),
      action("Nueva atención", () => editRecord("visit")),
    );
    if (patient.data.phone) {
      const digits = patient.data.phone.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 15) {
        const a = el("a", "Contactar tutor por WhatsApp", "clinical-contact");
        a.href = "https://wa.me/" + (digits.length === 9 ? "56" : "") + digits;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        buttons.append(a);
      }
    }
    detail.append(buttons, el("h3", "Historial de atenciones"));
    visitsRoot = el("div", undefined, "list");
    visitsMore = action("Ver más atenciones", () => loadVisits(false), true);
    detail.append(visitsRoot, visitsMore);
    const auditButton = action(
      "Ver historial de modificaciones",
      async () => {
        auditPanel.hidden = !auditPanel.hidden;
        auditButton.setAttribute("aria-expanded", String(!auditPanel.hidden));
        if (!auditPanel.hidden) await loadAudit();
      },
      true,
    );
    auditButton.setAttribute("aria-expanded", "false");
    auditButton.setAttribute("aria-controls", "clinicalAudit");
    auditPanel = el("section", undefined, "clinical-audit");
    auditPanel.id = "clinicalAudit";
    auditPanel.hidden = true;
    auditRoot = el("div", undefined, "list");
    auditMore = action("Ver más modificaciones", () => loadAudit(false), true);
    auditPanel.append(
      el("h3", "Historial de modificaciones"),
      el(
        "p",
        "Cada guardado conserva la versión anterior y la nueva. Las horas corresponden a Chile.",
        "hint",
      ),
      auditRoot,
      auditMore,
    );
    detail.append(auditButton, auditPanel);
  }
  async function openPatient(patient) {
    generation++;
    visitsBusy = historyBusy = false;
    selected = patient;
    visits = [];
    visitCursor = null;
    auditCursor = null;
    listPage.hidden = true;
    detail.hidden = false;
    renderDetail();
    history.pushState({ clinicalPatient: true }, "");
    await loadVisits();
  }
  async function loadVisits(reset = true) {
    const { db, user } = getContext();
    if (!user || !selected || (visitsBusy && !reset)) return;
    const mark = generation,
      id = selected.id,
      run = ++visitsRun;
    visitsBusy = true;
    visitsMore.disabled = true;
    if (reset) {
      visits = [];
      visitCursor = null;
      visitsRoot.replaceChildren(el("p", "Cargando atenciones…"));
      visitsMore.hidden = true;
    }
    try {
      const parts = [orderBy("date", "desc"), limit(20)];
      if (visitCursor) parts.push(startAfter(visitCursor));
      const result = await getDocs(
        query(collection(db, "vetPacientes", id, "atenciones"), ...parts),
      );
      if (
        !isCurrent(mark, user.uid) ||
        selected?.id !== id ||
        run !== visitsRun
      )
        return;
      visits.push(...result.docs.map((s) => ({ id: s.id, data: s.data() })));
      visitCursor = result.docs.at(-1) || visitCursor;
      visitHasMore = result.size === 20;
      visitsRoot.replaceChildren();
      for (const visit of visits) {
        const card = el("article", undefined, "item");
        card.append(
          el("h3", clinicalDay(visit.data.date) + " · " + visit.data.reason),
        );
        const info = el("dl", undefined, "clinical-summary");
        for (const [key, [label]] of Object.entries(visitFields))
          if (!["date", "reason"].includes(key) && visit.data[key])
            info.append(
              labelledText(
                label,
                key === "nextDate"
                  ? clinicalDay(visit.data[key])
                  : visit.data[key],
              ),
            );
        card.append(
          info,
          el("p", "Registrada: " + clinicalTime(visit.data.createdAt), "hint"),
          el(
            "p",
            "Último cambio: " +
              clinicalTime(visit.data.updatedAt) +
              " · " +
              visit.data.updatedEmail,
            "hint",
          ),
          action("Modificar atención", () => editRecord("visit", visit), true),
        );
        visitsRoot.append(card);
      }
      if (!visits.length)
        visitsRoot.append(
          el(
            "p",
            "Aquí aparecerán las consultas, vacunas y controles de este paciente.",
          ),
        );
      visitsMore.hidden = !visitHasMore;
    } catch (e) {
      if (isCurrent(mark, user.uid) && selected?.id === id && run === visitsRun)
        visitsRoot.replaceChildren(el("p", errorText(e)));
    } finally {
      if (mark === generation && run === visitsRun) {
        visitsBusy = false;
        visitsMore.disabled = false;
      }
    }
  }
  async function loadAudit(reset = true) {
    const { db, user } = getContext();
    if (!user || !selected || (historyBusy && !reset)) return;
    const mark = generation,
      id = selected.id,
      run = ++auditRun;
    historyBusy = true;
    auditMore.disabled = true;
    if (reset) {
      auditCursor = null;
      auditRoot.replaceChildren(el("p", "Cargando modificaciones…"));
      auditMore.hidden = true;
    }
    try {
      const parts = [orderBy("createdAt", "desc"), limit(20)];
      if (auditCursor) parts.push(startAfter(auditCursor));
      const result = await getDocs(
        query(collection(db, "vetPacientes", id, "cambios"), ...parts),
      );
      if (!isCurrent(mark, user.uid) || selected?.id !== id || run !== auditRun)
        return;
      if (reset) auditRoot.replaceChildren();
      auditCursor = result.docs.at(-1) || auditCursor;
      auditHasMore = result.size === 20;
      result.forEach((s) => {
        const c = s.data(),
          card = el("article", undefined, "item");
        card.append(
          el(
            "h4",
            (c.before ? "Modificación" : "Creación") +
              " de " +
              (c.recordType === "patient" ? "ficha" : "atención"),
          ),
          el("p", clinicalTime(c.createdAt) + " · " + c.actorEmail, "hint"),
        );
        if (c.recordType === "visit")
          card.append(
            el(
              "p",
              "Atención: " + clinicalDay(c.after.date) + " · " + c.after.reason,
            ),
          );
        if (c.reason) card.append(el("p", "Motivo: " + c.reason));
        const differences = el("dl", undefined, "clinical-differences");
        for (const change of clinicalChanges(c.before, c.after, c.recordType)) {
          const row = el("div");
          row.append(
            el("dt", change.label),
            el("dd", "Antes: " + (change.before || "Sin registrar")),
            el("dd", "Ahora: " + (change.after || "Sin registrar")),
          );
          differences.append(row);
        }
        card.append(differences);
        auditRoot.append(card);
      });
      if (!auditRoot.children.length)
        auditRoot.append(el("p", "Todavía no hay modificaciones registradas."));
      auditMore.hidden = !auditHasMore;
    } catch (e) {
      if (isCurrent(mark, user.uid) && selected?.id === id && run === auditRun)
        auditRoot.replaceChildren(el("p", errorText(e)));
    } finally {
      if (mark === generation && run === auditRun) {
        historyBusy = false;
        auditMore.disabled = false;
      }
    }
  }
  function editRecord(kind, snapshot = null) {
    if (!getContext().user || saving) return;
    current = {
      kind,
      id: snapshot?.id || null,
      patientId: selected?.id || null,
      previous: snapshot?.data || null,
      key: draftKey(kind, snapshot?.id),
    };
    controls = {};
    fieldsRoot.replaceChildren();
    const fields = kind === "patient" ? patientFields : visitFields;
    editorTitle.textContent = snapshot
      ? kind === "patient"
        ? "Modificar ficha"
        : "Modificar atención"
      : kind === "patient"
        ? "Nueva ficha clínica"
        : "Nueva atención";
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(current.key) || "null");
    } catch {}
    const staleDraft =
      saved && saved.revision !== (snapshot?.data?.revision || 0);
    const restored = staleDraft ? null : saved;
    for (const [key, [label, max]] of Object.entries(fields)) {
      const box = el("div"),
        labelNode = el("label", label),
        node = el(
          [
            "background",
            "assessment",
            "diagnosis",
            "treatment",
            "prevention",
          ].includes(key)
            ? "textarea"
            : "input",
        );
      node.id = "clinical-" + key;
      node.name = key;
      labelNode.htmlFor = node.id;
      node.maxLength = max;
      if (key.toLowerCase().includes("date")) node.type = "date";
      if (key === "weight") {
        node.inputMode = "decimal";
        node.placeholder = "Ej. 4,5";
      }
      if (key === "phone") node.type = "tel";
      if (node.tagName === "TEXTAREA") {
        node.rows = 4;
        box.className = "clinical-wide";
      }
      node.required = (
        kind === "patient" ? ["name", "species", "tutor"] : ["date", "reason"]
      ).includes(key);
      node.value =
        restored?.values?.[key] ??
        snapshot?.data?.[key] ??
        (kind === "visit" && key === "date" ? clinicalToday() : "");
      controls[key] = node;
      box.append(labelNode, node);
      fieldsRoot.append(box);
    }
    const noteBox = el("div", undefined, "clinical-wide"),
      noteLabel = el("label", "Motivo de la modificación"),
      note = el("textarea");
    note.id = "clinical-note";
    noteLabel.htmlFor = note.id;
    note.rows = 2;
    note.maxLength = 300;
    note.minLength = 5;
    note.required = !!snapshot;
    note.value = restored?.note || "";
    noteBox.hidden = !snapshot;
    controls._note = note;
    noteBox.append(
      noteLabel,
      note,
      el("p", "La versión anterior se conserva en el historial.", "hint"),
    );
    fieldsRoot.append(noteBox);
    if (staleDraft) {
      message(
        editorStatus,
        "Hay un borrador de una versión anterior. Revisa los datos actuales antes de recuperarlo.",
      );
      fieldsRoot.append(
        action(
          "Recuperar texto del borrador",
          () => {
            for (const key of Object.keys(fields))
              controls[key].value = saved.values?.[key] ?? controls[key].value;
            controls._note.value = saved.note || "";
            message(
              editorStatus,
              "Borrador recuperado. Revisa los datos y el motivo antes de guardar.",
            );
          },
          true,
        ),
      );
    } else if (saved)
      message(editorStatus, "Recuperamos tu borrador de esta sesión.");
    else message(editorStatus, "");
    save.disabled = false;
    saving = false;
    draftOwner = getContext().user.uid;
    editor.showModal();
    history.pushState({ clinicalEditor: true }, "");
  }
  function closeEditor() {
    if (editor.open) history.back();
  }
  form.addEventListener("input", () => {
    if (!current || draftOwner !== getContext().user?.uid) return;
    const values = {};
    for (const [key, node] of Object.entries(controls))
      if (key !== "_note") values[key] = node.value;
    try {
      sessionStorage.setItem(
        current.key,
        JSON.stringify({
          revision: current.previous?.revision || 0,
          values,
          note: controls._note.value,
        }),
      );
      drafts.add(current.key);
    } catch {}
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { db, user } = getContext();
    if (!user || saving || !current || !form.reportValidity()) return;
    const editing = { ...current },
      mark = generation,
      values = {};
    for (const [key, node] of Object.entries(controls))
      if (key !== "_note") values[key] = node.value;
    const note = controls._note.value;
    saving = true;
    save.disabled = true;
    message(editorStatus, "Guardando ficha e historial…");
    try {
      const ref =
        editing.kind === "patient"
          ? editing.id
            ? doc(db, "vetPacientes", editing.id)
            : doc(collection(db, "vetPacientes"))
          : editing.id
            ? doc(
                db,
                "vetPacientes",
                editing.patientId,
                "atenciones",
                editing.id,
              )
            : doc(
                collection(db, "vetPacientes", editing.patientId, "atenciones"),
              );
      const patientId = editing.kind === "patient" ? ref.id : editing.patientId;
      const changeRef = doc(
        collection(db, "vetPacientes", patientId, "cambios"),
      );
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref),
          previous = snapshot.exists() ? snapshot.data() : null;
        if (getContext().user?.uid !== user.uid)
          throw new Error("La sesión cambió. Ingresa nuevamente.");
        if ((previous?.revision || 0) !== (editing.previous?.revision || 0))
          throw new Error(
            "Esta ficha cambió desde que la abriste. Cierra el editor y vuelve a abrirla para revisar la versión actual. Tu borrador sigue guardado en esta sesión.",
          );
        const result = clinicalWrite(
          previous,
          values,
          user,
          changeRef.id,
          serverTimestamp(),
          editing.kind,
          ref.id,
          note,
        );
        transaction.set(ref, result.after);
        transaction.set(changeRef, result.change);
      });
      forgetDraft(editing.key);
      if (!isCurrent(mark, user.uid)) return;
      closeEditor();
      if (editing.kind === "patient") {
        await loadPatients();
        if (selected?.id === ref.id) {
          selected = patients.find((p) => p.id === ref.id) || selected;
          renderDetail();
          await loadVisits();
        }
      } else {
        await loadVisits();
        if (!auditPanel.hidden) await loadAudit();
      }
      message(
        status,
        "Guardado. El historial conserva la fecha, hora y cuenta de este cambio.",
      );
    } catch (error) {
      if (isCurrent(mark, user.uid))
        message(editor.open ? editorStatus : status, errorText(error), true);
    } finally {
      if (mark === generation) {
        saving = false;
        save.disabled = false;
      }
    }
  });
  function reset() {
    generation++;
    listRun++;
    visible = false;
    patients = [];
    selected = null;
    current = null;
    controls = {};
    visits = [];
    patientCursor = null;
    visitCursor = null;
    auditCursor = null;
    listBusy = visitsBusy = historyBusy = saving = false;
    draftOwner = null;
    for (const key of drafts) forgetDraft(key);
    // Purga también borradores recuperados de una sesión anterior de esta misma cuenta.
    try {
      const prefix = "vet-clinica-" + getContext().user?.uid + "-";
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    } catch {}
    editor.close();
    form.reset();
    fieldsRoot.replaceChildren();
    patientList.replaceChildren();
    detail.replaceChildren();
    message(status, "");
    message(editorStatus, "");
    search.value = "";
    root.hidden = true;
  }
  return {
    show() {
      visible = true;
      root.hidden = false;
      listPage.hidden = false;
      detail.hidden = true;
      selected = null;
      message(status, "");
      return loadPatients();
    },
    hide() {
      generation++;
      listRun++;
      visible = false;
      saving = false;
      root.hidden = true;
      listBusy = visitsBusy = historyBusy = false;
    },
    reset,
    handleBack() {
      if (editor.open) {
        editor.close();
        current = null;
        return true;
      }
      if (visible && !detail.hidden) {
        generation++;
        visitsBusy = historyBusy = saving = false;
        detail.hidden = true;
        listPage.hidden = false;
        selected = null;
        message(status, "");
        return true;
      }
      return false;
    },
  };
}
