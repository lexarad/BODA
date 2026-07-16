// Tests E2E del panell de seguiment (index.html) amb Playwright.
// La pàgina s'obre per file:// tal com la fan servir els usuaris.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

test.beforeEach(async ({ page }) => {
  // Estat buit EXPLÍCIT ('{}'): desactiva el seed de primera obertura perquè aquests
  // tests validen la mecànica del panell partint de zero. Condicional per no trepitjar
  // l'estat que un test desa i espera retrobar després d'un reload.
  await page.addInitScript(() => {
    if (localStorage.getItem('boda_vendor_tracking_v1') === null)
      localStorage.setItem('boda_vendor_tracking_v1', '{}');
  });
  await page.goto(PAGE);
});

test('carrega els 30 proveïdors i el tauler inicial', async ({ page }) => {
  await expect(page.locator('#tbody tr')).toHaveCount(30);
  await expect(page.locator('.stat.total .n')).toHaveText('30');
  await expect(page.locator('.stat.pend .n')).toHaveText('30');
  await expect(page.locator('.stat.sent .n')).toHaveText('0');
  await expect(page.locator('#statMin .n')).toHaveText('—');
  await expect(page.locator('#statAvg .n')).toHaveText('—');
});

test("sense edicions no mostra cap marca d'última edició", async ({ page }) => {
  await expect(page.locator('#updated')).toHaveText('');
});

test("l'estat editat persisteix després de recarregar i marca l'última edició", async ({ page }) => {
  const sel = page.locator('#tbody tr[data-id="v01"] select[data-f="status"]');
  await sel.selectOption('sent');
  await expect(page.locator('.stat.sent .n')).toHaveText('1');
  await expect(page.locator('#updated')).toContainText('Última edició');

  await page.reload();
  await expect(page.locator('#tbody tr[data-id="v01"] select[data-f="status"]')).toHaveValue('sent');
  await expect(page.locator('.stat.sent .n')).toHaveText('1');
  await expect(page.locator('#updated')).toContainText('Última edició');
});

test('els pressupostos alimenten "Millor preu" i "Preu mitjà" (i ignoren descartats)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('2.500 €');
  await page.locator('#tbody tr[data-id="v02"] input.quote').fill('3000');
  await expect(page.locator('#statMin .n')).toHaveText('2.500 €');
  await expect(page.locator('#statAvg .n')).toHaveText('2.750 €');

  // Un proveïdor descartat no compta per a les estadístiques de preu
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('drop');
  await expect(page.locator('#statMin .n')).toHaveText('3.000 €');
});

test('filtres per tipus i estat, i cerca', async ({ page }) => {
  await page.locator('#filterType').selectOption('Vídeo');
  await expect(page.locator('#tbody tr:visible')).toHaveCount(4);

  await page.locator('#filterType').selectOption('');
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('sent');
  await page.locator('#filterStatus').selectOption('sent');
  await expect(page.locator('#tbody tr:visible')).toHaveCount(1);
  await expect(page.locator('#tbody tr:visible .who')).toHaveText('David Griso');

  await page.locator('#filterStatus').selectOption('');
  await page.locator('#search').fill('Gribodó');
  await expect(page.locator('#tbody tr:visible')).toHaveCount(1);
  await expect(page.locator('#tbody tr:visible .who')).toHaveText('Fran Gribodó');
});

test('ordena per preu (més barat primer, sense preu al final)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v05"] input.quote').fill('4.000');
  await page.locator('#tbody tr[data-id="v10"] input.quote').fill('1.800 €');
  await page.locator('#sortBy').selectOption('quote');

  const noms = page.locator('#tbody tr .who');
  await expect(noms.first()).toHaveText('PlayFiction');
  await expect(noms.nth(1)).toHaveText('Carles Figuerola');
  // La numeració original es conserva encara que canviï l'ordre
  await expect(page.locator('#tbody tr').first().locator('td').first()).toHaveText('10');
});

