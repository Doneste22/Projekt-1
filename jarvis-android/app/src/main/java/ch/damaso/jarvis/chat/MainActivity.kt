package ch.damaso.jarvis.chat

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Jarvis als eigenständige Android-App.
 *
 * Eine einzige Ansicht: Kopfzeile, Gespräch, Eingabe. Alles, was Zustand hat,
 * liegt im `JarvisModel`; hier steht nur, wie es aussieht.
 */
class MainActivity : ComponentActivity() {

    private var sprecher: Sprecher? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Farben.akzent,
                    onPrimary = Farben.grundTief,
                    background = Farben.grundTief,
                    onBackground = Farben.text,
                    surface = Farben.flaeche,
                    onSurface = Farben.text,
                    error = Farben.warn
                )
            ) {
                Bildschirm(merkeSprecher = { sprecher = it })
            }
        }
    }

    override fun onStop() {
        super.onStop()
        // Die App im Hintergrund redet nicht weiter.
        sprecher?.still()
    }
}

@Composable
private fun Bildschirm(merkeSprecher: (Sprecher?) -> Unit) {
    val kontext = LocalContext.current
    val modell: JarvisModel = viewModel()

    val zuhoerer = remember { Zuhoerer(kontext) }
    val sprecher = remember { Sprecher(kontext) }

    var entwurf by remember { mutableStateOf("") }
    var einstellungenOffen by remember { mutableStateOf(false) }
    var loeschenOffen by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        merkeSprecher(sprecher)
        onDispose {
            merkeSprecher(null)
            zuhoerer.aufloesen()
            sprecher.aufloesen()
        }
    }

    // Vorlesen, sobald eine Antwort ganz da ist — nur wenn eingeschaltet.
    DisposableEffect(modell) {
        modell.aufFertigerAntwort = { antwort ->
            if (modell.vorlesen) sprecher.sprich(antwort)
        }
        onDispose { modell.aufFertigerAntwort = null }
    }

    val mikrofonErlaubnis = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { erlaubt ->
        if (erlaubt) {
            zuhoerenStarten(zuhoerer, modell) { entwurf = it }
        } else {
            modell.hinweis = "Ohne Zugriff aufs Mikrofon geht die Spracheingabe nicht."
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Farben.grundTief)
            .safeDrawingPadding()
            .imePadding()
    ) {
        Kopfzeile(
            zustand = modell.zustand,
            vorlesen = modell.vorlesen,
            aufVorlesen = {
                modell.vorlesenUmschalten()
                if (!modell.vorlesen) sprecher.still()
                sprecher.mangel?.let { modell.hinweis = it }
            },
            aufEinstellungen = { einstellungenOffen = true },
            aufLeeren = { loeschenOffen = true }
        )

        Gespraech(
            nachrichten = modell.nachrichten,
            imFluss = modell.imFluss,
            schluesselFehlt = modell.schluessel.isEmpty(),
            modifier = Modifier.weight(1f)
        )

        modell.hinweis?.let { text ->
            Hinweis(text) { modell.hinweis = null }
        }

        Eingabezeile(
            entwurf = entwurf,
            aufEntwurf = { entwurf = it },
            hoert = modell.zustand == Zustand.HOERT,
            laeuft = modell.laeuft,
            aufMikrofon = {
                if (modell.zustand == Zustand.HOERT) {
                    zuhoerer.beenden()
                } else if (ContextCompat.checkSelfPermission(
                        kontext, Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    zuhoerenStarten(zuhoerer, modell) { entwurf = it }
                } else {
                    mikrofonErlaubnis.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
            aufSenden = {
                if (modell.laeuft) {
                    modell.abbrechen()
                } else {
                    val text = entwurf
                    entwurf = ""
                    sprecher.still()
                    modell.senden(text)
                }
            }
        )
    }

    if (einstellungenOffen) {
        Einstellungen(
            vorhanden = modell.schluessel,
            aufSichern = {
                modell.schluesselSetzen(it)
                einstellungenOffen = false
            },
            aufSchliessen = { einstellungenOffen = false }
        )
    }

    if (loeschenOffen) {
        AlertDialog(
            onDismissRequest = { loeschenOffen = false },
            containerColor = Farben.flaeche,
            titleContentColor = Farben.text,
            textContentColor = Farben.textLeise,
            title = { Text("Verlauf löschen?") },
            text = { Text("Das ganze Gespräch wird von diesem Telefon entfernt. Das lässt sich nicht rückgängig machen.") },
            confirmButton = {
                TextButton(onClick = {
                    modell.verlaufLeeren()
                    loeschenOffen = false
                }) { Text("Löschen", color = Farben.warn) }
            },
            dismissButton = {
                TextButton(onClick = { loeschenOffen = false }) {
                    Text("Behalten", color = Farben.textLeise)
                }
            }
        )
    }
}

private fun zuhoerenStarten(
    zuhoerer: Zuhoerer,
    modell: JarvisModel,
    aufText: (String) -> Unit
) {
    modell.hinweis = null
    modell.zustandSetzen(Zustand.HOERT)
    zuhoerer.starten(
        aufZwischenstand = aufText,
        aufFertig = { text ->
            modell.zustandSetzen(Zustand.BEREIT)
            if (text.isNotBlank()) aufText(text)
        },
        aufFehler = { meldung ->
            modell.zustandSetzen(Zustand.BEREIT)
            modell.hinweis = meldung
        }
    )
}

/* ---------------------------------------------------------------- Bausteine */

@Composable
private fun Kopfzeile(
    zustand: Zustand,
    vorlesen: Boolean,
    aufVorlesen: () -> Unit,
    aufEinstellungen: () -> Unit,
    aufLeeren: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Farben.grund)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Jarvis",
                color = Farben.text,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                zustand.beschriftung,
                color = if (zustand == Zustand.BEREIT) Farben.textStill else Farben.akzent,
                fontSize = 13.sp
            )
        }
        Knopf(
            symbol = if (vorlesen) Symbole.LautsprecherAn else Symbole.LautsprecherAus,
            beschreibung = if (vorlesen) "Vorlesen ausschalten" else "Vorlesen einschalten",
            farbe = if (vorlesen) Farben.akzent else Farben.textStill,
            aufKlick = aufVorlesen
        )
        Knopf(Symbole.Papierkorb, "Verlauf löschen", Farben.textStill, aufLeeren)
        Knopf(Symbole.Einstellungen, "Einstellungen", Farben.textStill, aufEinstellungen)
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(Farben.linie)
    )
}

