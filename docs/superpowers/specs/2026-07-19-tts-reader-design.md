# Czytnik tekstu angielskiego (TTS Reader) — Design

## Cel

Prosta strona internetowa: użytkownik wkleja tekst po angielsku, wybiera akcent
(brytyjski lub amerykański) i klika Play, a strona czyta tekst na głos.
Ma działać w 100% za darmo, bez rejestracji, bez kluczy API, bez backendu.

## Podejście

Wykorzystanie wbudowanego w przeglądarkę **Web Speech API**
(`SpeechSynthesis` / `SpeechSynthesisUtterance`) zamiast płatnego zewnętrznego
API TTS (np. Google Cloud TTS, Amazon Polly, ElevenLabs). Web Speech API jest
darmowe bez limitów, działa w całości po stronie klienta i nie wymaga
publikowania żadnego klucza API w kodzie strony. Kompromis: jakość i dostępność
głosów zależy od przeglądarki/systemu użytkownika (najlepsze wsparcie w
Chrome/Edge).

## Architektura

Pojedynczy statyczny plik `index.html` (HTML + CSS + JS inline, bez build
stepu i bez zależności zewnętrznych), hostowany na GitHub Pages. Brak
backendu, brak bazy danych.

## Interfejs użytkownika

- Pole tekstowe (`<textarea>`) do wklejenia tekstu po angielsku
- Wybór akcentu: dwie opcje — "🇬🇧 British English" / "🇺🇸 American English"
- Przyciski: **Play**, **Pauza**, **Stop**
- Prosty, czytelny wygląd (jasne tło, czytelna typografia) — appka użytkowa

## Zachowanie / przepływ danych

1. Użytkownik wkleja tekst i wybiera akcent (domyślnie: British).
2. Klik **Play** tworzy `SpeechSynthesisUtterance` z treścią pola tekstowego,
   ustawia `utterance.lang` na `en-GB` lub `en-US` w zależności od wyboru, i
   wywołuje `speechSynthesis.speak(utterance)`.
3. Dobór konkretnego głosu: lista głosów pobierana przez
   `speechSynthesis.getVoices()` (z obsługą asynchronicznego ładowania przez
   event `voiceschanged`); wybierany jest pierwszy głos, którego `lang`
   pasuje do `en-GB` / `en-US`.
4. **Pauza** wywołuje `speechSynthesis.pause()` (wznowienie przez ponowny klik
   Play, który wywołuje `speechSynthesis.resume()` jeśli odtwarzanie jest w
   trybie pauzy).
5. **Stop** wywołuje `speechSynthesis.cancel()` i resetuje stan przycisków.
6. Klik Play po naturalnym zakończeniu odtwarzania rozpoczyna czytanie od
   nowa.

## Obsługa błędów i przypadków brzegowych

- Brak wsparcia przeglądarki dla Web Speech API → komunikat: "Twoja
  przeglądarka nie obsługuje czytania na głos. Spróbuj Chrome lub Edge."
- Brak głosu dopasowanego do wybranego akcentu na danym systemie → komunikat
  ostrzegawczy i użycie domyślnego dostępnego głosu jako fallback.
- Puste pole tekstowe → przycisk Play jest nieaktywny.

## Testowanie

Manualne testowanie w Chrome i Edge (najlepsze wsparcie głosów):
wklejenie przykładowego tekstu, sprawdzenie odtwarzania dla obu akcentów,
sprawdzenie działania Play/Pauza/Stop oraz zachowania po naturalnym
zakończeniu czytania.

## Poza zakresem (YAGNI)

Zgodnie z ustaleniami z użytkownikiem, świadomie pominięto w tej wersji:
regulację prędkości czytania, wybór konkretnego głosu (męski/żeński) poza
akcentem, oraz podświetlanie czytanych słów w tekście. Można je dodać w
przyszłości jako osobne, mniejsze zmiany.