test('exporta un JSON amb l\'estat i el reimporta', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v03"] select[data-f="status"]').selectOption('fav');
  await page.locator('#tbody tr[data-id="v03"] input.quote').fill('2900');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportBtn'),
  ]);
  expect(download.suggestedFilename()).toBe('seguiment-pressupostos-boda.json');
  const contingut = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(contingut.state.v03.status).toBe('fav');
  expect(contingut.state.v03.quote).toBe('2900');
  expect(contingut.savedAt).toBeTruthy();

  // Reimporta en una pàgina neta i comprova que restaura l'estat
  const fitxer = path.join(os.tmpdir(), 'boda-import-test.json');
  fs.writeFileSync(fitxer, JSON.stringify(contingut));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#tbody tr[data-id="v03"] select[data-f="status"]')).toHaveValue('pend');

  page.once('dialog', d => d.accept());
  await page.locator('#importFile').setInputFiles(fitxer);
  await expect(page.locator('#tbody tr[data-id="v03"] select[data-f="status"]')).toHaveValue('fav');
  await expect(page.locator('#tbody tr[data-id="v03"] input.quote')).toHaveValue('2900');
});

test('el cicle exportar→importar funciona també sense cap edició prèvia', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportBtn'),
  ]);
  const fitxer = path.join(os.tmpdir(), 'boda-export-pristi.json');
  fs.copyFileSync(await download.path(), fitxer);

  const missatges = [];
  page.on('dialog', d => { missatges.push(d.message()); d.accept(); });
  await page.locator('#importFile').setInputFiles(fitxer);
  await expect.poll(() => missatges.length).toBeGreaterThanOrEqual(2);
  expect(missatges[0]).toContain('substituirà');           // confirmació prèvia
  expect(missatges.some(m => m.includes('importades'))).toBe(true);
  await expect(page.locator('.stat.pend .n')).toHaveText('30');
});

test("cancel·lar la confirmació d'importació NO toca l'estat local", async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('2222');
  const fitxer = path.join(os.tmpdir(), 'boda-import-cancel.json');
  fs.writeFileSync(fitxer, JSON.stringify({ state: { v02: { status: 'fav', pack: '', quote: '9', notes: '' } } }));

  let dialegs = 0;
  page.on('dialog', d => { dialegs++; d.dismiss(); });
  await page.locator('#importFile').setInputFiles(fitxer);
  await expect.poll(() => dialegs).toBeGreaterThanOrEqual(1);   // la confirmació ja ha sortit
  // Sense confirmació, res no canvia: ni v02 importat ni v01 esborrat.
  await expect(page.locator('#tbody tr[data-id="v02"] select[data-f="status"]')).toHaveValue('pend');
  await expect(page.locator('#tbody tr[data-id="v01"] input.quote')).toHaveValue('2222');
});

test('importar substitueix del tot l\'estat editat anteriorment', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('sent');
  const fitxer = path.join(os.tmpdir(), 'boda-import-replace.json');
  fs.writeFileSync(fitxer, JSON.stringify({ state: { v02: { status: 'fav', pack: 'Sí', quote: '2800', notes: '' } } }));

  page.once('dialog', d => d.accept());
  await page.locator('#importFile').setInputFiles(fitxer);
  await expect(page.locator('#tbody tr[data-id="v01"] select[data-f="status"]')).toHaveValue('pend');
  await expect(page.locator('#tbody tr[data-id="v02"] select[data-f="status"]')).toHaveValue('fav');
  await expect(page.locator('.stat.sent .n')).toHaveText('0');
});

test('ordena per estat (finalistes primer, descartats al final)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v05"] select[data-f="status"]').selectOption('fav');
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('drop');
  await page.locator('#sortBy').selectOption('status');
  await expect(page.locator('#tbody tr .who').first()).toHaveText('Carles Figuerola');
  await expect(page.locator('#tbody tr .who').last()).toHaveText('David Griso');
});

test('els filtres es componen (tipus + estat + cerca alhora)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v04"] select[data-f="status"]').selectOption('sent'); // Audiovisuart (Ambdós)
  await page.locator('#tbody tr[data-id="v06"] select[data-f="status"]').selectOption('sent'); // The Camera Obscura (Ambdós)
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('sent'); // David Griso (Foto)
  await page.locator('#filterType').selectOption('Ambdós');
  await page.locator('#filterStatus').selectOption('sent');
  await expect(page.locator('#tbody tr:visible')).toHaveCount(2);
  await page.locator('#search').fill('Audiovisuart');
  await expect(page.locator('#tbody tr:visible')).toHaveCount(1);
  await expect(page.locator('#tbody tr:visible .who')).toHaveText('Audiovisuart');
});

test('els comptadors agregats "Amb resposta" i "Pressupost rebut" sumen bé', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('resp');
  await page.locator('#tbody tr[data-id="v02"] select[data-f="status"]').selectOption('quote');
  await page.locator('#tbody tr[data-id="v03"] select[data-f="status"]').selectOption('fav');
  await expect(page.locator('.stat.resp .n')).toHaveText('3');   // resp + quote + fav
  await expect(page.locator('.stat.quote .n')).toHaveText('2');  // quote + fav
  await expect(page.locator('.stat.fav .n')).toHaveText('1');
});

