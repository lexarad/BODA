/**
 * Seguiment pressupostos foto+vídeo — Boda Víctor & Victoria (Mas Sant Lleí, 15/05/2027)
 * Llegeix les respostes dels proveïdors al Gmail i actualitza la Google Sheet de seguiment.
 *
 * INSTAL·LACIÓ:
 *  1) Obre la fulla → Extensions → Apps Script i enganxa aquest codi.
 *  2) Executa "actualitzarSeguiment" un cop (autoritza Gmail + Fulls de càlcul).
 *  3) Executa "crearActivador" un cop perquè s'actualitzi sola cada hora.
 */
const ASSUMPTE = 'Mas Sant Lleí';            // text comú a l'assumpte dels correus enviats
const PRIMERA_FILA = 2;
const C = { EMAIL: 4, ESTAT: 9, PRESSUPOST: 11, DATA: 12, NOTES: 13 };

function actualitzarSeguiment() {
  const full = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const ultima = full.getLastRow();
  const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const tz = Session.getScriptTimeZone();

  for (let f = PRIMERA_FILA; f <= ultima; f++) {
    const email = String(full.getRange(f, C.EMAIL).getValue()).trim();
    if (!reEmail.test(email)) continue;                 // salta etiquetes/formularis
    const estat = String(full.getRange(f, C.ESTAT).getValue());
    if (/Descartat|Finalista/i.test(estat)) continue;    // respecta decisions manuals

    const fils = GmailApp.search('subject:("' + ASSUMPTE + '") (to:' + email + ' OR from:' + email + ')', 0, 5);
    if (fils.length === 0) continue;

    let resp = null;
    fils.forEach(fil => fil.getMessages().forEach(m => {
      if (m.getFrom().toLowerCase().indexOf(email.toLowerCase()) !== -1)
        if (!resp || m.getDate() > resp.getDate()) resp = m;
    }));

    if (resp) {
      full.getRange(f, C.ESTAT).setValue('💬 Resposta rebuda');
      if (!full.getRange(f, C.DATA).getValue())
        full.getRange(f, C.DATA).setValue(Utilities.formatDate(resp.getDate(), tz, 'dd/MM/yyyy'));
      const cos = resp.getPlainBody() || '';
      if (!full.getRange(f, C.NOTES).getValue())
        full.getRange(f, C.NOTES).setValue(cos.replace(/\s+/g, ' ').trim().substring(0, 250));
      if (!full.getRange(f, C.PRESSUPOST).getValue()) {
        const m = cos.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{3,5})\s*€|€\s*(\d{1,3}(?:[.\s]\d{3})+|\d{3,5})/);
        if (m) full.getRange(f, C.PRESSUPOST).setValue((m[1] || m[2]).replace(/\s/g, '') + ' €');
      }
    } else if (/enviar|esborrany/i.test(estat)) {
      full.getRange(f, C.ESTAT).setValue('📤 Enviat');
    }
  }
  SpreadsheetApp.getActiveSpreadsheet().toast('Seguiment actualitzat ✔');
}

function crearActivador() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'actualitzarSeguiment') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualitzarSeguiment').timeBased().everyHours(1).create();
  SpreadsheetApp.getActiveSpreadsheet().toast("Activador creat ✔ (s'actualitza cada hora)");
}
