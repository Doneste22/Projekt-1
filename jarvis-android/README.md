# Jarvis als eigenständige Android-App

Eine richtige Android-App in Kotlin, kein Browser drumherum: Chatfeld,
Mikrofon, Verlauf auf dem Telefon, Antworten optional vorgelesen. Sie ruft
denselben Endpunkt an wie die Web-Fassung (`/api/jarvis`) und braucht dafür
den **Zugangscode**, den Damaso einmal in den Einstellungen einträgt.

Einen eigenen API-Schlüssel braucht sie nicht — und soll sie nicht haben. Das
Modell bezahlt Netlifys AI-Gateway, und das gilt nur für Netlifys eigenen
Endpunkt. Ein Schlüssel am Telefon wäre eine zweite Rechnung für dieselbe
Sache.

Damit unterscheidet sie sich von den anderen Fassungen nur noch in der Hülle:

| | Wo der Schlüssel liegt | Was es braucht |
| --- | --- | --- |
| `jarvis/` im Browser | auf dem Server (Netlify) | Netz + Zugangscode |
| `android/` (TWA) | auf dem Server (Netlify) | Netz + Zugangscode |
| **`jarvis-android/`** | **auf dem Server (Netlify)** | **Netz + Zugangscode** |

Sie steht neben der alten TWA-App, nicht an ihrer Stelle: andere Paket-Kennung
(`ch.damaso.jarvis.chat`), also lassen sich beide gleichzeitig installieren.
Wer die alte nicht mehr braucht, deinstalliert sie.

## Die APK holen

Sie wird bei **jedem Push** automatisch gebaut. Auf github.com:

1. Oben auf **Actions**, den obersten Lauf anklicken.
2. Ganz unten unter **Artifacts** liegt `jarvis-apk` — herunterladen.
3. Das ist eine ZIP-Datei. Auspacken, die `.apk` aufs Telefon kopieren und
   antippen. Android fragt einmal nach, ob es Apps aus dieser Quelle
   installieren darf.

Beim ersten Start: Zahnrad oben rechts, Zugangscode eintragen, sichern. Das
ist derselbe Code, den die Website abfragt; er steht in den Netlify-Variablen
unter `JARVIS_PASSCODE`.

## Der Signaturschlüssel

Android installiert nur signierte Apps, und eine neue Fassung legt sich nur
dann über eine installierte, wenn **derselbe Schlüssel** dahintersteht. Ohne
hinterlegten Schlüssel erzeugt der Bau-Ablauf jedes Mal einen neuen — die APK
lässt sich installieren, aber nicht aktualisieren: dafür müsste die App erst
deinstalliert werden, und der Gesprächsverlauf wäre weg.

Einmal einrichten, dann ist Ruhe. Auf dem eigenen Rechner:

```bash
keytool -genkeypair -v -keystore jarvis.jks -alias jarvis \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 jarvis.jks          # unter macOS: base64 -i jarvis.jks
```

Die ausgegebene Zeile auf github.com unter **Settings → Secrets and variables
→ Actions** als `ANDROID_KEYSTORE_BASE64` hinterlegen, dazu
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`jarvis`) und
`ANDROID_KEY_PASSWORD`.

**Die Datei `jarvis.jks` aufheben.** Geht sie verloren, gibt es kein Update
mehr — nur noch deinstallieren und neu anfangen. Sie gehört nicht ins Repo;
`.gitignore` sperrt `*.jks`.

## Selbst bauen

Gebraucht werden JDK 17 und das Android-SDK (Android Studio bringt beides mit).

```bash
cd jarvis-android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew testReleaseUnitTest     # die Kette zum Modell prüfen
./gradlew assembleDebug           # APK unter app/build/outputs/apk/debug/
```

Für eine Release-APK muss `jarvis-android/schluessel.jks` daneben liegen
(Alias und Passwörter über die oben genannten Umgebungsvariablen, sonst
`jarvis`).

## Wie es gebaut ist

```
app/src/main/java/ch/damaso/jarvis/chat/
  MainActivity.kt   Die Oberfläche (Compose) — nur Aussehen, kein Zustand
  JarvisModel.kt    Der Zustand: Verlauf, laufende Antwort, was schiefging
  Modell.kt         Der Aufruf an /api/jarvis und das Lesen des Stroms
  Tresor.kt         Der Zugangscode, verschlüsselt abgelegt
  Verlauf.kt        Das Gespräch als JSON-Datei im App-Ordner
  Stimme.kt         Zuhören (SpeechRecognizer) und Vorlesen (TextToSpeech)
  Symbole.kt        Die Symbole, gezeichnet statt als Bilddateien
  Farben.kt         Dieselbe Palette wie jarvis/style.css
app/src/test/       Prüfung der Kette zum Modell gegen einen Nachbau
```

Vier Entscheidungen, die hier schon getroffen sind:

**Keine Bibliothek für das Netz.** `HttpURLConnection` und `org.json` bringt
Android mit. Das Antwortformat der API ist eine Handvoll JSON-Zeilen; dafür
lohnt kein Paket, das in zwei Jahren nicht mehr baut.

**Keine Bibliothek für den Zugangscode.** `Tresor.kt` verschlüsselt ihn mit
einem Schlüssel aus dem Schlüsselspeicher des Geräts — der lässt sich benutzen,
aber nicht auslesen, auf den meisten Telefonen steckt er in eigener Hardware.
Dazu ist die App von jeder Sicherung ausgenommen: der Schlüssel geht weder in
eine Cloud noch auf ein neues Telefon mit.

**Über den eigenen Endpunkt, nicht direkt zur API.** Das war einmal anders
begründet: auf dem eigenen Telefon liege der Schlüssel ohnehin sicher, ein
Zwischenserver koste nur Netz und Geld. Die Rechnung setzte einen eigenen
Anthropic-Schlüssel voraus. Den gibt es hier nicht — das Gateway stellt ihn,
und nur seinem eigenen Endpunkt. Also geht der Aufruf denselben Weg wie im
Browser, und am Telefon liegt kein Schlüssel mehr, sondern nur der
Zugangscode. Geht der verloren, kostet das nichts.

**Gestreamt.** Eine Antwort, die wortweise erscheint, fühlt sich an wie ein
Gespräch; eine, die nach dreissig Sekunden am Stück kommt, wie ein Formular.
Kommt der Abschluss des Stroms nicht an, ist die Antwort unvollständig — dann
steht das unter der Blase, statt eine halbe Antwort wie eine ganze aussehen zu
lassen.

## Was sie nicht kann

- **Werkzeuge für den Handyspeicher.** Die gibt es nur im lokalen Server unter
  Termux (`server/`), weil nur der an die Dateien kommt.
- **Offline antworten.** Das Modell steht im Netz. Der Verlauf ist aber auch
  ohne Netz da und lesbar.
- **Bilder, Tabellen, Anhänge.** Reiner Text, hin und zurück.

## Was geprüft ist — und was nicht

`app/src/test/` fährt die ganze Kette zum Modell gegen einen Nachbau: was
tatsächlich gesendet wird, ob der Zugangscode im richtigen Kopf steht, ob der
Text stückweise ankommt, ob eine abgerissene Antwort als abgerissen erkannt
wird und ob die Klartextmeldung des Servers durchkommt. Läuft bei jedem Push
mit.

**Die Oberfläche selbst ist nicht auf einem Gerät gelaufen** — sie ist gebaut
und signiert, aber nicht angetippt. Was auf dem Telefon zuerst zu prüfen ist:
Mikrofon-Knopf samt Nachfrage nach der Berechtigung, Vorlesen, und ob der
Verlauf nach einem Neustart der App noch da ist.
