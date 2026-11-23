# CodexAnim — CIMG v0.4

Codice ottico **animato a 16 colori** per trasferire file, senza Wi-Fi né Bluetooth, da un monitor Windows alla fotocamera Android. Prototipo sperimentale offline.

## v0.4 — cornice fissa con bit di controllo dei fotogrammi

La geometria del quadrato rimane **completamente statica**. Ogni passaggio dati cambia
i **16 colori dei quadratini interni**: questi rappresentano i byte del file. La
cornice di controllo esterna cambia fra due colori: **ciano = 0**, **magenta = 1**.
Non ci sono swirl, deformazioni o zoom: i pixel rappresentano informazioni vere.

La codifica ottica CIMG v1 della matrice e il bordo nero di riferimento restano
invariati per la compatibilità con gli scanner precedenti. Il nuovo contorno usa
una griglia complessiva di **(N+10)×(N+10)** moduli, con finder nero a distanza
di 4 moduli dalla cornice esterna e dati **N×N** dentro.

I primi **96 bit** del contorno codificano 12 byte (bit più significativo prima):

| Byte | Campo | Funzione |
|---|---|---|
| 0 | 0xC7 | sincronizzazione |
| 1 | 0x40 OR flags | protocollo + START/END |
| 2–5 | sessionId uint32 | identificatore della trasmissione |
| 6–7 | sequence uint16 | numero del frammento, da zero |
| 8–9 | count uint16 | totale frammenti |
| 10–11 | CRC16 CCITT-FALSE | verifica dell'intestazione di controllo |

Le celle aggiuntive del contorno ripetono ciclicamente i 96 bit per avere
ridondanza visiva. La **sezione dati non cambia**: continua a utilizzare il CRC32
e il vecchio protocollo CIMG, quindi i file `.cimg` precedenti restano leggibili.

### Aggancio e scanner veloce

Dopo un'acquisizione riuscita, lo scanner mantiene la **regione di interesse (ROI)**,
la griglia e l'orientamento. Prima di riprocessare le migliaia di celle del
fotogramma successivo, può leggere soltanto la cornice (96 bit) e
**saltare subito i duplicati già ricevuti**. In caso di spostamento del quadrato
ricerca nuovamente la cornice nera sull'immagine. Il CRC16 della cornice
non sostituisce il CRC32 dei dati; un frammento non viene mai accettato sulla
sola base dei bit di controllo.

Nel generatore seleziona **Cornice di controllo v0.4**, GIF 30 FPS e
**Ripetizioni temporali 10×** per tenere ciascun payload visibile ~333 ms.
La versione dimostrativa usa 24×24, 12 ripetizioni, 30 FPS e 3 frame utili
per trasmettere uno SVG da 1801 byte. I file possono essere ricostruiti
grazie alle parti della matrice, non tramite la GIF compressa in sé.

Limiti: la cornice richiede orientamento e un campionamento abbastanza preciso
per leggere il CRC16. Il tracking ROI accelera le letture a posizione stabile
ma non corregge prospettiva importante, riflessi o rolling shutter. Le prove
software non garantiscono il funzionamento su ogni fotocamera reale.

## v0.3 — fotogrammi rumorosi e GIF a 30 FPS con tenuta temporale

**Diagnostica reale:** 1/202 frame validi, 369 intestazioni rilevate e CRC errati
quando il file era mostrato a 30 FPS senza ripetizione. La camera trova il
codice, ma i fotogrammi cambiano troppo presto e producono letture miste.

- **Recupero temporale:** il decoder raccoglie più copie CRC-errate di uno stesso
  frammento con intestazione valida; vota sui byte, ma **accetta soltanto**
  se il CRC32 originale del frammento torna corretto. Questo non è FEC di
  erasure e non può ricostruire frammenti mai osservati.
- **Nuovo export GIF**: scegli 30 FPS e ripetizioni temporali 10×. La GIF ha
  ~30 frame GIF al secondo, ma cambia **il codice dati ~3 volte al secondo**.
  Le ripetizioni sono GIF transparenti 1×1 e non ricomprimono la matrice.
- Il player sul monitor applica lo stesso parametro ripetizioni.
- L'app mostra **CRC riparati** e **pacchetti in memoria** nella diagnostica.

**Consiglio pratico:** 56×56, immagine almeno 768×768, FPS 30 e ripetizioni
10×. Mantieni il monitor a pieno schermo e il telefono perpendicolare. Se
molti pacchetti sono ancora errati, usa 32×32 o 40×40 e 2–3 FPS.

La dicitura `Oltre 10.000 fotogrammi` è un limite del generatore per file
troppo grandi nella griglia selezionata: non è un errore del decoder/scanner.

## v0.2 — correzione scanner e diagnostica (23 novembre 2026)

La v0.1 poteva ignorare la matrice quando occupava meno del 25% dell'immagine della fotocamera.
La v0.2 usa soglie adattive più piccole, prova più posizioni della cornice, piccole correzioni geometriche e supporta immagini con esposizione alterata. Sono stati aggiunti test di regressione per codici da 120px in un video 800×600.

Nella scheda **Scansiona** sono ora disponibili:
- conteggio letture, cornici riconosciute, intestazioni e CRC, nuovi frammenti e ripetizioni;
- **Salva fotogramma** (fotografia della camera in PNG, utile per il debug);
- **Esporta debug.log** (diagnostica tecnica senza includere registrazioni video);
- **Test immagine** per provare singoli PNG/JPG direttamente dal dispositivo;
- indicazione del numero di frammenti mancanti.

