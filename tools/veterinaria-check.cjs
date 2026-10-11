// Pruebas de lógica con DOM y Firebase simulados; no sustituyen reglas/emulador ni revisión visual.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const root = path.resolve(__dirname, "../veterinaria");
class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.style = {};
    this.listeners = {};
    this.elements = {};
    this.textContent = "";
    this.attrs = {};
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(k, fn) {
    this.listeners[k] = fn;
  }
  reportValidity() {
    return true;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  reset() {
    for (const e of Object.values(this.elements)) e.value = "";
  }
  closest() {
    return null;
  }
  scrollIntoView() {}
  querySelector() {
    return (this.button ||= new Element("button"));
  }
  querySelectorAll() {
    return [this.querySelector()];
  }
}
function setup(file) {
  const html = fs.readFileSync(path.join(root, file), "utf8"),
    nodes = {};
  for (const match of html.matchAll(/\bid="([^"]+)"/g))
    nodes[match[1]] = new Element();
  const formKeys =
    file === "admin.html"
      ? {
          loginForm: ["email", "password"],
          postForm: ["kind", "title", "body", "video", "image"],
          answerForm: ["question", "answer"],
        }
      : { questionForm: ["nombre", "pregunta", "website"] };
  for (const [id, keys] of Object.entries(formKeys))
    for (const key of keys) {
      const el = new Element();
      nodes[id].elements[key] = el;
      if (key !== "title") nodes[id][key] = el;
    }
  const tabs = (
    file === "admin.html"
      ? ["posts", "inbox", "answers"]
      : ["news", "videos", "answers"]
  ).map((tab) => {
    const el = new Element("button");
    el.dataset[file === "admin.html" ? "tab" : "communityTab"] = tab;
    return el;
  });
  const store = new Map(),
    storage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
  const history = {
    state: null,
    entries: [],
    pushes: 0,
    replaceState(s) {
      this.state = s;
      if (!this.entries.length) this.entries.push(s);
      else this.entries[this.entries.length - 1] = s;
    },
    pushState(s) {
      this.pushes++;
      this.entries.push(s);
      this.state = s;
    },
    back() {
      this.entries.pop();
      this.state = this.entries.at(-1) || { vetHome: true };
      for (const fn of win.listeners.popstate || []) fn({ state: this.state });
    },
  };
  const win = {
    listeners: {},
    scrollTo(options) { this.lastScroll = options; },
    addEventListener(k, fn) {
      (this.listeners[k] ||= []).push(fn);
    },
  };
  const context = {
    console,
    location: { hash: "", pathname: "/", search: "" },
    URL,
    Date,
    JSON,
    Number,
    String,
    Promise,
    setTimeout,
    history,
    localStorage: storage,
    sessionStorage: storage,
    document: {
      getElementById: (id) => nodes[id],
      createElement: (tag) => new Element(tag),
      querySelectorAll: (selector) =>
        selector === "[data-community-link]" ? [] : tabs,
      addEventListener: () => {},
    },
    window: win,
  };
  vm.createContext(context);
  let helpers = fs
    .readFileSync(path.join(root, "datos.js"), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/export /g, "");
  vm.runInContext(helpers, context);
  vm.runInContext(
    `
const database={vetPublicaciones:{},vetPreguntasPrivadas:{q1:{name:'Nombre privado',question:'¿Cómo cuidar una mascota en verano?',status:'pending',createdAt:new Date()}},vetRespuestas:{},vetAdministradores:{admin:{active:true}}},writes=[];let authListener;
connect=async()=>({db:{},auth:{}});
const browserSessionPersistence='session',setPersistence=async()=>{},onAuthStateChanged=(a,fn)=>{authListener=fn;return fn(null)},signInWithEmailAndPassword=async(a,email)=>authListener({uid:email==='admin@test.cl'?'admin':'other',email}),signOut=async()=>authListener(null),sendPasswordResetEmail=async()=>{};
const collection=(db,name)=>({name}),doc=(dbOrCol,name,id)=>dbOrCol.name?({source:dbOrCol.name,id:name||'new'}):({source:name,id}),where=(field,op,value)=>({field,value}),orderBy=()=>({}),limit=()=>({}),startAfter=()=>({}),serverTimestamp=()=>new Date(),query=(col,...parts)=>({col,parts});
function snapshot(ref){const data=database[ref.source]?.[ref.id];return {ref,id:ref.id,exists:()=>!!data,data:()=>data}}
const getDoc=async ref=>snapshot(ref),getDocs=async q=>{let docs=Object.keys(database[q.col.name]).map(id=>snapshot({source:q.col.name,id}));for(const p of q.parts)if(p.field)docs=docs.filter(s=>s.data()[p.field]===p.value);return {docs,size:docs.length,forEach:fn=>docs.forEach(fn)}};
const setDoc=async(ref,data)=>{database[ref.source][ref.id]=data;writes.push({ref,data})},updateDoc=async(ref,data)=>Object.assign(database[ref.source][ref.id],data),deleteDoc=async ref=>delete database[ref.source][ref.id],addDoc=async(col,data)=>setDoc(doc(col),data),writeBatch=()=>{const operations=[];return {set:(ref,data)=>operations.push(()=>setDoc(ref,data)),update:(ref,data)=>operations.push(()=>updateDoc(ref,data)),delete:ref=>operations.push(()=>deleteDoc(ref)),commit:async()=>{writes.push({batch:operations.length});for(const op of operations)await op()}}};
`,
    context,
  );
  return {
    context,
    nodes,
    tabs,
    storage,
    run: (code) => vm.runInContext(code, context),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
(async () => {
  const admin = setup("admin.html");
  const { context, nodes, run } = admin;
  const source = fs
    .readFileSync(path.join(root, "admin.js"), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "");
  run(source);
  await tick();
  await nodes.loginForm.onsubmit({ preventDefault() {} });
  assert.equal(nodes.workspace.hidden, true);
  nodes.loginForm.email.value = "admin@test.cl";
  await nodes.loginForm.onsubmit({ preventDefault() {} });
  await tick();
  assert.equal(nodes.workspace.hidden, false);
  run("editPost()");
  nodes.postForm.elements.kind.value = "videos";
  nodes.postForm.elements.title.value = "Video de cuidados";
  nodes.postForm.elements.body.value = "Consejos";
  nodes.postForm.elements.video.value = "javascript:alert(1)";
  await nodes.postForm.onsubmit({
    preventDefault() {},
    submitter: { value: "publish" },
  });
  assert.equal(run("writes.length"), 0);
  nodes.postForm.elements.video.value = "https://youtu.be/dQw4w9WgXcQ";
  await nodes.postForm.onsubmit({
    preventDefault() {},
    submitter: { value: "draft" },
  });
  assert.equal(run("database.vetPublicaciones.new.published"), false);
  assert.equal(
    run("database.vetPublicaciones.new.video"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  run("editAnswer(snapshot({source:paths.inbox,id:'q1'}),false)");
  nodes.answerForm.question.value = "¿Cómo cuidar una mascota?";
  nodes.answerForm.answer.value = "Mantén agua fresca y evita el calor.";
  await nodes.answerForm.onsubmit({ preventDefault() {} });
  assert.equal(run("database.vetPreguntasPrivadas.q1.status"), "answered");
  assert.equal(run("writes.find(w=>w.batch).batch"), 2);
  assert.equal(run("'name' in database.vetRespuestas.q1"), false);
  assert.equal(
    run("database.vetRespuestas.q1.question"),
    "¿Cómo cuidar una mascota?",
  );
  await nodes.logout.onclick();
  assert.equal(nodes.workspace.hidden, true);
  assert.equal(nodes.privateQuestion.textContent, "");
  assert.equal(nodes.adminList.children.length, 0);
  const publicUI = setup("index.html");
  publicUI.run(
    fs
      .readFileSync(path.join(root, "comunidad.js"), "utf8")
      .replace(/^import[\s\S]*?;\n/gm, ""),
  );
  await tick();
  publicUI.run("navigateBlog('videos')");
  await tick();
  assert.equal(publicUI.run("active"), "videos");
  assert.equal(publicUI.nodes.communityMore.hidden, true);
  const initialPushes = publicUI.context.history.pushes;
  publicUI.run("navigateBlog('news'); navigateBlog('answers'); navigateBlog('videos')");
  assert.equal(publicUI.context.history.pushes, initialPushes, "Las pestañas no acumulan historial");
  publicUI.run("article({title:'Prueba',body:'Noticia de prueba'})");
  publicUI.context.history.back();
  assert.equal(publicUI.nodes.articleDialog.open, false, "Atrás cierra la noticia");
  assert.equal(publicUI.run("active"), "videos");
  publicUI.context.history.back();
  assert.equal(publicUI.context.window.lastScroll.top, 0, "Atrás vuelve al inicio directamente");
  assert.equal(publicUI.context.history.state.vetBase, true);
  publicUI.run("navigateBlog('answers'); navigateBlog('news')");
  assert.equal(publicUI.context.history.pushes, initialPushes + 2, "Se reutiliza un solo paso desde el inicio");
  publicUI.nodes.questionForm.nombre.value = "Visitante";
  publicUI.nodes.questionForm.pregunta.value =
    "¿Qué vacunas necesita mi mascota?";
  publicUI.storage.getItem = () => {
    throw Error("bloqueado");
  };
  publicUI.storage.setItem = () => {
    throw Error("bloqueado");
  };
  publicUI.storage.removeItem = () => {
    throw Error("bloqueado");
  };
  await publicUI.nodes.questionForm.onsubmit({ preventDefault() {} });
  assert.equal(
    publicUI.run("database.vetPreguntasPrivadas.new.status"),
    "pending",
  );
  assert.equal(publicUI.run("Object.keys(database.vetRespuestas).length"), 0);
  assert.match(publicUI.nodes.questionStatus.textContent, /Pregunta enviada/);
  for (const url of [
    "javascript:alert(1)",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "http://youtu.be/dQw4w9WgXcQ",
    "https://evil.test/embed/a",
    "https://www.instagram.com/accounts/login/",
  ])
    assert.equal(run(`videoInfo(${JSON.stringify(url)})`), null);
  assert.equal(
    run("videoInfo('https://youtube.com/shorts/dQw4w9WgXcQ').provider"),
    "YouTube",
  );
  assert.equal(
    run(
      "videoInfo('https://www.instagram.com/reel/ABC_123/?igsh=hola').provider",
    ),
    "Instagram",
  );
  assert.equal(run("imageURL('data:text/html,test')"), "");
  for (const file of ["index.html", "admin.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8"),
      ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, "IDs duplicados " + file);
  }
  console.log(
    "OK: acceso sin rol, borrador privado, URL de video, publicación conjunta sin nombre, cierre de sesión, pregunta privada con almacenamiento bloqueado, URLs inseguras e IDs. Firebase y DOM simulados.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
