import { connect, paths, videoInfo, imageURL, el, message } from "./datos.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const grid = document.getElementById("communityGrid"),
  status = document.getElementById("communityStatus"),
  more = document.getElementById("communityMore");
const tabs = [...document.querySelectorAll("[data-community-tab]")];
const blogHashes = {
  news: "#blog-noticias",
  videos: "#blog-videos",
  answers: "#blog-preguntas",
};
const initialTab =
  Object.keys(blogHashes).find((key) => blogHashes[key] === location.hash) ||
  "news";
let active = initialTab,
  cursor = null,
  loading = false,
  version = 0;
history.replaceState({ vetBase: true }, "");
history.pushState({ vetHome: true, tab: initialTab }, "");
let lastBack = 0;
const dialog = document.getElementById("articleDialog");
function closeArticle() {
  if (dialog.open) history.back();
}
document.getElementById("articleClose").onclick = closeArticle;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeArticle();
});
window.addEventListener("popstate", (event) => {
  if (event.state?.tab) selectTab(event.state.tab, false);
  if (dialog.open) {
    dialog.close();
    return;
  }
  if (event.state?.vetBase) {
    if (Date.now() - lastBack < 2000) {
      history.back();
    } else {
      lastBack = Date.now();
      message(status, "Presiona atrás otra vez para salir.");
      history.pushState({ vetHome: true, tab: "news" }, "");
    }
  }
});
function article(post) {
  const content = document.getElementById("articleContent");
  content.replaceChildren(el("h2", post.title));
  const src = imageURL(post.image);
  if (src) {
    const img = el("img");
    img.src = src;
    img.alt = "";
    content.append(img);
  }
  content.append(el("p", post.body));
  dialog.showModal();
  history.pushState({ article: true }, "");
}
function card(data) {
  const node = el("article", undefined, "community-card");
  if (active === "videos") {
    const info = videoInfo(data.video);
    if (info) {
      const frame = el("iframe");
      frame.className =
        "community-video" +
        (info.provider === "Instagram" ? " community-instagram" : "");
      frame.src = info.embed;
      frame.title = data.title;
      frame.loading = "lazy";
      frame.allow = "encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      node.append(frame);
    }
  } else if (active === "news" && imageURL(data.image)) {
    const img = el("img");
    img.src = imageURL(data.image);
    img.alt = "";
    img.loading = "lazy";
    node.append(img);
  }
  const body = el("div", undefined, "community-card-body");
  const date = data.publishedAt?.toDate?.();
  if (date) {
    const time = el("time", date.toLocaleDateString("es-CL"));
    time.dateTime = date.toISOString();
    body.append(time);
  }
  body.append(el("h3", active === "answers" ? data.question : data.title));
  if (active === "answers") {
    body.append(
      el("span", "Respuesta de la Dra. Garcés", "community-label"),
      el("p", data.answer, "community-answer"),
    );
  } else {
    body.append(
      el(
        "p",
        (data.body || "").slice(0, 200) +
          ((data.body || "").length > 200 ? "…" : ""),
      ),
    );
    if (active === "news") {
      const button = el("button", "Leer noticia", "btn btn-ghost");
      button.style.marginTop = "18px";
      button.onclick = () => article(data);
      body.append(button);
    }
    if (active === "videos") {
      const info = videoInfo(data.video);
      if (info) {
        const link = el("a", "Abrir en " + info.provider);
        link.href = info.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.display = "block";
        link.style.marginTop = "16px";
        body.append(link);
      }
    }
  }
  node.append(body);
  return node;
}
async function load(reset = true) {
  if (loading && !reset) return;
  const requestVersion = reset ? ++version : version;
  loading = true;
  more.disabled = true;
  if (reset) {
    cursor = null;
    grid.replaceChildren();
    more.hidden = true;
  }
  message(status, "Cargando…");
  try {
    const { db } = await connect();
    const source = active === "answers" ? paths.answers : paths.posts;
    const constraints = [where("published", "==", true)];
    if (active !== "answers") constraints.push(where("kind", "==", active));
    constraints.push(orderBy("publishedAt", "desc"), limit(6));
    if (cursor) constraints.push(startAfter(cursor));
    const snapshot = await getDocs(
      query(collection(db, source), ...constraints),
    );
    if (requestVersion !== version) return;
    snapshot.forEach((doc) => grid.append(card(doc.data())));
    cursor = snapshot.docs.at(-1) || cursor;
    more.hidden = snapshot.size < 6;
    if (!grid.children.length)
      grid.append(
        el(
          "p",
          active === "answers"
            ? "Aquí aparecerán las preguntas que la doctora responda y publique."
            : "Pronto compartiremos novedades y consejos para tus mascotas.",
          "community-empty",
        ),
      );
    message(status, "");
  } catch (error) {
    if (requestVersion === version) {
      more.hidden = true;
      console.error("No se pudo cargar el blog:", error.code || error.message);
      message(
        status,
        "Esta sección todavía no está disponible. Intenta nuevamente más tarde.",
        true,
      );
      const retry = el("button", "Reintentar", "btn btn-ghost");
      retry.onclick = () => load(true);
      grid.replaceChildren(retry);
    }
  } finally {
    if (requestVersion === version) {
      loading = false;
      more.disabled = false;
    }
  }
}
function selectTab(tab, push = true) {
  if (!["news", "videos", "answers"].includes(tab)) return;
  active = tab;
  tabs.forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.communityTab === tab)),
  );
  if (push) history.pushState({ tab }, "", blogHashes[tab]);
  load(true);
}
tabs.forEach(
  (button) => (button.onclick = () => selectTab(button.dataset.communityTab)),
);
function navigateBlog(tab) {
  selectTab(tab);
  document.getElementById("comunidad").scrollIntoView({ behavior: "smooth" });
}
document.addEventListener("vet-community-nav", (event) =>
  navigateBlog(event.detail.tab),
);
for (const link of document.querySelectorAll("[data-community-link]")) {
  if (link.closest("#navLinks")) continue;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateBlog(link.dataset.communityLink);
  });
}
tabs.forEach((b) =>
  b.setAttribute("aria-pressed", String(b.dataset.communityTab === initialTab)),
);
if (
  location.hash in
  { "#blog-noticias": true, "#blog-videos": true, "#blog-preguntas": true }
)
  document.getElementById("comunidad").scrollIntoView();