Per il primo test apri su Windows `CodexAnim_TEST_1_FOTOGRAMMA.png` e inquadralo con l'APK: contiene tutto il file di testo in un solo frame. Dopo, prova la GIF di 3 frame e infine un tuo file.

**Aggiornamento Android:** le APK debug di diverse esecuzioni GitHub Actions possono essere firmate con chiavi differenti. Se Android segnala un conflitto o un'app non installabile, **disinstalla CodexAnim precedente** e installa l'APK nuova. La v0.2 ha versionCode 2, ma questo non risolve un cambio della chiave di firma.


## Installa e prova

**APK:** apri [GitHub Actions](https://github.com/Frak89/CodexAnim/actions/workflows/android.yml), scegli l'ultima esecuzione **verde** e scarica l'artefatto **CodexAnim-debug-APK**. All'interno trovi `app-debug.apk`.

**Windows:** scarica la repository, apri `Start_CodexAnim_Windows.bat` (Python 3) oppure apri direttamente `app/src/main/assets/index.html` con Chrome. Il browser e l'APK usano lo **stesso codec JavaScript**, senza CDN.

1. Su Windows seleziona un file, scegli dimensioni immagine, FPS e durata di riferimento; **Auto ottimizza** sceglie una matrice adatta al numero di pixel e alla dimensione compressa.
2. Premi **Prepara sequenza → Riproduci**. Il codice è ripetuto automaticamente; in alternativa esporta GIF, PNG singolo frame, WebM (browser compatibili) o il file nativo `.cimg`.
3. Sul telefono: **Scansiona → Avvia fotocamera**, inquadra frontalmente il codice. Lo scanner riconosce i pacchetti e ricostruisce parti mancanti nei cicli successivi.
4. Al 100%, premi **Salva file ricostruito**. Vengono verificati CRC32 di ogni frammento e dello stream.

Consigli iniziali: **32×32, 512×512 px e 2–3 FPS**; tieni il telefono fermo e il monitor ben illuminato.

## Capacità ottica (teorica)

16 colori = 4 bit per cella. Ogni fotogramma ha 16 celle per la calibrazione dei colori, 34 byte di intestazione, un codice di sessione, indice, quantità di frammenti e due CRC32. La capacità dati per fotogramma è:

```
floor((N * N - 16) / 2) - 34 byte
```

| Griglia | Byte utili/frame | KiB in 60 s a 3 FPS |
|---|---:|---:|
| 16×16 | 86 | 15.1 |
| 24×24 | 246 | 43.2 |
| 32×32 | 470 | 82.6 |
| 48×48 | 1110 | 195.1 |
| 64×64 | 2006 | 352.6 |
| 96×96 | 4566 | 802.6 |

I valori escludono perdite di fotogrammi, cicli ripetuti e overhead del file compresso. **Aumentare i pixel dell'immagine non aumenta automaticamente i bit per frame**: bisogna aumentare N, riducendo la leggibilità della matrice a distanza. La stima della UI si basa sulle impostazioni scelte.

## Formato .cimg

Il file `.cimg` **non è una GIF**: contiene il payload originale compresso e i metadati per rigenerare l'animazione.

```
5 bytes ASCII "CIMG1"
uint32 big endian metadataLength
uint32 big endian streamLength
UTF-8 JSON {version,filename,mime,grid,width,height,fps,streamCrc32}
stream: zlib deflate di:
  4 bytes ASCII "CIF1"
  uint16 filename UTF8 length
  uint16 MIME UTF8 length
  uint32 original file length
  UTF8 filename, UTF8 MIME, original file bytes
```

La trasmissione del file .cimg usa fotogrammi `CODE_START` (bit 0), `DATA`, `CODE_END` (bit 1). Ogni fotogramma ha le celle della matrice `N×N`, precedute da quiet zone bianca di 2 moduli e bordo nero di 1 modulo. I primi 16 simboli sono sempre la palette di calibrazione.

### Header ottico di 34 byte

| Offset | Byte | Dato |
|---:|---:|---|
| 0 | 4 | Magic `CIMG` |
| 4 | 1 | Protocollo 1 |
| 5 | 1 | Flags START=1, END=2 |
| 6 | 1 | N (matrice) |
| 7 | 1 | riservato |
| 8 | 4 | session ID |
| 12 | 4 | indice 0-based |
| 16 | 4 | numero fotogrammi |
| 20 | 4 | lunghezza stream |
| 24 | 2 | lunghezza frammento |
| 26 | 4 | CRC32 stream |
| 30 | 4 | CRC32 frammento |

Un byte è rappresentato da due celle, nibble alto prima, basso dopo. `codec.js` è la specifica eseguibile del formato.

## Compilazione Android

GitHub Actions usa JDK 17 + Gradle 8.9 + Android Gradle Plugin 8.7.3 e carica automaticamente il debug APK nella sezione Artifacts.

```bash
node --test tests/protocol.test.cjs
gradle :app:assembleDebug
```

APK locale: `app/build/outputs/apk/debug/app-debug.apk`.

## Limiti della prima versione

- Lo scanner è progettato per una **ripresa quasi frontale** di uno schermo, non per prospettive oblique marcate.
- GIF max **240 frame** e max **45 megapixel-fotogramma**. Per file più grandi riproduci sullo schermo o salva `.cimg`.
- Alcune funzionalità WebM e schermo intero possono dipendere dal browser o dal WebView.
- I dati possono essere suddivisi in molti frammenti, ma **MB di trasmissione ottica possono richiedere minuti o ore**, soprattutto con griglie leggibili e velocità moderate.
- CRC32 rileva errori accidentali, non è crittografico. Versione prototipo da validare con test pratici.

Nessun account o servizio remoto richiesto.
