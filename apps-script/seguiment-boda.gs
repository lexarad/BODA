/**
 * Seguiment pressupostos foto+vídeo — Boda Víctor & Victoria (Mas Sant Lleí, 15/05/2027)
 * Llegeix les respostes dels proveïdors al Gmail i actualitza la Google Sheet de seguiment.
 *
 * INSTAL·LACIÓ:
 *  1) Obre el full de càlcul → Extensions → Apps Script i enganxa aquest codi.
 *  2) Executa "actualitzarSeguiment" un cop (autoritza Gmail + Fulls de càlcul).
 *  3) Executa "crearActivador" un cop perquè s'actualitzi sol cada hora.
 *
 * El full ha de tenir una fila de capçaleres (fila 1) amb, com a mínim, les columnes
 * "Email", "Estat", "Pressupost" i "Notes" — el mateix format que genera el botó CSV
 * del panell (index.html). La columna "Data resposta" es crea sola si no existeix.
 */
const ASSUMPTE = 'Mas Sant Lleí';            // text comú a l'assumpte dels correus enviats
const PRIMERA_FILA = 2;
const MAX_NOTES = 250;

/** Localitza les columnes pel text de la capçalera (robust davant reordenacions). */
function trobaColumnes_(full) {
  const cap = full.getRange(1, 1, 1, Math.max(full.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).toLowerCase(); });
  const busca = function (re) {
    for (let i = 0; i < cap.length; i++) if (re.test(cap[i])) return i + 1;
    return 0;
  };
  const cols = {
    EMAIL: busca(/email|correu/),
    ESTAT: busca(/estat|estado/),
    PRESSUPOST: busca(/pressupost|presupuesto/),
    NOTES: busca(/notes|notas/),
    DATA: busca(/data|fecha/),
  };
  if (!cols.EMAIL || !cols.ESTAT) {
    throw new Error('No trobo les columnes "Email" i "Estat" a la fila 1. ' +
      'Enganxa la capçalera del CSV del panell abans d\'executar el script.');
  }
  if (!cols.DATA) {
    cols.DATA = full.getLastColumn() + 1;
    full.getRange(1, cols.DATA).setValue('Data resposta');
  }
  return cols;
}

/** Escriu text pla forçat (mai fórmules), per neutralitzar cossos de correu maliciosos. */
function escriuText_(full, fila, col, valor) {
  const s = String(valor);
  full.getRange(fila, col).setValue(/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
}

function actualitzarSeguiment() {
  const full = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const ultima = full.getLastRow();
  if (ultima < PRIMERA_FILA) return;

  const C = trobaColumnes_(full);

  // Una sola lectura per lots de tota la taula (en lloc d'una crida per cel·la).
  const nCols = Math.max(C.EMAIL, C.ESTAT, C.PRESSUPOST || 0, C.DATA, C.NOTES || 0);
  const dades = full.getRange(PRIMERA_FILA, 1, ultima - PRIMERA_FILA + 1, nCols).getValues();

  const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const tz = Session.getScriptTimeZone();
  let canvis = 0, errors = 0;

  dades.forEach(function (fila, idx) {
    try {
      const email = String(fila[C.EMAIL - 1]).trim();
      if (!reEmail.test(email)) return;                 // salta etiquetes/formularis
      const estat = String(fila[C.ESTAT - 1]);
      if (/Descartat|Finalista/i.test(estat)) return;    // respecta decisions manuals

      const fils = GmailApp.search('subject:("' + ASSUMPTE + '") (to:' + email + ' OR from:' + email + ')', 0, 5);
      if (fils.length === 0) return;

      let resp = null;       // últim missatge rebut DEL proveïdor
      let enviat = false;    // hem enviat (no esborrany) algun correu del fil
      fils.forEach(function (fil) {
        fil.getMessages().forEach(function (m) {
          const esDelProveidor = m.getFrom().toLowerCase().indexOf(email.toLowerCase()) !== -1;
          if (esDelProveidor) {
            if (!resp || m.getDate() > resp.getDate()) resp = m;
          } else if (!m.isDraft()) {
            enviat = true;
          }
        });
      });

      const setCell = function (col, valor) {
        full.getRange(PRIMERA_FILA + idx, col).setValue(valor);
        canvis++;
      };

      if (resp) {
        const cos = resp.getPlainBody() || '';
        const preu = extreuPreu(cos);
        if (preu && C.PRESSUPOST && !fila[C.PRESSUPOST - 1]) setCell(C.PRESSUPOST, preu);

        // Si hi ha preu (nou o ja anotat) puja a "Pressupost rebut"; si no, "Resposta rebuda".
        // Mai degrada un estat de pressupost ja assolit.
        const tePreu = Boolean(preu || (C.PRESSUPOST && fila[C.PRESSUPOST - 1]));
        const nouEstat = tePreu ? 'Pressupost rebut' : 'Resposta rebuda';
        if (estat !== nouEstat && !(nouEstat === 'Resposta rebuda' && /Pressupost/i.test(estat)))
          setCell(C.ESTAT, nouEstat);

        if (!fila[C.DATA - 1])
          setCell(C.DATA, Utilities.formatDate(resp.getDate(), tz, 'dd/MM/yyyy'));

        if (C.NOTES && !fila[C.NOTES - 1]) {
          const resum = cos.replace(/\s+/g, ' ').trim().substring(0, MAX_NOTES);
          if (resum) { escriuText_(full, PRIMERA_FILA + idx, C.NOTES, resum); canvis++; }
        }
      } else if (enviat && /enviar|esborrany/i.test(estat)) {
        // Només si hi ha un correu realment enviat (els esborranys no compten).
        setCell(C.ESTAT, 'Enviat');
      }
    } catch (e) {
      errors++;
      console.error('Fila ' + (PRIMERA_FILA + idx) + ': ' + e);
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Seguiment actualitzat ✔ (' + canvis + ' canvis' + (errors ? ', ' + errors + ' errors — mira el registre' : '') + ')');
}

/**
 * Troba el primer import en euros PLAUSIBLE del text (entre 100 i 100.000 €):
 * "2.500 €", "€1500", "1.500,50 EUR", "1500 euros", "500€"…
 * Ignora imports petits previs (senyals, suplements: "50 € de pàrquing… total 1.800 €").
 * Retorna '' si no n'hi ha cap.
 */
function extreuPreu(text) {
  const re = /(?:€|\beur(?:os?)?\b)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?!\d)|(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:€|eur(?:os?)?\b)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat((m[1] || m[2]).replace(/[.\s]/g, '').replace(',', '.'));
    if (isFinite(n) && n >= 100 && n <= 100000)
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  }
  return '';
}

function crearActivador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualitzarSeguiment') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualitzarSeguiment').timeBased().everyHours(1).create();
  SpreadsheetApp.getActiveSpreadsheet().toast("Activador creat ✔ (s'actualitza sol cada hora)");
}
