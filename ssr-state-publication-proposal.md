# Propozycja: rejestracja stanu SSR przy zapisie wyjścia

Status: pomysł do rozważenia, bez implementacji i pomiarów.

## Cel

Catch ma pozwalać na streaming odpowiedzi, również z Pending wewnątrz.
Odrzucona, niewysłana część poddrzewa nie powinna pozostawiać prywatnego stanu
w `qwik/state`. Stan potrzebny już wysłanemu wyjściu oraz współdzielone wartości
muszą pozostać dostępne pod stabilnymi ID.

Dotyczy to checkoutu `v3` i jego kompilowanego SSR. Nie zakładamy, że Catch
zawsze buforuje całe poddrzewo ani że może cofnąć wcześniej wysłane bajty.

## Główna zasada

Renderowanie tworzy wyjście zawierające referencje do wartości. Rejestracja
korzenia w globalnym `SerializationContextImpl` następuje dopiero wtedy,
gdy writer zatwierdza fragment do zapisu.

W efekcie:

- niewysłane wyjście utrzymuje swoje wartości lokalnie;
- globalny kontekst zawiera korzenie potrzebne zaakceptowanemu wyjściu;
- odrzucenie wyjścia usuwa jego referencje i pozwala zwolnić prywatny stan;
- kolejny fragment używający wcześniej zarejestrowanego obiektu dostaje jego ID;
- nie potrzeba osobnych liczników użytkowników korzeni, tombstone'ów ani
  nieciągłych zakresów publikacji wynikających z odrzuconych rejestracji.

ID korzeni są przydzielane w kolejności zatwierdzania wyjścia. Po przydzieleniu
pozostają stabilne. Nie gwarantujemy ID zarezerwowanego podczas spekulatywnego
renderowania, ponieważ taka rezerwacja nie występuje. ID elementów i zakresów
DOM pozostają osobnym mechanizmem.

## Schemat

```text
renderowanie
  -> referencje do wartości w strukturalnym wyjściu SSR
     -> fragment odrzucony: wyjście usuwamy, bez globalnej rejestracji
     -> fragment zatwierdzony: writer rejestruje korzenie i zapisuje referencje ID
        -> serializer zapisuje przyrost stanu w istniejącym punkcie publikacji
```

## Pseudokod referencji

Obecnie referencja SSR zawiera numeryczne ID przydzielone podczas renderowania.
Propozycja przenosi tę operację do writera:

```typescript
type SsrRootRef = {
  type: 'root-ref';
  value: unknown;
};

function createSsrRootRef(value: unknown): SsrRootRef {
  return { type: 'root-ref', value };
}

function materializeRootRef(reference: SsrRootRef, ctx: SerializationContext): string {
  return String(ctx.$addRoot$(reference.value));
}
```

To schemat zmiany istniejących struktur wyjścia, nie propozycja nowego
publicznego API ani pełny kod produkcyjny.

## Zapis stanu

Rendering nie dodaje korzeni do globalnej tablicy. Writer rejestruje wartości,
których referencje faktycznie zapisuje. Serializer może dalej używać istniejącej
mapy `seen`, odkrywania zależności, backrefs i przyrostowej tablicy korzeni.

```typescript
await writeAcceptedOutput(fragment, serializationCtx);

// W istniejącym, dozwolonym miejscu publikacji stanu.
const state = await serializationCtx.$serializeNext$();
await writeState(state);
```

Nie oznacza to wstawiania skryptu po każdym tagu HTML. Zachowujemy poprawne
miejsca publikacji shella i pakietów OOOS oraz kolejność wymaganą przez runtime.
Zapis danych i aktywacja segmentu muszą być zsynchronizowane.

Od momentu wysłania referencji w HTML korzeń jest potrzebny odpowiedzi, nawet
jeśli jego dane w `qwik/state` jeszcze czekają na publikację. Tego korzenia nie
wycofujemy po późniejszym błędzie Catch. Błąd transportu przerywa odpowiedź.

## Przykład Catch i Pending

```tsx
<Catch fallback$={errorFallback}>
  <Header />
  <Pending fallback$={loading}>
    <SlowContent />
  </Pending>
</Catch>
```

1. Wysłanie Header i loading rejestruje wyłącznie potrzebny im stan.
2. SlowContent może nadal pracować i utrzymywać swoje wartości w niewysłanym
   wyjściu oraz właścicielach.
3. Po sukcesie jego wyjście rejestruje kolejne korzenie przy zapisie.
4. Po błędzie wyjście usuwamy, anulujemy pracę i streamujemy fallback Catch.
5. Korzenie potrzebne wcześniejszemu wyjściu pozostają pod dotychczasowymi ID.

