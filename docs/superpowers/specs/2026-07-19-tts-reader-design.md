# Czytnik tekstu angielskiego (TTS Reader) — Design

> **Rewizja 2026-07-19:** Po zaimplementowaniu pierwszej wersji opartej o
> Web Speech API użytkownik ocenił dostępne głosy jako zbyt mechaniczne i
> niewygodne w odbiorze. Ten dokument opisuje zaktualizowane podejście
> oparte o Gemini TTS. Sekcja "Odrzucone podejście" na końcu dokumentuje
> pierwotny wariant i powód zmiany.

## Cel

Prosta strona internetowa: użytkownik wkleja tekst po angielsku, wybiera akcent
(brytyjski lub amerykański) i klika Play, a strona czyta tekst na głos
naturalnie brzmiącym głosem. Ma działać za darmo (w ramach darmowego limitu
Google), bez opłat, z minimalną możliwą infrastrukturą.

## Podejście

Wykorzystanie **Gemini API text-to-speech** (model
`gemini-2.5-flash-preview-tts` przez Google AI Studio) zamiast wbudowanego w
przeglądarkę Web Speech API. Gemini TTS daje wyraźnie bardziej naturalne,
przyjemne w odbiorze głosy. Kompromis: wymaga klucza API i nie może być
wołane bezpośrednio z kodu strony (klucz byłby publicznie widoczny), więc
potrzebny jest mały serwer pośredniczący (proxy) trzymający klucz jako
sekret.

**Sterowanie akcentem:** Gemini TTS nie ma osobnego parametru dla wariantu
językowego (en-GB / en-US) — akcent steruje się instrukcją w treści
promptu wysyłanego do modelu. Proxy dokleja przed tekstem użytkownika jedną
z dwóch instrukcji, w zależności od wyboru:
- British: `"Read the following text aloud in a natural British English accent:"`
- American: `"Read the following text aloud in a natural American English accent:"`

Używany jest jeden ustalony głos (Gemini TTS voice: `Kore`) dla obu
wariantów — wybór "najlepszego" głosu spośród 30 dostępnych jest subiektywny
i poza zakresem tej wersji.

## Architektura

Dwa komponenty, oba darmowe:

1. **Frontend** — pojedynczy statyczny plik `index.html` (HTML + CSS + JS
   inline), hostowany na GitHub Pages. Woła proxy przez `fetch()`, nie
   zawiera żadnego sekretu.
2. **Proxy** — Cloudflare Worker (`worker.js`), osobny mały deployment.
   Przechowuje klucz API Gemini jako sekret (Cloudflare Worker Secret),
   przyjmuje żądanie `POST { text, accent }`, woła Gemini API z
   odpowiednio złożonym promptem, zwraca surowe audio (base64 PCM +
   metadane: sample rate) do przeglądarki.

Klucz API nigdy nie trafia do kodu frontendu ani do repozytorium — istnieje
wyłącznie jako sekret w konfiguracji Cloudflare Workera.

## Interfejs użytkownika

Bez zmian względem pierwszej wersji:
- Pole tekstowe (`<textarea>`) do wklejenia tekstu po angielsku
- Wybór akcentu: "🇬🇧 British English" / "🇺🇸 American English" (domyślnie: British)
- Przyciski: **Play**, **Pauza**, **Stop**
- Prosty, czytelny wygląd

Nowy element: pole statusu pokazuje dodatkowy stan **"Generowanie głosu..."**
między kliknięciem Play a startem odtwarzania (zapytanie do API trwa
kilka sekund, w przeciwieństwie do natychmiastowego Web Speech API).

## Zachowanie / przepływ danych

1. Użytkownik wkleja tekst i wybiera akcent (domyślnie: British).
2. Klik **Play**:
   a. Status zmienia się na "Generowanie głosu...", Play się blokuje.
   b. Frontend wysyła `POST` do adresu Cloudflare Workera z `{text, accent}`.
   c. Worker dokleja instrukcję akcentu do tekstu, woła Gemini API z
      `responseModalities: ["AUDIO"]` i głosem `Kore`, odbiera surowe PCM
      (base64), zwraca je do frontendu jako JSON `{audioBase64, sampleRate}`.
   d. Frontend dekoduje base64, opakowuje surowe PCM w nagłówek WAV (funkcja
      pomocnicza budująca minimalny 44-bajtowy nagłówek WAV dla PCM 16-bit
      mono), tworzy `Blob` i `URL.createObjectURL`, przypisuje do elementu
      `<audio>`.
   e. `<audio>.play()` — status zmienia się na "Czytanie...".
3. **Pauza** wywołuje `<audio>.pause()`.
4. Klik **Play** podczas pauzy wywołuje `<audio>.play()` (wznowienie od
   miejsca pauzy — bez ponownego zapytania do API).
5. **Stop** wywołuje `<audio>.pause()` + reset `currentTime = 0` i zwalnia
   `URL.revokeObjectURL`.
6. Po naturalnym zakończeniu odtwarzania (event `ended`) status wraca do
   "Zakończono.", przyciski wracają do stanu początkowego.
7. Klik Play po naturalnym zakończeniu generuje audio od nowa (nowe
   zapytanie do API) — audio nie jest cache'owane między sesjami ani
   między zmianami tekstu/akcentu (YAGNI dla tej wersji).

## Obsługa błędów i przypadków brzegowych

- Błąd sieci / niedostępny proxy → komunikat: "Nie udało się połączyć z
  usługą czytania tekstu. Spróbuj ponownie."
- Błąd z Gemini API (np. przekroczony darmowy limit, nieprawidłowy klucz)
  przekazany przez proxy jako kod błędu → komunikat: "Usługa czytania
  tekstu jest chwilowo niedostępna (limit lub błąd API)."
- Puste pole tekstowe → przycisk Play nieaktywny.
- Bardzo długi tekst → poza zakresem tej wersji (brak limitu długości w UI;
  ewentualny błąd z API zostanie pokazany jak każdy inny błąd API).

## Testowanie

Manualne testowanie w Chrome i Edge: wklejenie przykładowego tekstu,
sprawdzenie odtwarzania dla obu akcentów, sprawdzenie działania
Play/Pauza/Stop, sprawdzenie zachowania przy błędzie (np. tymczasowe
wyłączenie proxy) i przy pustym polu tekstowym.

## Poza zakresem (YAGNI)

Regulacja prędkości czytania, wybór spośród wielu głosów Gemini,
podświetlanie czytanych słów, cache'owanie wygenerowanego audio,
limit długości tekstu w UI.

## Odrzucone podejście (wersja 1)

Pierwsza wersja specyfikacji (ten sam dzień, wcześniejsza rewizja) zakładała
wyłącznie przeglądarkowe Web Speech API (`speechSynthesis`) — całkowicie
darmowe, bez backendu, jeden plik. Zostało zaimplementowane (Task 1 planu
implementacji, commit z działającym Play w akcencie brytyjskim) i odrzucone
przez użytkownika po przesłuchaniu: głosy systemowe okazały się zbyt
mechaniczne. Kod z tej wersji zostanie zastąpiony w kolejnych zadaniach
planu implementacji.
