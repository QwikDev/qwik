# Serializacja SSR: publikacja, anulowanie i wydajność

Status: przegląd kodu i próby algorytmu; rekomendacja bez implementacji produkcyjnej.

## Cel i granica gwarancji

Catch pozwala streamować odpowiedź, również z Pending wewnątrz. Odrzucone,
niewysłane wyjście nie publikuje swoich prywatnych korzeni. Korzenie potrzebne
wcześniej wysłanemu wyjściu zachowują ID, a współdzielone obiekty zachowują
tożsamość również po wcześniejszym resume.

Nie cofamy bajtów ani zmian aplikacji w żywych, współdzielonych obiektach.
Wartość silnie osiągalna z zachowanego stanu jest częścią zachowanego grafu.

Rejestracja korzeni podczas spekulatywnego renderowania musi zostać zastąpiona
referencjami do wartości w wyjściu. To obejmuje captures, konteksty, projekcje,
zadania, refs, eager resume, boundary subscriptions i event metadata.

Publikacja HTML i publikacja jego stanu to dwa momenty. ID już wypisane w HTML
pozostaje zarezerwowane, nawet gdy jego stan nie został jeszcze wysłany.
Checkpoint korzeni nie może być utożsamiany z `$rootStateRootCount$`.

## Zakres przeglądu

Przejrzane ścieżki:

- `serialization-context.ts`: roots, seen, promocje, metadane i liczniki;
- `serialize.ts`: przejście grafu, QRL, typy reaktywne, owners, Promise,
  SerializerSignal, przyrostowy zapis i subskrypcje;
- `allocate.ts`, `inflate.ts`, `container-context.ts`: alokacja, cykle,
  lazy resume, promocja ścieżek i dołączanie subskrypcji;
- SSR event attrs, refs, scheduler, output writer, preloader i emitter;
- shell oraz ścieżka publikowania pakietów OOOS.

208 istniejących focused testów przeszło. Dodatkowe tymczasowe próby:
10 przeszło, 1 wykazała utratę tożsamości przy późnej promocji obiektu.
Próby zapisano w `/private/tmp/qwik-serialization-audit.unit.ts` i usunięto
z checkoutu. Nie jest to pełna walidacja nowej implementacji.

## Potwierdzone problemy i koszty

### Późna promocja nie zachowuje tożsamości po wcześniejszym resume

Przypadek:

1. Pierwszy stan zawiera `{ shared: { value: 1 } }`.
2. Klient odczytuje rodzica i alokuje `parent.shared` inline.
3. Kolejny pakiet promuje ten sam serwerowy obiekt do osobnego root ID.
4. Odczyt tego ID daje równy, ale inny obiekt: `restored !== parent.shared`.

Istniejące testy promocji obejmują przede wszystkim odczyt po dostępności
obu fragmentów. Sam serwerowy journal lub overlay nie naprawi tego przypadku.

Docelowo reader musi rozpoznawać już zaalokowaną wartość źródłowego slotu
podczas promocji. Powinien zachować jej canonical shell oraz informację
o trwającym inflate. Szczegółowa reprezentacja cache slotów wymaga prototypu;
nie wystarczy sprawdzanie `liveRoots`, bo obiekt inline nie ma własnego ID.

### Obserwowanie Promise może mieć koszt kwadratowy

`outputPendingRoots()` ponawia `Promise.race(this.$promises$)`.
Dla N wyników kończących się kolejno podpina obserwatory dla N, N-1, ...,
1 Promise. Próba z 8 Promise wykazała 44 wywołania `.then`: 8 obserwatorów
wyników oraz 36 z kolejnych race.

Wynik zależy od kolejności zakończeń: Promise kończące się w jednej grupie
mikrozadań nie zawsze uruchamiają ten najgorszy przypadek.

Lepszy mechanizm: jeden obserwator wyniku na Promise, kolejka gotowych wyników,
licznik oczekujących oraz pojedynczy sygnał budzący serializer.

