import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export const paths = {
  posts: "vetPublicaciones",
  inbox: "vetPreguntasPrivadas",
  answers: "vetRespuestas",
  admins: "vetAdministradores",
};
let connection;
export function connect() {
  if (!connection)
    connection = (async () => {
      const response = await fetch("/__/firebase/init.json");
      if (!response.ok) throw new Error("No se pudo conectar con el sitio.");
      const config = await response.json();
      if (config.projectId !== "daniel-tapia-abogado")
        throw new Error("Configuración de proyecto incorrecta.");
      const app = initializeApp(config, "veterinaria");
      return { db: getFirestore(app), auth: getAuth(app) };
    })();
  return connection.catch((error) => {
    connection = null;
    throw error;
  });
}
export function videoInfo(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  if (host === "youtube.com" || host === "m.youtube.com") {
    id = url.searchParams.get("v") || "";
    if (!id && /^\/(shorts|embed)\//.test(url.pathname))
      id = url.pathname.split("/")[2];
  }
  if (id && /^[\w-]{11}$/.test(id))
    return {
      provider: "YouTube",
      embed: "https://www.youtube-nocookie.com/embed/" + id,
      url: "https://www.youtube.com/watch?v=" + id,
    };
  if (host === "instagram.com") {
    const match = url.pathname.match(/^\/(reel|p|tv)\/([\w-]+)\/?$/);
    if (match)
      return {
        provider: "Instagram",
        embed:
          "https://www.instagram.com/" + match[1] + "/" + match[2] + "/embed/",
        url: "https://www.instagram.com/" + match[1] + "/" + match[2] + "/",
      };
  }
  return null;
}
export function imageURL(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function message(target, text, error = false) {
  target.textContent = text;
  target.dataset.error = String(error);
}