Jeżeli niewysłany fragment i Header używają tego samego obiektu, Header już
zapewnia jego rejestrację. Odrzucenie fragmentu nie usuwa tego obiektu.
Współdzielenie pośrednie obsługuje przejście istniejącego serializera po
zachowanym stanie.

## Obowiązkowe punkty integracji

Przeniesienie samych captures QRL jest niewystarczające.

- **Atrybuty eventów i QRL:** captures pozostają wartościami do materializacji
  atrybutu; ID oraz delty obliczamy wtedy. Unikamy przedwczesnego przekształcenia
  captures do stringa zawierającego ID.
- **Markery projekcji i konteksty:** wczesne numery korzeni zastępujemy
  referencjami serwerowymi; format numeryczny odtwarzamy na granicy wyjścia
  i serializacji, zachowując kontrakt czytnika.
- **Zadania i widoczne zadania:** ich rejestrację przypisujemy do zatwierdzanego
  wyjścia właściciela. Samo `scheduler.notify()` nie powinno globalnie publikować
  zadania z odrzucanego poddrzewa.
- **Catch i Pending subscriptions:** wymagane korzenie boundary przypisujemy
  do ich wysyłanych markerów lub metadanych wyjścia.
- **Refs, eager resume i efekty:** uwzględniamy korzenie potrzebne pracy, która
  nie ma zwykłego handlera w HTML.
- **Subskrypcje współdzielonych sygnałów:** serializer pomija powiązania do
  anulowanej lub jeszcze niezatwierdzonej pracy. Później zatwierdzane subskrypcje
  dołączamy mechanizmem aktualizacji subskrypcji.
- **Wyjście odrzucone po await:** writer musi respektować anulowanie również
  przy spóźnionych wynikach renderowania.

Przykładowa reguła dla istniejącego przejścia po subskrypcjach:

```typescript
if (isDisposed(subscriber) || !belongsToCommittedOutput(subscriber)) {
  continue;
}
```

Szczegóły określania zatwierdzonego wyjścia wymagają zaprojektowania.
Właściciel częściowo streamowanego zakresu nie oznacza automatycznie,
że wszystkie jego potomne subskrypcje zostały zatwierdzone.

## Wydajność i pamięć

Oczekiwane korzyści, wymagające pomiarów:

- brak osobnego przejścia grafu przed serializacją;
- brak map użytkowników każdego korzenia i liczników zgłoszeń;
- zachowanie istniejącego deduplikowania i przyrostowego zapisu;
- brak utrzymywania prywatnych wartości odrzuconego wyjścia przez globalny
  magazyn korzeni;
- wykorzystanie istniejących rekordów wyjścia zamiast nowego wrappera
  i dodatkowej alokacji dla każdego capture.

Wartości odroczonego wyjścia pozostają w pamięci tak długo, jak wymagają tego
renderowanie i buffering OOOS. Propozycja nie usuwa tego podstawowego kosztu.
Nie obiecujemy obniżenia kosztów bez benchmarku obejmującego czas, alokacje
oraz szczytowe zużycie pamięci.

## Weryfikacja przed wyborem rozwiązania

- Prywatny Error w sygnale odrzuconej, niewysłanej zawartości nie trafia do stanu.
- Streaming z Catch i Pending wewnątrz działa przed zakończeniem wolnej części.
- Catch wewnątrz odroczonego Pending nie ujawnia stanu w shellu.
- Dane wcześniej wysłanej części pozostają poprawne po późniejszym błędzie.
- Współdzielenie bezpośrednie i pośrednie zachowuje tożsamość obiektów.
- Zagnieżdżone Catch, błąd fallbacku i spóźnione wyniki nie publikują odrzuconej pracy.
- Połączenie subskrypcji do wcześniej wysłanego sygnału działa po zimnym resume.
- Refs, zadania, eager resume, projekcje, cykle i forward refs przechodzą round-trip.
- Benchmark porównuje istniejący kod i prototyp przy wielu małych segmentach
  oraz dużych odrzucanych poddrzewach.

## Granica gwarancji

Wycofanie dotyczy niewysłanego wyjścia i jego prywatnych rejestracji.
Nie cofa wysłanych bajtów ani zmian dokonanych w współdzielonym, żywym stanie.
Jeżeli opublikowany stan silnie odwołuje się do wartości, wartość jest częścią
zachowanego grafu i musi pozostać dostępna.
