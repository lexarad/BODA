// Tests E2E del panell de seguiment (index.html) amb Playwright.
// La pàgina s'obre per file:// tal com la fan servir els usuaris.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

test.beforeEach(async ({ page }) => {
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

  const missatge = new Promise(resolve => page.once('dialog', d => { resolve(d.message()); d.accept(); }));
  await page.locator('#importFile').setInputFiles(fitxer);
  expect(await missatge).toContain('importades');
  await expect(page.locator('.stat.pend .n')).toHaveText('30');
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
