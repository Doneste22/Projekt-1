# Jarvis als Android-App

Hier liegt kein Android-Projekt, sondern nur sein Bauplan: `twa-manifest.json`.
Daraus erzeugt [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) das
ganze Projekt und die APK neu — der generierte Gradle-Kram gehört nicht ins
Repo, er ist jedes Mal derselbe.

Die App ist eine **Trusted Web Activity**: ein Android-Container, der
`https://jarvis-damaso.netlify.app/jarvis/` im Vollbild zeigt, ohne
Adressleiste und ohne Browser-Rahmen. Es ist dieselbe App wie im Browser, nur
mit eigenem Eintrag im App-Menü.

## Neu bauen

```
npm install -g @bubblewrap/cli
cd android
bubblewrap update      # erzeugt das Projekt aus twa-manifest.json
bubblewrap build       # baut und signiert app-release-signed.apk
```

Gebraucht werden JDK 17 und das Android-SDK; Bubblewrap lädt beides beim ersten
Lauf selbst herunter.

## Der Signaturschlüssel

**Liegt bewusst nicht im Repo.** Er heißt `android.keystore`, Alias `jarvis`,
und gehört zu Damaso — Fingerabdruck:

```
BA:42:90:A4:CE:80:B6:9C:2B:12:81:2B:5E:88:A7:71:46:1E:C7:32:4A:BC:A3:4D:D9:0F:55:58:C8:6E:C9:73
```

Android erlaubt ein Update einer installierten App nur, wenn die neue Fassung
**mit demselben Schlüssel** signiert ist. Geht er verloren, lässt sich die App
nur noch deinstallieren und neu installieren — der Gesprächsverlauf wäre dann
weg. Also aufheben.

Derselbe Fingerabdruck steht in `/assetlinks.json` im Wurzelverzeichnis des
Repos und wird unter `/.well-known/assetlinks.json` ausgeliefert. Daran erkennt
Android, dass App und Website zusammengehören — nur deshalb startet sie ohne
Adressleiste. Wer den Schlüssel wechselt, muss die Datei mitändern.

## Was die App nicht kann

Sie ruft die veröffentlichte Adresse auf, braucht also Netz und den
Zugangscode. Die Werkzeuge für den Handyspeicher hat sie **nicht** — die gibt
es nur im lokalen Server unter Termux, weil nur der auf die Dateien kommt.