### Tabela forward refs jest wysyłana ponownie

8 pakietów, każdy z jednym nowym Promise, przekazało tabele o długości
1, 2, ..., 8: łącznie 36 wpisów. Pakiet bez nowego Promise także zawierał
wcześniejszą tabelę. Obecny reader zastępuje cache ostatnią pełną tabelą.

Zmiana na przyrost tabeli wymaga aktualizacji czytnika. Obiecująca alternatywa
to rezerwowanie root ID bezpośrednio dla wartości asynchronicznej.

### Skrócenie roots nie jest rollbackiem

Po skróceniu `$roots$` i `$rootObjs$` mapa seen nadal zwracała usunięte ID.
Po rozwiązaniu wcześniej obserwowanego Promise jego callback ponownie
dopisał korzeń. Pozostał także rozjechany kursor serializera.

Anulowanie musi najpierw zatrzymać starą operację. Wszystkie spóźnione callbacki
muszą sprawdzać token przed dotknięciem map, kolejek i korzeni.

### Wyjście nie jest jedyną drogą do prywatnego stanu

Próba z opublikowanym sygnałem dotarła do captures niewysłanego
`SsrTextExpressionEffect` przez `signal.subs`, mimo że efektu nie dodano
explicit do roots. Istniejący filtr pending content nie obejmuje tego efektu.

W serializerze należy zachować wyłącznie subskrypcje już opublikowane
albo należące do zatwierdzanego wyjścia. Przynależność do właściciela lub lane
nie dowodzi, że wszystkie jego potomne efekty są publikowane.

## Rekomendacja: jeden writer i journal zmian

Poprzedni pomysł prywatnego overlay jest możliwy, ale przy jednym writerze
można użyć jednej mapy seen i dziennika zmian. Renderer nie może wtedy
odczytywać ani zmieniać wewnętrznego kontekstu serializacji podczas przygotowania.

Stan trwały odpowiedzi:

- korzenie potrzebne zatwierdzonemu wyjściu i ich seen refs;
- metadane już opublikowanych handlerów;
- stabilne pozycje owner items;
- deduplikacja QRL, jeżeli zachowujemy ją między pakietami.

Stan jednej operacji:

- checkpoint korzeni i liczników;
- journal zmian seen refs oraz innych mutowalnych tabel;
- bufor wyniku;
- kursor przejścia, pending count, gotowe wyniki i token anulowania;
- zbiór subskrypcji dozwolonych dla tego pakietu.

Odczyt seen nadal wykonuje jedno `Map.get()`. Zapis zapamiętuje poprzednią
wartość klucza. Promocja istniejącego SeenRef zapamiętuje poprzedni index
i parent, ponieważ referencje do tego samego rekordu mogą istnieć w innych
rekordach seen. Journal cofamy od końca, przed skróceniem korzeni.

Na sukcesie nie scalamy dodatkowej mapy. Przy błędzie koszt rollbacku jest
proporcjonalny do zmian tej operacji. Nie używamy closures per wpis journalu.

Stabilny cache pozycji owner items może pozostawać między próbami: jego klucze
są słabe, a pozycje służą zachowaniu kolejności, nie są root IDs. Nie trzeba
kopiować całej tej tabeli do draftu; zachowanie pozycji wymaga testów disposalu,
ponownego renderowania i odczytu w odwrotnej kolejności.

### Publikacja OOOS

```typescript
async function publishPacket(packet: Packet): Promise<boolean> {
  if (packet.signal.aborted) {
    return false;
  }

  const batch = serialization.beginPacket();
  try {
    // Wszystkie rejestracje i zmiany kontekstu należą do tej operacji.
    const html = materializeOutput(packet.output, batch);
    const state = await batch.serialize(packet.signal);
    const frame = prepareFrame(state, html, batch.metadata);

    if (packet.signal.aborted) {
      batch.rollback();
      return false;
    }

    // Bez await i kodu aplikacji między kontrolą a rozpoczęciem zapisu.
    batch.commit();
    await writeFrame(frame);
    return true;
  } catch (error) {
    if (batch.isCommitted) {
      throw abortResponse(error);
    }
    // serialize musi już zakończyć własne await/finally.
    batch.rollback();
    if (packet.signal.aborted) {
      return false;
    }
    throw error;
  }
}
```

