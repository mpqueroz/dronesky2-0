// Pruebas de interfaz con DOM real simulado (linkedom), sin datos ni cuentas de producción.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { parseHTML } = require("linkedom");
const root = path.resolve(__dirname, "../veterinaria");
const { document, window } = parseHTML(
  '<html><body><section id="clinicalPanel"></section></body></html>',
);
window.HTMLElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLElement.prototype.close = function () {
  this.open = false;
};
window.HTMLElement.prototype.reportValidity = () => true;
window.HTMLElement.prototype.reset = function () {
  for (const n of this.querySelectorAll("input,textarea")) n.value = "";
};
const data = new Map(),
  values = new Map();
let sequence = 0,
  controller,
  user = { uid: "vet", email: "vet@test.cl" },
  deferList = null;
const stamp = () => ({ toDate: () => new Date("2026-10-11T18:00:00Z") });
const storage = {
  getItem: (k) => values.get(k) || null,
  setItem: (k, v) => values.set(k, v),
  removeItem: (k) => values.delete(k),
  key: (i) => [...values.keys()][i],
  get length() {
    return values.size;
  },
};
const collection = (db, ...parts) => ({ path: parts.join("/") });
const doc = (base, ...parts) => ({
  path: base.path
    ? base.path + "/" + (parts[0] || "auto" + ++sequence)
    : parts.join("/"),
  get id() {
    return this.path.split("/").at(-1);
  },
});
const snapshot = (ref) => ({
  id: ref.id,
  ref,
  exists: () => data.has(ref.path),
  data: () => data.get(ref.path),
});
const getDocs = async (q) => {
  if (deferList && q.col.path === "vetPacientes") await deferList;
  const docs = [...data.keys()]
    .filter(
      (k) =>
        k.startsWith(q.col.path + "/") &&
        k.split("/").length === q.col.path.split("/").length + 1,
    )
    .map((k) => snapshot({ path: k, id: k.split("/").at(-1) }));
  return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
};
const runTransaction = async (db, fn) => {
  const writes = [];
  await fn({
    get: async (ref) => snapshot(ref),
    set: (ref, value) => writes.push([ref.path, value]),
  });
  for (const [key, v] of writes) data.set(key, v);
};
const ctx = vm.createContext({
  document,
  window,
  console,
  Date,
  Intl,
  JSON,
  String,
  Number,
  Object,
  sessionStorage: storage,
  collection,
  doc,
  getDocs,
  query: (col, ...parts) => ({ col, parts }),
  orderBy: () => ({}),
  limit: () => ({}),
  startAfter: () => ({}),
  runTransaction,
  serverTimestamp: stamp,
  history: {
    pushState() {},
    back() {
      controller.handleBack();
    },
  },
  getContext: () => ({ db: {}, user }),
});
const model = fs
  .readFileSync(path.join(root, "fichas-modelo.js"), "utf8")
  .replace(/export /g, "");
const helpers = `function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}function message(node,text,error=false){node.textContent=text;node.dataset.error=String(error)}`;
const source = fs
  .readFileSync(path.join(root, "fichas.js"), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export /g, "");
vm.runInContext(model + "\n" + helpers + "\n" + source, ctx);
controller = vm.runInContext("createClinicalPanel({getContext})", ctx);
const tick = () => new Promise((r) => setImmediate(r));
function findButton(text) {
  const n = [...document.querySelectorAll("button")].find(
    (n) => n.textContent === text,
  );
  assert.ok(n, "Botón " + text);
  return n;
}
async function click(text) {
  await findButton(text).onclick();
  await tick();
}
function field(key, value) {
  document.getElementById("clinical-" + key).value = value;
}
function input() {
  document
    .querySelector("#clinicalEditor form")
    .dispatchEvent(new window.Event("input"));
}
async function submit() {
  document
    .querySelector("#clinicalEditor form")
    .dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  await tick();
}
(async () => {
  await controller.show();
  await click("Nueva ficha");
  field("name", "Luna");
  field("species", "Gato");
  field("tutor", "Tutor ficticio");
  field("weight", "4,5");
  input();
  assert.ok(values.size > 0);
  await submit();
  assert.equal(data.size, 2);
  assert.equal(values.size, 0);
  assert.equal(document.getElementById("clinicalEditor").open, false);
  await click("Abrir ficha");
  await click("Editar datos");
  field("weight", "4,7");
  field("note", "Control de peso");
  await submit();
  const patientRef = [...data.keys()].find((k) => k.split("/").length === 2);
  assert.equal(data.get(patientRef).revision, 2);
  assert.equal(data.size, 3);
  await click("Nueva atención");
  field("reason", "Control ficticio");
  field("assessment", "Paciente de prueba");
  input();
  await submit();
  assert.equal(data.size, 5);
  await click("Ver historial de modificaciones");
  assert.match(
    document.getElementById("clinicalAudit").textContent,
    /Antes: 4,5/,
  );
  assert.match(
    document.getElementById("clinicalAudit").textContent,
    /Ahora: 4,7/,
  );
  await click("Modificar atención");
  field("assessment", "Corrección que debe guardarse");
  field("note", "Corrección de texto");
  input();
  const visitPath = [...data.keys()].find((k) => k.includes("/atenciones/"));
  data.set(visitPath, {
    ...data.get(visitPath),
    assessment: "Cambio desde otro dispositivo",
    revision: 2,
  });
  await submit();
  assert.equal(data.get(visitPath).assessment, "Cambio desde otro dispositivo");
  assert.equal(document.getElementById("clinicalEditor").open, true);
  assert.match(
    document.getElementById("clinicalEditor").textContent,
    /cambió desde que la abriste/,
  );
  controller.handleBack();
  controller.handleBack();
  await controller.show();
  await click("Abrir ficha");
  await click("Modificar atención");
  assert.equal(
    document.getElementById("clinical-assessment").value,
    "Cambio desde otro dispositivo",
  );
  await click("Recuperar texto del borrador");
  assert.equal(
    document.getElementById("clinical-assessment").value,
    "Corrección que debe guardarse",
  );
  controller.handleBack();
  await click("Nueva atención");
  field("reason", "Borrador del paciente Luna");
  input();
  controller.handleBack();
  controller.handleBack();
  await click("Nueva ficha");
  field("name", "Sol");
  field("species", "Perro");
  field("tutor", "Otro tutor ficticio");
  await submit();
  const patientButtons = [...document.querySelectorAll("button")].filter(
    (n) => n.textContent === "Abrir ficha",
  );
  await patientButtons.at(-1).onclick();
  await click("Nueva atención");
  assert.equal(
    document.getElementById("clinical-reason").value,
    "",
    "No comparte borradores entre pacientes",
  );
  field("reason", "Texto que debe desaparecer al salir");
  input();
  controller.reset();
  user = null;
  assert.equal(values.size, 0);
  assert.equal(document.getElementById("clinicalPanel").hidden, true);
  assert.equal(document.getElementById("clinicalEditor").open, false);
  assert.doesNotMatch(
    document.body.textContent,
    /Tutor ficticio|Texto que debe desaparecer/,
  );
  user = { uid: "vet", email: "vet@test.cl" };
  let resolve;
  deferList = new Promise((r) => (resolve = r));
  const loading = controller.show();
  controller.reset();
  user = null;
  resolve();
  await loading;
  assert.doesNotMatch(
    document.body.textContent,
    /Tutor ficticio/,
    "Una carga antigua no muestra datos después de cerrar sesión",
  );
  console.log(
    "OK interfaz: ficha y consulta, cambios visibles, conflicto entre dispositivos sin sobrescribir, borradores separados por paciente, recuperación y limpieza al salir.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