more.onclick = () => load(false);
const form = document.getElementById("questionForm"),
  notice = document.getElementById("questionStatus");
const key = "vet-pregunta-borrador";
try {
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  form.nombre.value = saved.name || "";
  form.pregunta.value = saved.question || "";
} catch {}
form.addEventListener("input", () => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        name: form.nombre.value,
        question: form.pregunta.value,
      }),
    );
  } catch {}
});
form.onsubmit = async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (form.website.value) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  message(notice, "Enviando tu pregunta…");
  try {
    let last = 0;
    try {
      last = Number(localStorage.getItem("vet-ultima-pregunta") || 0);
    } catch {}
    if (Date.now() - last < 60000)
      throw new Error("Espera un minuto antes de enviar otra pregunta.");
    const { db } = await connect();
    await addDoc(collection(db, paths.inbox), {
      name: form.nombre.value.trim(),
      question: form.pregunta.value.trim(),
      createdAt: serverTimestamp(),
      status: "pending",
    });
    form.reset();
    try {
      localStorage.removeItem(key);
      localStorage.setItem("vet-ultima-pregunta", String(Date.now()));
    } catch {}
    message(
      notice,
      "Pregunta enviada. La doctora la revisará; solo aparecerá aquí si decide responderla y publicarla.",
    );
  } catch (error) {
    message(
      notice,
      error.message === "Espera un minuto antes de enviar otra pregunta."
        ? error.message
        : "No se pudo enviar. Tu borrador sigue guardado; vuelve a intentarlo.",
      true,
    );
  } finally {
    button.disabled = false;
  }
};
load();