Anulowanie pochodzi od każdego otaczającego Catch. Rendering fallbacku może
ruszyć od razu, lecz jego serializacja czeka na zakończenie i rollback starej
operacji. Stara operacja musi reagować na anulowanie także przy Promise,
który nigdy się nie kończy. Kolejny pakiet nie zaczyna serializacji wcześniej.

Po rozpoczęciu zapisu nie cofamy pakietu. Kończymy jego frame; późniejszy błąd
publikuje fallback jako kolejny frame. Awaria transportu przerywa odpowiedź.

## Kandydat do uproszczenia asynchronicznej serializacji

Każda wartość asynchroniczna dostaje docelowe root ID przy pierwszym spotkaniu.
W środku zwykłego obiektu emitujemy `RootRef` do tego ID. Wartość tego korzenia
kodujemy, gdy jej wynik jest gotowy. Gotowe korzenie można kodować niezależnie,
a bufor wyników składa się w porządku ID dopiero przed publikacją.

Przykład:

```text
root 0: Array [RootRef 1, RootRef 1]
root 1: Promise [true, Object { n: 7 }]
```

Obecny reader poprawnie odczytał taki stan bez ForwardRefs i zachował
tożsamość współdzielonego Promise. Przeszedł także wariant rejected Promise.

Potencjalne uproszczenia:

- brak osobnego ID i tabeli forward refs dla nowo kodowanych Promise;
- brak dodatkowego korzenia PromiseResult wskazywanego przez ForwardRef;
- jedna obserwacja wyniku zamiast kolejnych Promise.race;
- cały stan oczekiwania lokalny dla pakietu;
- anulowanie porzuca lokalne wyniki i blokuje spóźnione callbacki.

Zachowujemy istniejące numeric TypeIds i odczyt starszego ForwardRef.
To nie jest zweryfikowana implementacja encodera. Obowiązkowo sprawdzić:
async SerializerSignal z owner/deps, wyniki odkrywające kolejne Promise,
QRL captures, cykle, boxed Promise oraz kolejność root bufferów.
Nie wolno zatrzymywać discovery całego grafu na pierwszym niewypełnionym root.

## Pomiary porównawcze

### Overlay kontra journal — sam rejestr

Node, 100 000 istniejących kluczy, 20 000 lookupów na operację. Mediana 31 prób
po rozgrzewce, GC przed pomiarem. To mikrobenchmark map, nie SSR ani wszystkich
mutacji istniejącego serializera. Journal w próbie zapisuje nowe klucze oraz
poprzednie wartości, a osobny self-check pokrywa overwrite i reverse rollback.

| Nowe wpisy | Overlay, sukces | Journal, sukces | Overlay, heap przy oczekiwaniu | Journal, heap przy oczekiwaniu |
| ---------- | --------------: | --------------: | -----------------------------: | -----------------------------: |
| 20 000     |         2,82 ms |         1,73 ms |                        1,56 MB |                        1,08 MB |
| 4 000      |         2,32 ms |         1,56 ms |                         247 KB |                         214 KB |
| 200        |         1,04 ms |         0,87 ms |                        14,4 KB |                        11,4 KB |

Rollback zależy od profilu. Przy 4 000 nowych wpisów overlay było szybsze:
0,93 ms wobec 1,61 ms journalu. Heap to przyrost po GC, nie peak RSS.
Wyniki uzasadniają prototyp journalu, nie dowodzą przewagi całego SSR.

### Buforowanie rzeczywistego serializera

Każdy wariant wygenerował identyczny stan. Mediana 15 prób po rozgrzewce.