@Composable
private fun Gespraech(
    nachrichten: List<Nachricht>,
    imFluss: String?,
    schluesselFehlt: Boolean,
    modifier: Modifier = Modifier
) {
    val stand = rememberLazyListState()

    // Immer ganz unten stehen bleiben, auch während die Antwort wächst.
    // Der große Versatz heißt „so weit es geht": eine lange Antwort, deren
    // Anfang oben ausgerichtet wäre, schriebe sonst unsichtbar aus dem Bild
    // heraus. Ohne Animation, sonst rauft sich jedes neue Wort mit der
    // vorigen Bewegung.
    LaunchedEffect(nachrichten.size, imFluss) {
        val letzte = nachrichten.size + (if (imFluss != null) 1 else 0) - 1
        if (letzte >= 0) stand.scrollToItem(letzte, 100_000)
    }

    LazyColumn(
        state = stand,
        modifier = modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = 12.dp, vertical = 14.dp
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (nachrichten.isEmpty() && imFluss == null) {
            item {
                Text(
                    text = if (schluesselFehlt) {
                        "Trag zuerst deinen API-Schlüssel ein — das Zahnrad oben rechts. " +
                            "Danach kannst du tippen oder aufs Mikrofon drücken."
                    } else {
                        "Tipp etwas, oder drück aufs Mikrofon."
                    },
                    color = Farben.textStill,
                    fontSize = 15.sp,
                    modifier = Modifier.padding(vertical = 24.dp, horizontal = 6.dp)
                )
            }
        }

        items(nachrichten.size) { i ->
            val nachricht = nachrichten[i]
            Blase(nachricht.text, nachricht.vonDamaso)
        }

        imFluss?.let { text ->
            item {
                if (text.isEmpty()) Punkte() else Blase(text, false)
            }
        }
    }
}

@Composable
private fun Blase(text: String, vonDamaso: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (vonDamaso) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .background(
                    color = if (vonDamaso) Farben.akzentSchimmer else Farben.flaeche,
                    shape = RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (vonDamaso) 16.dp else 4.dp,
                        bottomEnd = if (vonDamaso) 4.dp else 16.dp
                    )
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(
                text = text,
                color = Farben.text,
                fontSize = 16.sp,
                lineHeight = 23.sp
            )
        }
    }
}

/** Drei Punkte, solange noch kein Wort da ist. */
@Composable
private fun Punkte() {
    Box(
        modifier = Modifier
            .background(Farben.flaeche, RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Text("…", color = Farben.textStill, fontSize = 18.sp)
    }
}

@Composable
private fun Hinweis(text: String, aufWeg: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .background(Farben.warnFlaeche, RoundedCornerShape(12.dp))
            .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = text,
            color = Farben.warn,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f)
        )
        Knopf(Symbole.Kreuz, "Hinweis schließen", Farben.warn, aufWeg, groesse = 20)
    }
}

