# Seguiment de pressupostos · Foto i Vídeo · Boda Víctor & Victoria

Panell de seguiment de les peticions de pressupost a **fotògrafs i videògrafs** per a la boda del **15 de maig de 2027** a **Mas Sant Lleí**.

## Com obrir-lo

Obre el fitxer **`index.html`** al navegador (doble clic, o arrossega'l a una pestanya). Funciona sense connexió i tot el seguiment es desa al teu navegador.

> Els canvis (estat, pressupost, notes) es desen amb `localStorage` **en aquest dispositiu**. Per compartir l'estat entre la Victoria i en Víctor, useu els botons **Exportar / Importar** (un fitxer `.json`).

## Què inclou

- **30 peticions** preparades com a **esborranys a Gmail** de `victorhh888@gmail.com`, amb `victoriaguinovart@gmail.com` en còpia (CC). Cada correu és **individual i personalitzat** (en català o castellà segons el proveïdor) i pregunta primer si ofereixen **pack de foto + vídeo**. Només cal obrir-los, revisar-los i clicar «Enviar».
- **Alternatives en reserva**: proveïdors verificats que no estan entre els 30 esborranys.
- **Sense email públic**: contactes que només tenen formulari web (inclòs **Joan Cabes**, recomanat per la finca).

## Funcions del panell

- **Tauler de resum**: proveïdors per estat, i estadístiques de preu en directe (**millor preu** i **preu mitjà**, ignorant els descartats).
- **Cerca, filtres i ordenació**: per tipus, per estat, per nom o **per preu (més barat primer)**. La numeració original de cada proveïdor es conserva encara que canviï l'ordre.
- **Enllaç directe a Gmail** per a cada proveïdor: obre la cerca del seu fil de correu amb un clic.
- **Exportar / Importar** l'estat en JSON (amb validació: el fitxer es comprova i se saneja abans d'aplicar-lo).
- **Exportar CSV** llest per enganxar a Google Sheets o Excel (separador `;`, codificació compatible).
- **Mode fosc automàtic** segons la configuració del sistema, disseny responsive per a mòbil i versió imprimible.

## Sincronització automàtica amb Gmail (opcional)

El fitxer `apps-script/seguiment-boda.gs` és un **Google Apps Script** que, enganxat a un full de càlcul de Google creat a partir del CSV del panell, llegeix les respostes dels proveïdors al Gmail cada hora i hi anota estat, data, pressupost detectat i un resum de la resposta. Les instruccions d'instal·lació són a la capçalera del fitxer. Troba les columnes **pel nom de la capçalera** (robust si en canvieu l'ordre), llegeix el full **en una sola crida**, escriu només les cel·les que canvien, no marca mai un esborrany com a enviat i mai no toca files marcades com a **Finalista** o **Descartat**.

## Tests

El panell té una suite de tests end-to-end amb [Playwright](https://playwright.dev/) que cobreix la persistència, els filtres, l'ordenació, les estadístiques, l'exportació/importació i la seguretat (XSS). Per executar-los:

```bash
npm ci
npx playwright install chromium   # només el primer cop
npm test
```

Els tests també s'executen automàticament a GitHub Actions a cada pull request.

## Els 30 proveïdors contactats

Recomanats per Mas Sant Lleí (★): David Griso, Escarlata Blanco, Fran Gribodó, Audiovisuart, Carles Figuerola.

Foto + Vídeo (pack): The Camera Obscura, Keig Studio, Inlove Studio, Super Weddings, PlayFiction, All You Need Is Love Films, La Vie en Film, Basilico Studio, Igloo, The Visual Tales, El Fotograma, Valued Story, Sunnydays, Wabisabi, T Beat Creative, MS Fotografía, Camacho Fotògrafs, Audiovisuart.

Vídeo: Carlos Félix Weddings, Mireia Llum Films, Jaume Casals Films, Vitott Produccions.

Foto: David Griso, Escarlata Blanco, Fran Gribodó, Carles Figuerola, Juanjo Vega, DQfoto, Marga Martí, Blanco y Caramelo.