| Wejście        |       Fragmenty tokenów |         Bloki ~8 KB |     Jeden string |
| -------------- | ----------------------: | ------------------: | ---------------: |
| 20 000 liczb   |  2,38 ms / 40 004 wpisy | 2,01 ms / 19 wpisów | 1,90 ms / 1 wpis |
| 2 000 rekordów | 3,09 ms / 34 009 wpisów | 2,85 ms / 11 wpisów | 2,72 ms / 1 wpis |

Mniej wpisów w tablicy nie dowodzi mniejszego całkowitego heap: konkatenacja
może pozostawiać ropes i inne obiekty silnika JS. Wybór writera wymaga pomiaru
peak heap/RSS i kosztu spłaszczenia przy realnym zapisie do transportu.

### Wszystkie obiekty jako korzenie

Próba na istniejącym encoderze prerejestrowała obiekty i sprawdziła round-trip.
Porównuje rozmiar reprezentacji; dodatkowe przejście wyklucza rzetelne
porównanie szybkości docelowego encodera.

| Wejście                             | Inline: roots / znaki stanu | Wszystkie roots: roots / znaki stanu |
| ----------------------------------- | --------------------------: | -----------------------------------: |
| Drzewo 511 obiektów                 |                   1 / 7 665 |                         511 / 10 617 |
| 1 000 rekordów z nested value       |              1 002 / 44 689 |                       2 002 / 51 689 |
| 1 000 referencji do jednego obiektu |                   2 / 4 020 |                            2 / 4 020 |

Zachowanie inline dla zwykłych, jednorazowych obiektów ogranicza stan oraz
liczbę rootów obsługiwanych przez reader. Wariant all-roots upraszcza referencje,
ale nie ma obecnie dowodu przewagi czasu ani całkowitej pamięci.

## Lokalne uproszczenia

- Budowanie ścieżki przez `push()` i `reverse()` zamiast powtarzanego `unshift()`:
  liniowy koszt względem głębokości.
- `$rootObjs$` i `$onAddRoot$` nie mają obecnie produkcyjnych konsumentów poza
  własną implementacją. Journal może zastąpić potrzebę równoległej tablicy.
- Nieutrzymywanie poprzednich buforów stanu po wysłaniu.
- Kodowanie per-root może pozwolić na podział skryptów bez pełnego
  JSON.parse/slice/JSON.stringify w emitterze.
- Scheduler ma planować pracę; decyzja o publikacji zadania należy do wyjścia.
- Publikacja powinna korzystać z metadanych wyjścia, ograniczając ponowne
  przechodzenie drzew ownerów w collectDeferredSubscriptions.

To kandydaci do osobnych, mierzonych zmian. Nie wymagają RootRegistry
ani metadanych użytkowników na każdym Root.

## Weryfikacja docelowej implementacji

- Błąd Catch przed serializacją, podczas await, tuż przed zapisem i po nim.
- Cancel podczas Promise, który nigdy się nie kończy, oraz spóźnione wyniki.
- Zagnieżdżone Catch, błąd fallbacku, projekcje i Pending w obu układach.
- Rollback nowego wpisu seen, promocji, wielokrotnego overwrite i QRL dedup.
- Shared signal nie publikuje niewysłanych efektów innych pakietów.
- Późna promocja przed i po odczycie rodzica, w trakcie inflate oraz przez
  pośrednie root refs; obiekt, array, QRL, Promise i typy reaktywne.
- Tasks, eager resume, refs, owner order i subscription updates po zimnym resume.
- Aktualne escaping JSON/script/atrybutów i odrzucanie unsupported types.
- Benchmark całego SSR: statyczne i reaktywne drzewa, wiele małych pakietów,
  silne współdzielenie, duże porzucane drzewa oraz staggered Promise.
- Pomiar czasu, allocation rate, peak heap, RSS i rozmiaru odpowiedzi na Node
  i pozostałych wspieranych runtime; osobno koszt readera w przeglądarce.

