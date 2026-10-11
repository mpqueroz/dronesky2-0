import { connect, paths, videoInfo, imageURL, el, message } from "./datos.js";
import { createClinicalPanel } from "./fichas.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const $ = (id) => document.getElementById(id),
  status = $("adminStatus"),
  login = $("loginForm"),
  post = $("postForm"),
  reply = $("answerForm"),
  editor = $("editorDialog");
history.replaceState({ vetBase: true }, "");
history.pushState({ vetHome: true, tab: "posts" }, "");
let lastBack = 0;
let db,
  auth,
  user = null,
  active = "posts",
  cursor = null,
  epoch = 0,
  busy = false,
  editing = null,
  confirmResolve = null;
const clinical = createClinicalPanel({ getContext: () => ({ db, user }) });
function feedback(text, error = false) {
  message(status, text, error);
}
function openEditor() {
  editor.showModal();
  history.pushState({ editor: true }, "");
}
function closeEditor() {
  if (editor.open) history.back();
}
$("closeEditor").onclick = closeEditor;
editor.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
window.addEventListener("popstate", (event) => {
  if (clinical.handleBack()) return;
  if (event.state?.tab) {
    selectTab(event.state.tab, false);
  }
  const hadDialog = editor.open || $("confirmDialog").open;
  if (editor.open) editor.close();
  if ($("confirmDialog").open) {
    $("confirmDialog").close();
    confirmResolve?.(false);
    confirmResolve = null;
  }
  if (!hadDialog && event.state?.vetBase) {
    if (Date.now() - lastBack < 2000) {
      history.back();
    } else {
      lastBack = Date.now();
      feedback("Presiona atrás otra vez para salir.");
      history.pushState({ vetHome: true, tab: "posts" }, "");
    }
  }
});
function confirmAction(text) {
  $("confirmText").textContent = text;
  $("confirmDialog").showModal();
  history.pushState({ confirmation: true }, "");
  return new Promise((resolve) => (confirmResolve = resolve));
}
function finishConfirm(value) {
  const resolve = confirmResolve;
  confirmResolve = null;
  $("confirmDialog").close();
  history.back();
  resolve?.(value);
}
$("confirmOK").onclick = () => finishConfirm(true);
$("confirmCancel").onclick = () => finishConfirm(false);
$("confirmDialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  finishConfirm(false);
});
function button(text, action, danger = false) {
  const b = el("button", text, "secondary" + (danger ? " danger" : ""));
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await action();
    } catch {
      feedback(
        "No se pudo guardar el cambio. Revisa tu conexión y vuelve a intentarlo.",
        true,
      );
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function item(snap, tab) {
  const data = snap.data(),
    node = el("article", undefined, "item");
  node.append(
    el(
      "span",
      tab === "posts"
        ? data.published
          ? "Publicado"
          : "Borrador"
        : tab === "inbox"
          ? "Pendiente · Privada"
          : "Publicada",
      "badge",
    ),
  );
  node.append(el("h3", tab === "posts" ? data.title : data.question));
  if (tab === "inbox") node.append(el("p", "Nombre privado: " + data.name));
  if (tab === "answers") node.append(el("p", data.answer));
  const actions = el("div", undefined, "actions");
  if (tab === "posts") {
    actions.append(
      button("Editar", () => editPost(snap)),
      button(data.published ? "Retirar del blog" : "Publicar", async () => {
        if (
          !(await confirmAction(
            data.published
              ? "¿Retirar esta publicación del blog y conservarla como borrador?"
              : "¿Publicar este contenido en el blog?",
          ))
        )
          return;
        await updateDoc(snap.ref, {
          published: !data.published,
          publishedAt: serverTimestamp(),
        });
        await load();
      }),
      button(
        "Eliminar",
        async () => {
          if (
            await confirmAction("¿Eliminar esta publicación definitivamente?")
          ) {
            await deleteDoc(snap.ref);
            await load();
          }
        },
        true,
      ),
    );
  } else if (tab === "inbox") {
    actions.append(
      button("Responder", () => editAnswer(snap, false)),
      button(
        "Descartar",
        async () => {
          if (
            await confirmAction(
              "¿Eliminar esta pregunta privada sin publicarla?",
            )
          ) {
            await deleteDoc(snap.ref);
            await load();
          }
        },
        true,
      ),
    );
  } else {
    actions.append(
      button("Editar respuesta", () => editAnswer(snap, true)),
      button("Retirar del blog", async () => {
        if (
          !(await confirmAction(
            "¿Retirar esta respuesta pública? La pregunta volverá a la bandeja pendiente si todavía existe.",
          ))
        )
          return;
        const batch = writeBatch(db);
        batch.delete(snap.ref);
        const source = await getDoc(doc(db, paths.inbox, snap.id));
        if (source.exists()) batch.update(source.ref, { status: "pending" });
        await batch.commit();
        await load();
      }),
    );
  }
  node.append(actions);
  return node;
}
async function load(reset = true) {
  if (!user || active === "patients" || (busy && !reset)) return;
  const run = reset ? ++epoch : epoch,
    tab = active;
  busy = true;
  $("loadMore").disabled = true;
  if (reset) {
    cursor = null;
    $("adminList").replaceChildren();
    $("loadMore").hidden = true;
  }
  feedback("Cargando…");
  try {
    const source =
      tab === "posts"
        ? paths.posts
        : tab === "inbox"
          ? paths.inbox
          : paths.answers;
    const parts =
      tab === "inbox"
        ? [where("status", "==", "pending"), orderBy("createdAt", "desc")]
        : [orderBy(tab === "posts" ? "createdAt" : "publishedAt", "desc")];
    parts.push(limit(20));
    if (cursor) parts.push(startAfter(cursor));
    const results = await getDocs(query(collection(db, source), ...parts));
    if (run !== epoch || !user) return;
    results.forEach((snap) => $("adminList").append(item(snap, tab)));
    cursor = results.docs.at(-1) || cursor;
    $("loadMore").hidden = results.size < 20;
    if (!$("adminList").children.length)
      $("adminList").append(
        el(
          "p",
          tab === "inbox"
            ? "No hay preguntas pendientes."
            : "Todavía no hay contenido en esta sección.",
        ),
      );
    feedback("");
  } catch {
    if (run === epoch)
      feedback(
        "No se pudo cargar. Verifica las reglas e índices de Firebase o vuelve a intentarlo.",
        true,
      );
  } finally {
    if (run === epoch) {
      busy = false;
      $("loadMore").disabled = false;
    }
  }
}
function selectTab(tab, push = true) {
  if (!["posts", "inbox", "answers", "patients"].includes(tab)) return;
  active = tab;
  epoch++;
  busy = false;
  const patients = tab === "patients";
  $("publicationToolbar").hidden = patients;
  $("adminList").hidden = patients;
  $("loadMore").hidden = patients;
  document
    .querySelectorAll("[data-tab]")
    .forEach((x) =>
      x.setAttribute("aria-pressed", String(x.dataset.tab === tab)),
    );
  $("newPost").hidden = active !== "posts";
  if (push) history.replaceState({ vetHome: true, tab }, "");
  if (patients) {
    feedback("");
    clinical.show();
  } else {
    clinical.hide();
    load();
  }
}
for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () => selectTab(b.dataset.tab);
$("refresh").onclick = () => load();
$("loadMore").onclick = () => load(false);
function draftKey() {
  return "vet-editor-" + user?.uid;
}
function saveDraft() {
  if (user && editing?.type === "post")
    try {
      sessionStorage.setItem(
        draftKey(),
        JSON.stringify({
          id: editing.id,
          kind: post.elements.kind.value,
          title: post.elements.title.value,
          body: post.elements.body.value,
          video: post.elements.video.value,
          image: post.elements.image.value,
        }),
      );
    } catch {}
}
function kindChanged() {
  const video = post.elements.kind.value === "videos";
  $("videoField").hidden = !video;
  $("imageField").hidden = video;
  post.elements.video.required = video;
  preview();
}
function preview() {
  const root = $("videoPreview");
  root.replaceChildren();
  if (post.elements.kind.value !== "videos") return;
  const info = videoInfo(post.elements.video.value);
  if (info) {
    const frame = el("iframe");
    frame.src = info.embed;
    frame.title = "Vista previa del video";
    frame.allow = "encrypted-media; picture-in-picture; fullscreen";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    if (info.provider === "Instagram") frame.style.height = "480px";
    root.append(frame);
  } else if (post.elements.video.value)
    root.append(
      el("p", "Usa un enlace público de YouTube o Instagram.", "hint"),
    );
}
post.elements.kind.onchange = kindChanged;
post.elements.video.onchange = preview;
post.addEventListener("input", saveDraft);
function editPost(snap = null) {
  editing = { type: "post", id: snap?.id || null, data: snap?.data() || {} };
  post.reset();
  const data = editing.data;
  for (const key of ["kind", "title", "body", "video", "image"])
    post.elements[key].value = data[key] || (key === "kind" ? "news" : "");
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
    if (saved && saved.id === editing.id) {
      for (const key of ["kind", "title", "body", "video", "image"])
        post.elements[key].value = saved[key] || "";
    }
  } catch {}
  post.hidden = false;
  reply.hidden = true;
  $("editorHeading").textContent = snap
    ? "Editar publicación"
    : "Nueva publicación";
  message($("postStatus"), "");
  kindChanged();
  openEditor();
}
$("newPost").onclick = () => editPost();
post.onsubmit = async (e) => {
  e.preventDefault();
  if (!user || !post.reportValidity()) return;
  const kind = post.elements.kind.value,
    title = post.elements.title.value.trim(),
    body = post.elements.body.value.trim(),
    video = kind === "videos" ? videoInfo(post.elements.video.value) : null,
    image = kind === "news" ? imageURL(post.elements.image.value) : "";
  if (!title || !body) {
    message($("postStatus"), "Completa el título y el texto.", true);
    return;
  }
  if (kind === "videos" && !video) {
    message(
      $("postStatus"),
      "El enlace debe ser de YouTube o Instagram.",
      true,
    );
    return;
  }
  if (kind === "news" && post.elements.image.value && !image) {
    message(
      $("postStatus"),
      "La imagen debe tener un enlace HTTPS válido.",
      true,
    );
    return;
  }
  const buttons = [...post.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  message($("postStatus"), "Guardando…");
  try {
    const ref = editing.id
      ? doc(db, paths.posts, editing.id)
      : doc(collection(db, paths.posts));
    await setDoc(ref, {
      kind,
      title,
      body,
      video: video?.url || "",
      image,
      published: e.submitter?.value === "publish",
      createdAt: editing.data.createdAt || serverTimestamp(),
      publishedAt: serverTimestamp(),
    });
    try {
      sessionStorage.removeItem(draftKey());
    } catch {}
    closeEditor();
    await load();
    feedback(
      e.submitter?.value === "publish"
        ? "Publicación guardada y visible en el blog."
        : "Borrador guardado. Solo aparece en el panel hasta que lo publiques.",
    );
  } catch (error) {
    console.error(
      "No se pudo guardar la publicación:",
      error.code || error.message,
    );
    message(
      $("postStatus"),
      error.code === "permission-denied"
        ? "No tienes permiso para guardar. Revisa que tu cuenta esté habilitada como administradora."
        : "No se pudo guardar. El borrador permanece en esta sesión.",
      true,
    );
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
};
function editAnswer(snap, published) {
  editing = { type: "answer", id: snap.id, published };
  const data = snap.data();
  post.hidden = true;
  reply.hidden = false;
  reply.reset();
  reply.question.value = data.question;
  reply.answer.value = data.answer || "";
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(draftKey() + "-respuesta") || "null",
    );
    if (saved?.id === snap.id) {
      reply.question.value = saved.question;
      reply.answer.value = saved.answer;
    }
  } catch {}
  $("privateQuestion").textContent = published
    ? "Estás editando una respuesta pública."
    : "Mensaje privado de " + data.name + ":\n" + data.question;
  $("editorHeading").textContent = "Responder con cuidado";
  message($("answerStatus"), "");
  openEditor();
}
reply.onsubmit = async (e) => {
  e.preventDefault();
  if (!user || !reply.reportValidity()) return;
  const question = reply.question.value.trim(),
    answer = reply.answer.value.trim();
  if (question.length < 10 || !answer) {
    message($("answerStatus"), "Completa la pregunta y tu respuesta.", true);
    return;
  }
  const b = reply.querySelector("button");
  b.disabled = true;
  message($("answerStatus"), "Publicando…");
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, paths.answers, editing.id), {
      question,
      answer,
      published: true,
      publishedAt: serverTimestamp(),
    });
    if (!editing.published)
      batch.update(doc(db, paths.inbox, editing.id), { status: "answered" });
    await batch.commit();
    try {
      sessionStorage.removeItem(draftKey() + "-respuesta");
    } catch {}
    closeEditor();
    await load();
    feedback("Pregunta y respuesta publicadas.");
  } catch {
    message(
      $("answerStatus"),
      "No se pudo publicar. Tu texto permanece en el formulario.",
      true,
    );
  } finally {
    b.disabled = false;
  }
};
reply.addEventListener("input", () => {
  if (user && editing?.type === "answer")
    try {
      sessionStorage.setItem(
        draftKey() + "-respuesta",
        JSON.stringify({
          id: editing.id,
          question: reply.question.value,
          answer: reply.answer.value,
        }),
      );
    } catch {}
});
function clearWorkspace() {
  clinical.reset();
  user = null;
  epoch++;
  busy = false;
  $("workspace").hidden = true;
  $("loginPanel").hidden = false;
  $("adminList").replaceChildren();
  $("accountLabel").textContent = "";
  post.reset();
  reply.reset();
  $("privateQuestion").textContent = "";
  $("videoPreview").replaceChildren();
  if (editor.open) closeEditor();
}
login.onsubmit = async (e) => {
  e.preventDefault();
  const b = login.querySelector("button");
  b.disabled = true;
  feedback("Ingresando…");
  try {
    await signInWithEmailAndPassword(
      auth,
      login.email.value.trim(),
      login.password.value,
    );
    login.password.value = "";
  } catch {
    feedback("No se pudo ingresar. Revisa tu correo y contraseña.", true);
  } finally {
    b.disabled = false;
  }
};
$("logout").onclick = async () => {
  const key = draftKey();
  try {
    await signOut(auth);
    try {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(key + "-respuesta");
    } catch {}
    feedback("Sesión cerrada.");
  } catch {
    feedback("No se pudo cerrar la sesión. Vuelve a intentarlo.", true);
  }
};
$("resetPassword").onclick = async () => {
  if (!login.email.reportValidity()) return;
  const b = $("resetPassword");
  b.disabled = true;
  try {
    await sendPasswordResetEmail(auth, login.email.value.trim());
    feedback(
      "Si ese correo tiene una cuenta, recibirás instrucciones para recuperar la contraseña.",
    );
  } catch {
    feedback("No se pudo solicitar la recuperación. Intenta más tarde.", true);
  } finally {
    b.disabled = false;
  }
};
(async () => {
  try {
    ({ db, auth } = await connect());
    await setPersistence(auth, browserSessionPersistence);
    onAuthStateChanged(auth, async (account) => {
      clearWorkspace();
      $("logout").hidden = !account;
      if (!account) {
        feedback("");
        return;
      }
      const revision = epoch;
      feedback("Verificando acceso…");
      try {
        const role = await getDoc(doc(db, paths.admins, account.uid));
        if (revision !== epoch) return;
        if (!role.exists() || role.data().active !== true) {
          feedback(
            "Esta cuenta no tiene acceso al panel. Solicita que habiliten tus permisos.",
            true,
          );
          return;
        }
        user = account;
        $("workspace").hidden = false;
        $("loginPanel").hidden = true;
        $("accountLabel").textContent = account.email;
        selectTab(active, false);
      } catch {
        if (revision === epoch)
          feedback(
            "No se pudo verificar el acceso. Revisa la configuración de permisos en Firebase.",
            true,
          );
      }
    });
  } catch {
    feedback(
      "El panel aún no está conectado. Revisa la configuración de Firebase Hosting.",
      true,
    );
    login.querySelector("button").disabled = true;
  }
})();