@Composable
private fun Eingabezeile(
    entwurf: String,
    aufEntwurf: (String) -> Unit,
    hoert: Boolean,
    laeuft: Boolean,
    aufMikrofon: () -> Unit,
    aufSenden: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp, max = 160.dp)
                .background(Farben.flaeche, RoundedCornerShape(24.dp))
                .border(1.dp, Farben.linie, RoundedCornerShape(24.dp))
                .padding(horizontal = 16.dp, vertical = 13.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            if (entwurf.isEmpty()) {
                Text(
                    if (hoert) "… sprich" else "Nachricht",
                    color = Farben.textStill,
                    fontSize = 16.sp
                )
            }
            BasicTextField(
                value = entwurf,
                onValueChange = aufEntwurf,
                modifier = Modifier.fillMaxWidth(),
                textStyle = TextStyle(color = Farben.text, fontSize = 16.sp, lineHeight = 22.sp),
                cursorBrush = SolidColor(Farben.akzent),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences
                ),
                maxLines = 6
            )
        }

        Spacer(Modifier.width(6.dp))

        Knopf(
            symbol = Symbole.Mikrofon,
            beschreibung = if (hoert) "Aufnahme beenden" else "Spracheingabe",
            farbe = if (hoert) Farben.akzent else Farben.textLeise,
            aufKlick = aufMikrofon,
            groesse = 26
        )

        Knopf(
            symbol = if (laeuft) Symbole.Stopp else Symbole.Senden,
            beschreibung = if (laeuft) "Abbrechen" else "Abschicken",
            farbe = when {
                laeuft -> Farben.warn
                entwurf.isNotBlank() -> Farben.akzent
                else -> Farben.textStill
            },
            aufKlick = { if (laeuft || entwurf.isNotBlank()) aufSenden() },
            groesse = 26
        )
    }
}

@Composable
private fun Knopf(
    symbol: androidx.compose.ui.graphics.vector.ImageVector,
    beschreibung: String,
    farbe: androidx.compose.ui.graphics.Color,
    aufKlick: () -> Unit,
    groesse: Int = 22
) {
    IconButton(onClick = aufKlick, modifier = Modifier.size(44.dp)) {
        Icon(
            imageVector = symbol,
            contentDescription = beschreibung,
            tint = farbe,
            modifier = Modifier.size(groesse.dp)
        )
    }
}

@Composable
private fun Einstellungen(
    vorhanden: String,
    aufSichern: (String) -> Unit,
    aufSchliessen: () -> Unit
) {
    var wert by remember { mutableStateOf(vorhanden) }
    var sichtbar by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = aufSchliessen,
        containerColor = Farben.flaeche,
        titleContentColor = Farben.text,
        textContentColor = Farben.textLeise,
        title = { Text("API-Schlüssel") },
        text = {
            Column {
                Text(
                    "Der Schlüssel von console.anthropic.com. Er liegt verschlüsselt auf " +
                        "diesem Telefon, geht in keine Sicherung mit und steht nirgends im Code.",
                    color = Farben.textLeise,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
                Spacer(Modifier.height(14.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Farben.grund, RoundedCornerShape(12.dp))
                        .border(1.dp, Farben.linie, RoundedCornerShape(12.dp))
                        .padding(start = 14.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.weight(1f).padding(vertical = 14.dp)) {
                        if (wert.isEmpty()) {
                            Text("sk-ant-…", color = Farben.textStill, fontSize = 16.sp)
                        }
                        BasicTextField(
                            value = wert,
                            onValueChange = { wert = it.trim() },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            textStyle = TextStyle(color = Farben.text, fontSize = 16.sp),
                            cursorBrush = SolidColor(Farben.akzent),
                            visualTransformation = if (sichtbar) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            }
                        )
                    }
                    Knopf(
                        symbol = Symbole.Auge,
                        beschreibung = if (sichtbar) "Schlüssel verbergen" else "Schlüssel anzeigen",
                        farbe = if (sichtbar) Farben.akzent else Farben.textStill,
                        aufKlick = { sichtbar = !sichtbar },
                        groesse = 20
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Jede Frage kostet Geld — es ist dein Konto bei Anthropic.",
                    color = Farben.textStill,
                    fontSize = 13.sp
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { aufSichern(wert) }) {
                Text("Sichern", color = Farben.akzent)
            }
        },
        dismissButton = {
            TextButton(onClick = aufSchliessen) {
                Text("Abbrechen", color = Farben.textLeise)
            }
        }
    )
}