Obecny createSsrCatch nadal blokuje deferral. Routing błędów odroczonych zakresów
do Catch i publikacja jego fallbacku wymagają osobnej integracji; zmiana
serializera nie włącza tego automatycznie.

## Automatyczny dobór kodeków i tree shaking

Wymaganie: zwykłe `_serialize(value)` automatycznie obsługuje cały faktyczny
graf. Użytkownik nie dostarcza listy kodeków. Kompilator może optymalizować
ich ładowanie, lecz jego analiza nie jest warunkiem poprawności.

### Potwierdzenie obecnego problemu

Izolowany esbuild browser bundle z produkcyjnymi flagami, minifikacją i tree
shakingiem: `new Signal(1)` zatrzymał 3 061 B, a `_serialize(new Signal(1))`
135 700 B. Drugi wynik zachował m.in. serialize, allocate, inflate, store,
computed, task, slot i Catch. To próba źródeł bez code splittingu i kompresji,
nie pomiar opublikowanego buildu ani początkowego pobierania aplikacji.

Metafile i entry points są w `/private/tmp/qwik-*-bundle-meta.json` oraz
`/private/tmp/qwik-serdes-treeshake.cjs`.

### Podział odpowiedzialności

```text
serdes/
  engine.ts              identities, roots, traversal, journal, async results
  writer.ts              JSON output and escaping
  reader.ts              root lookup, allocation lifecycle, canonical slots
  codecs/
    encode-signal.ts
    decode-signal.ts
    encode-store.ts
    decode-store.ts
    ...
  native-codecs.ts        lazy resolution for built-in JS types
  ssr-codecs.ts           server composition and publication policy
```

Silnik nie importuje klas Signal, Store, Task ani plików boundary.
Encoder nie importuje readera. Encoder sygnału używa type-only importu Signal.
SSR dostarcza osobno politykę publikowania subskrypcji.

### Typ Qwik udostępnia własny loader encodera

Lekki hook znajduje się na prototypie, bez pola na każdej instancji i bez
globalnego `registerCodec()` wykonywanego przy imporcie. Symbol jest wspólny
dla kopii tej samej wersji Qwik przez istniejący mechanizm `qwikSymbol`.

Schemat, nie gotowe API:

```typescript
const ENCODER = qwikSymbol('encoder');

class Signal<T> {
  [ENCODER]() {
    return getSignalEncoder();
  }
}

let signalEncoder: Encoder | Promise<Encoder> | undefined;

function getSignalEncoder(): Encoder | Promise<Encoder> {
  return (signalEncoder ??= import('./codecs/encode-signal').then((module) => {
    return (signalEncoder = module.encodeSignal);
  }));
}
```

Loader cache'uje wyłącznie kod/Promise importu, bez wartości aplikacji ani
kontekstu serializacji. Wybór zachowania po nieudanym imporcie wymaga
explicit policy; sygnał anulowania pakietu nie powinien niszczyć wspólnego
cache modułu. Serializer nie uruchamia encodera po anulowaniu swojego pakietu.

Silnik wykonuje bazowe dispatch dla primitives, arrays i plain objects,
oraz odczytuje opcjonalny hook wartości Qwik przed traktowaniem jej jako
zwykłego obiektu. Dla Store proxy hook musi zostać obsłużony w get trap bez
trackingu i bez dodawania go do surowego obiektu użytkownika. Typy pochodne
mają własny hook, aby np. Computed nie wybrał encodera Signal.

Import klasy Signal referencjonuje tylko jej loader. Jeżeli cała klasa zostaje
usunięta przez tree shaking, może zostać usunięty również loader i chunk kodeka,
o ile żaden inny entry point go nie referencjonuje. Jeżeli Signal jest używany,
chunk encodera może być emitowany, ale klient pobiera go przy serializacji.
Na kolejnych spotkaniach typu loader zwraca gotową funkcję synchronicznie.

