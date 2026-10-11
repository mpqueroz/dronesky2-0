// Los registros y su cambio se guardan juntos; la hora la asigna Firestore.
export const patientFields = {
  name: ["Nombre del paciente", 100],
  species: ["Especie", 30],
  breed: ["Raza", 100],
  birthDate: ["Fecha de nacimiento", 10],
  sex: ["Sexo", 30],
  weight: ["Peso (kg)", 20],
  tutor: ["Nombre del tutor", 120],
  phone: ["Teléfono", 40],
  address: ["Dirección / comuna", 250],
  background: ["Antecedentes, alergias y medicamentos habituales", 5000],
};
export const visitFields = {
  date: ["Fecha de atención", 10],
  reason: ["Motivo de consulta", 500],
  weight: ["Peso (kg)", 20],
  assessment: ["Evaluación y hallazgos", 5000],
  diagnosis: ["Diagnóstico", 3000],
  treatment: ["Tratamiento e indicaciones", 5000],
  prevention: ["Vacunas / desparasitación aplicadas", 3000],
  nextDate: ["Próximo control", 10],
};
export function normalizeClinical(kind, values) {
  const fields = kind === "patient" ? patientFields : visitFields;
  const result = {};
  for (const [key, [label, maximum]] of Object.entries(fields)) {
    const text = String(values[key] ?? "").trim();
    if (text.length > maximum)
      throw new Error(`${label}: el texto es demasiado largo.`);
    result[key] = text;
  }
  for (const key of kind === "patient"
    ? ["name", "species", "tutor"]
    : ["date", "reason"])
    if (!result[key])
      throw new Error(`Completa ${fields[key][0].toLowerCase()}.`);
  for (const key of kind === "patient" ? ["birthDate"] : ["date", "nextDate"]) {
    const v = result[key];
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(Date.parse(v + "T12:00:00Z")) ||
        new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v)
    )
      throw new Error("Revisa las fechas de la ficha.");
  }
  if (
    result.weight &&
    (!/^\d{1,3}([.,]\d{1,3})?$/.test(result.weight) ||
      Number(result.weight.replace(",", ".")) <= 0)
  )
    throw new Error("Indica un peso válido en kilogramos.");
  return result;
}
export function clinicalChanges(before, after, kind) {
  const fields = kind === "patient" ? patientFields : visitFields;
  return Object.entries(fields)
    .filter(([key]) => (before?.[key] || "") !== (after?.[key] || ""))
    .map(([key, [label]]) => ({
      label,
      before: before?.[key] || "",
      after: after?.[key] || "",
    }));
}
export function clinicalWrite(
  previous,
  values,
  actor,
  changeId,
  stamp,
  kind,
  recordId,
  note = "",
) {
  if (!actor?.uid || !actor.email)
    throw new Error("Ingresa con tu cuenta de administración.");
  const clean = normalizeClinical(kind, values);
  if (previous && !clinicalChanges(previous, clean, kind).length)
    throw new Error("No hay cambios para guardar.");
  const reason = note.trim();
  if (reason.length > 300 || (previous && reason.length < 5))
    throw new Error(
      "Indica brevemente el motivo de la modificación (al menos 5 caracteres).",
    );
  const after = {
    ...clean,
    createdAt: previous?.createdAt ?? stamp,
    createdBy: previous?.createdBy ?? actor.uid,
    updatedAt: stamp,
    updatedBy: actor.uid,
    updatedEmail: actor.email,
    revision: (previous?.revision || 0) + 1,
    lastChangeId: changeId,
  };
  const change = {
    recordType: kind,
    recordId,
    before: previous || null,
    after,
    reason,
    createdAt: stamp,
    actorUid: actor.uid,
    actorEmail: actor.email,
  };
  return { after, change };
}
export function clinicalTime(value) {
  const date = value?.toDate?.();
  if (!date) return "Fecha pendiente de confirmación";
  return (
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date) + " · hora de Chile"
  );
}
export function clinicalDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value.split("-").reverse().join("-")
    : "Sin fecha";
}
export function clinicalToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k).value)
    .join("-");
}