test('un pressupost amb punt decimal no es corromp (2500.50 ≠ 250.050)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('2500.50');
  await expect(page.locator('#statMin .n')).toHaveText('2.501 €');
});

test('el CSV neutralitza cel·les que comencen per "=" (injecció de fórmules)', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] textarea.notes').fill('=HYPERLINK("http://evil","clic")');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#csvBtn'),
  ]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv).not.toMatch(/;=HYPERLINK/);
  expect(csv).toContain("'=HYPERLINK");
});

test('rebutja un fitxer d\'importació no vàlid', async ({ page }) => {
  const fitxer = path.join(os.tmpdir(), 'boda-import-invalid.json');
  fs.writeFileSync(fitxer, JSON.stringify({ res: 'a veure' }));

  const missatge = new Promise(resolve => page.once('dialog', d => { resolve(d.message()); d.accept(); }));
  await page.locator('#importFile').setInputFiles(fitxer);
  expect(await missatge).toContain('Fitxer no vàlid');
});

test('la importació saneja estats desconeguts i ids que no existeixen', async ({ page }) => {
  const fitxer = path.join(os.tmpdir(), 'boda-import-sanitize.json');
  fs.writeFileSync(fitxer, JSON.stringify({
    state: {
      v01: { status: 'inventat', pack: 'Sí', quote: 1500, notes: 'ok' },
      intrus: { status: 'drop' },
    },
  }));

  page.once('dialog', d => d.accept());
  await page.locator('#importFile').setInputFiles(fitxer);
  await expect(page.locator('#tbody tr[data-id="v01"] select[data-f="status"]')).toHaveValue('pend');
  await expect(page.locator('#tbody tr[data-id="v01"] input.quote')).toHaveValue('1500');
  const raw = await page.evaluate(() => localStorage.getItem('boda_vendor_tracking_v1'));
  expect(JSON.parse(raw)).not.toHaveProperty('intrus');
});

test('les notes amb HTML queden inertes (sense XSS)', async ({ page }) => {
  const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</scr' + 'ipt>';
  await page.locator('#tbody tr[data-id="v01"] textarea.notes').fill(payload);
  await page.reload();
  await expect(page.locator('#tbody tr[data-id="v01"] textarea.notes')).toHaveValue(payload);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('exporta un CSV amb BOM, capçalera i els 30 proveïdors', async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('2.500 €');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#csvBtn'),
  ]);
  expect(download.suggestedFilename()).toBe('seguiment-pressupostos-boda.csv');
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const linies = csv.slice(1).split('\r\n');
  expect(linies[0]).toBe('#;Proveïdor;Tipus;Ciutat;Email;Web;Telèfon;Idioma;Estat;Pack foto+vídeo;Pressupost;Notes');
  expect(linies).toHaveLength(31);
  expect(linies[1]).toContain('David Griso');
  expect(linies[1]).toContain('2.500 €');
});

test("els estats que escriu l'Apps Script coincideixen amb els del CSV del panell", async ({ page }) => {
  const gs = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script', 'seguiment-boda.gs'), 'utf8');
  // Estats que el .gs escriu a la columna "Estat" de la Google Sheet.
  const escrits = [...gs.matchAll(/'([^'\n]*(?:Enviat|Resposta rebuda|Pressupost rebut)[^'\n]*)'/g)].map(m => m[1]);
  expect(escrits.length).toBeGreaterThan(0);

  // Estats que exporta el botó CSV (sense l'emoji, com fa el panell).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#csvBtn'),
  ]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  const estatsCsv = new Set(csv.slice(1).split('\r\n').slice(1).filter(Boolean).map(l => l.split(';')[8]));
  const legals = ['Esborrany / per enviar', 'Enviat', 'Resposta rebuda', 'Pressupost rebut', 'Finalista', 'Descartat'];
  for (const e of estatsCsv) expect(legals).toContain(e);
  // Si el .gs escrivís variants pròpies (p. ex. amb emoji), la Sheet acabaria amb dos
  // valors diferents per al mateix estat i els filtres es trencarien.
  for (const e of escrits) expect(legals).toContain(e);
});