Nie dodajemy runtime importu encodera do klasy ani pełnej tabeli frameworkowych
encoderów do silnika. Kompilator/bundler muszą zachować granice chunków,
bez wymuszania jednego wspólnego runtime chunk dla wszystkich kodeków.

### Graf odkrywa potrzebne kodeki automatycznie

```typescript
await _serialize(signal);
```

Dla Signal<number> silnik ładuje encoder Signal. Dla Signal<Store> wchodzi
w wartość sygnału i ładuje także encoder Store. Te same ID, journal i token
anulowania obejmują cały graf, niezależnie od liczby doładowanych kodeków.

Built-in JS types, np. Date/Map/Set, wymagają lekkiego rozpoznawania i lazy
resolvera, ponieważ nie modyfikujemy globalnych prototypów. W pełni dynamiczny
resolver może utrzymać odpowiadające mu chunks w buildzie; nie są jednak
pobierane z góry. Jest to lazy loading, odrębne od statycznego tree shakingu.

Custom code korzystający z wartości Qwik działa bez analizy kompilatora.
Istniejący SerializerSymbol customowych klas może nadal zwracać reprezentację,
którą dalej przechodzi ten sam silnik. Nie oznacza to automatycznej obsługi
dowolnej klasy bez jej dotychczasowego kontraktu serializacji.

### Kompilator jako opcjonalna optymalizacja

Kompilator może automatycznie wygenerować static encoder binding lub preload
w miejscu serializacji/QRL, jeżeli rozpoznaje typ. Nie ogranicza tym zbioru
wartości wspieranych przez `_serialize`. Wartości unknown, późniejsze mutacje,
wyniki custom serializacji i graf odkryty po await nadal używają hooków.

Domyślny poprawny wariant nie wymaga takiej transformacji. Wersja SSR może
składać znane encodery statycznie, unikając dynamic imports na gorącej ścieżce.
Dobór bezpiecznej granicy tego server-only importu wymaga próby bundla.

### Reader dobiera decoder z wire TypeId

Po stronie odczytu TypeId jest znany ze stanu. Loader dobiera decoder tego
typu, bez importowania jego konstruktora do centralnego readera. Potrzebne
decodery ładuje i cache'uje automatycznie. Nie zakładamy, że klient wcześniej
wywołał konstruktor Signal albo że kompilator widział serwerowy graf.

Pełny reader dla nieznanych payloadów może referencjonować wszystkie decoder
chunks. Granica obietnicy: pobiera tylko te potrzebne do odczytywanych wartości;
pełne usunięcie wszystkich pozostałych typów z buildu wymaga wiedzy statycznej.

### Weryfikacja przed implementacją

- Browser production bundle: Signal bez serializacji, serializacja Signal<number>,
  Signal<Store> oraz reader sygnału bez wcześniejszego importu jego klasy.
- Brak store/task/Catch w statycznej zależności engine i encode-signal.
- Brak allocate/inflate w dependency graph encodera.
- Metafile i pobrane chunks w rzeczywistym Qwik/Vite buildzie, z code splittingiem.
- Usunięcie nieużywanej klasy usuwa jej provider, jeżeli nie jest potrzebny indziej.
- Custom code, subclass, Store proxy i kilka kopii tej samej wersji Qwik.
- Pierwszy import, cache, równoległe próby, błąd importu i cancel podczas ładowania.
- Brak wywołania encodera z odrzuconego pakietu po zakończeniu importu.
- Koszt odczytu hooka i dispatchu na gorącej ścieżce, bez pola per instancja.

Automatyczny hook zastępuje wcześniejszą propozycję wymagania listy kodeków
od użytkownika. Jawne składanie jest szczegółem implementacji SSR lub
optymalizacji kompilatora, nie obowiązkiem kodu aplikacji.

## QRL jako referencja do kodeka

