// Lógica: node tools/veterinaria-fichas-check.cjs
// Permisos reales: iniciar emulador y ejecutar con FIRESTORE_EMULATOR_HOST=127.0.0.1:8085.
// Dependencias de estas pruebas: firebase y @firebase/rules-unit-testing (solo desarrollo).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const { clinicalWrite, clinicalChanges, normalizeClinical, clinicalTime } =
    await import(
      pathToFileURL(path.resolve(__dirname, "../veterinaria/fichas-modelo.js"))
    );
  const actor = { uid: "vet-1", email: "vetdeliagarces@gmail.com" };
  const patient = {
    name: "Luna",
    species: "Gato",
    tutor: "Tutor de prueba",
    weight: "4,5",
  };
  const first = clinicalWrite(
    null,
    patient,
    actor,
    "change1",
    "server-time",
    "patient",
    "patient1",
  );
  assert.equal(first.after.revision, 1);
  assert.equal(first.change.before, null);
  assert.equal(first.after.updatedAt, "server-time");
  const second = clinicalWrite(
    first.after,
    { ...first.after, weight: "4,7" },
    actor,
    "change2",
    "new-server-time",
    "patient",
    "patient1",
    "Control de peso",
  );
  assert.equal(second.after.createdAt, first.after.createdAt);
  assert.equal(second.after.revision, 2);
  assert.equal(second.change.before.weight, "4,5");
  assert.equal(second.change.after.weight, "4,7");
  assert.equal(clinicalChanges(first.after, second.after, "patient").length, 1);
  assert.throws(
    () =>
      clinicalWrite(
        first.after,
        first.after,
        actor,
        "no-change",
        0,
        "patient",
        "patient1",
        "Sin cambio",
      ),
    /No hay cambios/,
  );
  assert.throws(
    () =>
      clinicalWrite(
        first.after,
        { ...first.after, name: "Sol" },
        actor,
        "invalid",
        0,
        "patient",
        "patient1",
        "",
      ),
    /motivo/,
  );
  assert.throws(
    () => normalizeClinical("visit", { date: "2026-02-30", reason: "Control" }),
    /fechas/,
  );
  assert.throws(
    () => normalizeClinical("patient", { ...patient, weight: "-1" }),
    /peso/,
  );
  assert.throws(
    () =>
      clinicalWrite(null, patient, null, "invalid", 0, "patient", "patient1"),
    /cuenta/,
  );
  assert.match(
    clinicalTime({ toDate: () => new Date("2026-10-11T18:00:00Z") }),
    /15:00:00/,
  );
  console.log(
    "OK lógica: versiones, horas de Chile, correcciones, datos originales y validación.",
  );
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("Permisos: no ejecutados (requieren emulador).");
    return;
  }
  const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
  } = require("@firebase/rules-unit-testing");
  const {
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    runTransaction,
    writeBatch,
    serverTimestamp,
  } = require("firebase/firestore");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: "demo-veterinaria",
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync(
        path.resolve(
          __dirname,
          "../docs/veterinaria-firestore-completas.rules",
        ),
        "utf8",
      ),
    },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), "vetAdministradores", actor.uid), {
        active: true,
      }),
    );
    const db = env
      .authenticatedContext(actor.uid, { email: actor.email })
      .firestore();
    const guest = env.unauthenticatedContext().firestore();
    const outsider = env
      .authenticatedContext("other", { email: "otra@gmail.com" })
      .firestore();
    const disabled = env
      .authenticatedContext("disabled", { email: actor.email })
      .firestore();
    async function writeRecord(
      ref,
      kind,
      id,
      fields,
      reason = "",
      beforeOverride,
    ) {
      const log = doc(collection(db, "vetPacientes", "patient1", "cambios"));
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref),
          before = snap.exists() ? snap.data() : null;
        const result = clinicalWrite(
          before,
          fields,
          actor,
          log.id,
          serverTimestamp(),
          kind,
          id,
          reason,
        );
        if (beforeOverride !== undefined) result.change.before = beforeOverride;
        tx.set(ref, result.after);
        tx.set(log, result.change);
      });
    }
    const ref = doc(db, "vetPacientes", "patient1");
    await assertFails(
      setDoc(
        ref,
        clinicalWrite(
          null,
          patient,
          actor,
          "missing-log",
          serverTimestamp(),
          "patient",
          "patient1",
        ).after,
      ),
    );
    await assertSucceeds(writeRecord(ref, "patient", "patient1", patient));
    const before = (await getDoc(ref)).data();
    await assertFails(getDoc(doc(guest, "vetPacientes", "patient1")));
    await assertFails(getDocs(collection(guest, "vetPacientes")));
    await assertFails(getDocs(collection(outsider, "vetPacientes")));
    await assertFails(getDoc(doc(disabled, "vetPacientes", "patient1")));
    await assertFails(
      setDoc(
        ref,
        clinicalWrite(
          before,
          { ...before, weight: "4,6" },
          actor,
          "missing-update-log",
          serverTimestamp(),
          "patient",
          "patient1",
          "Prueba sin historial",
        ).after,
      ),
    );
    await assertFails(
      updateDoc(ref, { weight: "9", updatedAt: serverTimestamp() }),
    );
    await assertFails(
      writeRecord(
        ref,
        "patient",
        "patient1",
        { ...before, weight: "4,7" },
        "Control de peso",
        null,
      ),
    );
    await assertSucceeds(
      writeRecord(
        ref,
        "patient",
        "patient1",
        { ...before, weight: "4,7" },
        "Control de peso",
      ),
    );
    const updated = (await getDoc(ref)).data();
    assert.equal(updated.revision, 2);
    assert.equal(updated.weight, "4,7");
    assert.ok(updated.createdAt.isEqual(before.createdAt));
    const audits = await getDocs(
      collection(db, "vetPacientes", "patient1", "cambios"),
    );
    assert.equal(audits.size, 2);
    const log = audits.docs.find((s) => s.data().before !== null);
    assert.equal(log.data().before.weight, "4,5");
    assert.equal(log.data().after.weight, "4,7");
    await assertFails(updateDoc(log.ref, { reason: "Borrar el historial" }));
    await assertFails(deleteDoc(log.ref));
    await assertFails(deleteDoc(ref));
    await assertFails(
      getDocs(collection(guest, "vetPacientes", "patient1", "cambios")),
    );
    const fake = doc(collection(db, "vetPacientes", "patient1", "cambios"));
    await assertFails(
      setDoc(fake, {
        ...log.data(),
        createdAt: serverTimestamp(),
        after: {
          ...updated,
          lastChangeId: fake.id,
          updatedAt: serverTimestamp(),
        },
      }),
    );
    const visitRef = doc(
      db,
      "vetPacientes",
      "patient1",
      "atenciones",
      "visit1",
    );
    const visit = {
      date: "2026-10-11",
      reason: "Control",
      prevention: "Registro de prueba",
    };
    await assertSucceeds(writeRecord(visitRef, "visit", "visit1", visit));
    const visitBefore = (await getDoc(visitRef)).data();
    await assertSucceeds(
      writeRecord(
        visitRef,
        "visit",
        "visit1",
        { ...visitBefore, assessment: "Evaluación corregida" },
        "Corrección de transcripción",
      ),
    );
    assert.equal((await getDoc(visitRef)).data().revision, 2);
    await assertFails(
      getDocs(collection(guest, "vetPacientes", "patient1", "atenciones")),
    );
    await assertFails(deleteDoc(visitRef));
    const orphan = doc(db, "vetPacientes", "missing", "atenciones", "orphan"),
      orphanLog = doc(db, "vetPacientes", "missing", "cambios", "orphanLog");
    const data = clinicalWrite(
      null,
      visit,
      actor,
      orphanLog.id,
      serverTimestamp(),
      "visit",
      "orphan",
    );
    const batch = writeBatch(db);
    batch.set(orphan, data.after);
    batch.set(orphanLog, data.change);
    await assertFails(batch.commit());
    await assertFails(
      setDoc(doc(db, "properties", "clinical-test"), {
        title: "Acceso indebido",
      }),
    );
    await assertFails(getDocs(collection(db, "messages")));
    await assertFails(
      setDoc(doc(db, "vetAdministradores", "other"), { active: true }),
    );
    await assertSucceeds(setDoc(doc(db, "forjar", actor.uid), { test: true }));
    await assertFails(getDoc(doc(db, "forjar", "other")));
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), "vetAdministradores", actor.uid), {
        active: false,
      }),
    );
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, "vetPacientes")));
    console.log(
      "OK emulador: ficha y atención atómicas, auditoría inmutable, sin lecturas públicas ni cuentas sin rol, sin huérfanos, preserva permisos de otros sitios.",
    );
  } finally {
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