test('parseQuote entén rangs, IVA, recomptes i decimals com els escriu la gent', async ({ page }) => {
  const casos = await page.evaluate(() => [
    ['2500-3000', 2500],            // rang → extrem baix
    ['1900–2100', 1900],            // rang amb guió llarg
    ['IVA 21%, total 1950€', 1950], // el % no és el preu
    ['2 fotògrafs 2500€', 2500],    // el recompte no és el preu
    ['1 àlbum + 1900', 1900],       // sense €: mana el número gran
    ['1.395 € + IVA', 1395],
    ['1.500,50', 1500.5],           // coma decimal espanyola
    ['2.500 €', 2500],
    ['2500.50', 2500.5],
    ['res a veure', null],
  ].map(([txt, esperat]) => [txt, esperat, parseQuote(txt)]));
  for (const [txt, esperat, obtingut] of casos) expect(obtingut, `parseQuote(${JSON.stringify(txt)})`).toBe(esperat);
});

test("editar el preu (o l'estat) amb l'ordenació activa reordena la llista en sortir del camp", async ({ page }) => {
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('3000');
  await page.locator('#tbody tr[data-id="v02"] input.quote').fill('1000');
  await page.locator('#sortBy').selectOption('quote');
  await expect(page.locator('#tbody tr[data-id]').first()).toHaveAttribute('data-id', 'v02');

  // Corregim el preu de v01 per sota de v02: en perdre el focus, ha de pujar al capdamunt.
  await page.locator('#tbody tr[data-id="v01"] input.quote').fill('500');
  await page.locator('#tbody tr[data-id="v01"] input.quote').blur();
  await expect(page.locator('#tbody tr[data-id]').first()).toHaveAttribute('data-id', 'v01');

  // El mateix amb l'estat: marcar un finalista amb ordre per estat el puja a dalt.
  await page.locator('#sortBy').selectOption('status');
  await page.locator('#tbody tr[data-id="v07"] select[data-f="status"]').selectOption('fav');
  await expect(page.locator('#tbody tr[data-id]').first()).toHaveAttribute('data-id', 'v07');
});

test('un filtre sense resultats mostra un missatge en lloc d\'una taula buida', async ({ page }) => {
  await page.locator('#filterStatus').selectOption('fav');   // encara no hi ha finalistes
  await expect(page.locator('#noresults')).toBeVisible();
  await expect(page.locator('#noresults')).toContainText('Cap proveïdor');

  await page.locator('#filterStatus').selectOption('');
  await expect(page.locator('#noresults')).toHaveCount(0);
});

test('el CSV exporta les 6 etiquetes d\'estat exactes (sense emoji ni text partit)', async ({ page }) => {
  const estats = ['sent', 'resp', 'quote', 'fav', 'drop'];
  for (let i = 0; i < estats.length; i++)
    await page.locator(`#tbody tr[data-id="v0${i + 2}"] select[data-f="status"]`).selectOption(estats[i]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#csvBtn'),
  ]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  const columna = new Set(csv.slice(1).split('\r\n').slice(1).filter(Boolean).map(l => l.split(';')[8]));
  expect([...columna].sort()).toEqual(
    ['Descartat', 'Enviat', 'Esborrany / per enviar', 'Finalista', 'Pressupost rebut', 'Resposta rebuda']);
});

test("primera obertura sense res desat: arrenca amb l'estat real del seguiment (seed)", async ({ browser }) => {
  const ctx = await browser.newContext();   // contexte net, sense l'estat buit del beforeEach
  const p = await ctx.newPage();
  await p.goto(PAGE);

  // Recomptes de la fulla de seguiment del 16/07/2026: 8 enviats, 22 respostes
  // (11 esperant decisió + 6 amb preu + 5 no disponibles), cap per enviar.
  await expect(p.locator('.stat.pend .n')).toHaveText('0');
  await expect(p.locator('.stat.sent .n')).toHaveText('8');
  await expect(p.locator('.stat.resp .n')).toHaveText('17');   // amb resposta = resp+quote+fav
  await expect(p.locator('.stat.quote .n')).toHaveText('6');
  await expect(p.locator('.stat.drop .n')).toHaveText('5');
  await expect(p.locator('#statMin .n')).toHaveText('1.395 €'); // Wabisabi, "des de 1.395 € + IVA"

  // Les edicions posteriors persisteixen per sobre del seed.
  await p.locator('#tbody tr[data-id="v01"] select[data-f="status"]').selectOption('fav');
  await p.reload();
  await expect(p.locator('#tbody tr[data-id="v01"] select[data-f="status"]')).toHaveValue('fav');
  await ctx.close();
});