Preferowany wariant ładowania kodeków korzysta ze współdzielonych,
bez-capture QRL. Zastępuje to ręczny cache encodera z poprzedniego pseudokodu.
Dynamic import pozostaje mechanizmem ładowania modułu pod QRL; nie tworzymy
drugiego, niezależnego systemu preloadu ani cache kodu.

Hook typu zwraca QRL encodera. Jedna referencja na typ/module copy, bez
alokacji per instancja sygnału ani per odwiedzona wartość. Encoder i decoder
mają osobne referencje, aby zapis nie referencjonował kodu odczytu.

Schemat wywołania przez silnik:

```typescript
function writeWithCodec(batch: Batch, value: unknown, codec: QRL<Encoder>) {
  const encode = codec.resolved;
  if (encode !== undefined) {
    encode(batch, value);
    return;
  }
  batch.waitForCodec(value, codec.resolve());
}
```

`waitForCodec` używa lokalnego stanu oczekiwania pakietu. Po resolve sprawdza
token anulowania przed kodowaniem wartości. Sam wspólny cache kodu może
zostać uzupełniony także po anulowaniu pakietu, ponieważ nie zawiera jego danych.

Nie wywołujemy callable wrappera QRL na każdej wartości: obecny makeQrlFn
tworzy async function. Używamy resolved encodera bezpośrednio. Nie jest potrzebne
capture binding ani przełączanie invoke context dla kodeka; jego kontekst
serializacji i wartość są jawnymi argumentami.

### Preload

- Kompilator/linker może dodać zależność handlera wykonującego serializację
  od kodeków typów, które rozpoznał, do grafu bundle/preload.
- Przy zatwierdzaniu stanu SSR można przekazać preload decoderów faktycznie
  użytych typów. Hints dla odrzuconego pakietu nie trafiają do odpowiedzi.
- Typy odkryte dopiero w customowym kodzie lub po await rozwiązują swój QRL
  automatycznie. Brak wcześniejszej podpowiedzi kompilatora nie wpływa na poprawność.
- Loader pozostaje fallbackiem, gdy preload jest wyłączony, spóźniony albo
  nie obejmował danego typu. Pierwszy resolve może być asynchroniczny po preloadzie.

Obecny LazyRef wywołuje preload z wagą 0.8 przy tworzeniu QRL z chunk metadata,
oraz z wagą 1 przy jego ładowaniu. Tworzenie wszystkich codec QRL przy inicjalizacji
modułów powodowałoby zbyt szerokie preloading. Lazy creation referencji i osobne
hints powinny odróżnić użycie Signal od potrzeby serializacji Signal.

Obecny createPreloaderTail zbiera event QRL. Kodeki nie powinny być dodawane
do `$eventQrls$` jako udawane listenery. Integrujemy je przez graf zależności
lub osobne preload hints publikowanego pakietu.

### Granice integracji

- Eksporty kodeków muszą trafić do grafu i odpowiednich chunków w buildzie
  biblioteki/aplikacji. Sam prototypowy hook nie wykonuje tej transformacji.
- Entry point serializacji poza containerem potrzebuje QRL z importerem
  wygenerowanym przez build albo jawnie ustalonego kontekstu rozwiązywania URL.
  Obecny importSymbol dla chunk+symbol wymaga container element po stronie client.
- SSR otrzymuje referencje z gotowym symbolRef lub static encodery, aby omijać
  asynchroniczne ładowanie na gorącej ścieżce.
- Wspólny silnik ma type-only zależność od interfejsu QRL i nie importuje
  wszystkich providerów ani kodeków.
- Preloader i bundler muszą zachować osobne chunks kodeków; wymuszenie jednego
  runtime chunk zniweczy cel mimo użycia QRL.

Do sprawdzenia w prototypie: rozmiar zależności QRL, jeden ref na typ,
resolved fast path, cold loading, network waterfall przy złożonym grafie,
preload bez późniejszej serializacji, wyłączony preloader, cancel podczas resolve,
serializacja poza containerem i cold resume decoderów.
