# Etap 1: publikacja stanu SSR przez Catch

Wdrożenie na gałęzi `v3`, baseline `542ddca39`. Bez changesetów i pushowania. Publiczne `Catch`, `Pending`, `_serialize()` i `_deserialize()` oraz numery `TypeIds` pozostają bez zmian.

## Zaimplementowany algorytm

Rendering tworzy symboliczne referencje do wartości, eventów i jednostek publikacji. `nextId()` nadal przydziela niezależne ID zakresów i elementów DOM. Writer przydziela root ID dopiero wybranemu wyjściu.

Jednostka publikacji zawiera jawne korzenie, własną subscription i bezpośrednio należące do niej zadania/efekty. Potomne jednostki są wybierane przez writer osobno. Puste gałęzie warunkowe także publikują subscription. Scheduler nie rejestruje korzeni przy `notify()`.

`publishFrame()` jest wspólnym punktem zatwierdzania:

```text
checkpoint + token anulowania
→ wybór jednostek i materializacja HTML
→ serializacja nowych korzeni, q:sub i metadanych
→ przygotowanie całego frame
→ sprawdzenie anulowania i generacji Catch
→ commit + rozpoczęcie stream.write(), bez await pomiędzy nimi
→ oczekiwanie na zakończenie zapisu
```

Journal zapisuje nowe klucze seen map w jednej tablicy oraz undo zmian wcześniejszych referencji, map, metadanych i kursorów. Promocja zachowuje existing `SeenRef`. Undo pól `$...$` używa bezpośrednich przypisań, żeby działał produkcyjny property mangling. Rollback następuje dopiero po zakończeniu serializer `finally`.

Shell bez opublikowanego `Catch` ma token anulowania i ten sam writer, ale pomija journal: jego błąd kończy odpowiedź, bez kolejnej operacji odzyskiwania. Wszystkie pakiety OOOS i wyjście `Catch` mają journal. To usuwa koszt zapisywania całego grafu zwykłego SSR.

Korzenie shella są trwałe po rozpoczęciu zapisu HTML z ich ID. Późniejsza serializacja ma checkpoint po tych rejestracjach; `$rootStateRootCount$` nie wyznacza ich granicy rollbacku. Wycofanie odrzuconego pakietu nie zmienia opublikowanych ID. Trwały, wycofany subscriber może mieć payload `undefined`; reader toleruje jego disposal.

## Catch, streaming i anulowanie

`Catch` nie wyłącza odraczania. Zwykła asynchroniczna zawartość nadal jest oczekiwana, ale odroczony `Pending` publikuje placeholder i kończy później niezależnym pakietem.

Kontroler `Catch` przekazuje generację przez kontekst zakresu/lane. Błąd unieważnia generację, anuluje zależną operację, potomne lane/records/backpatches, usuwa je z kolejek i powiadamia Reveal. Przed publikacją writer wybiera fallback inline; po publikacji wysyła replacement z nową subscription i disposal starej. Fallback należy do zewnętrznego `Catch`.

Po rozpoczęciu zapisu frame kończymy ten zapis, również przy backpressure. Kolejny błąd publikuje następny frame z fallbackiem; błąd transportu kończy odpowiedź.

Spóźnione callbacki serializerów i deferred records posiadają odłączalne obserwacje. Anulowanie budzi także oczekiwanie na never-settling Promise. Bufory, grafy i callbacki kontekstu są odłączane przy zamknięciu operacji. Stare odrzucenie `DomEffect.trackPromise()` nie trafia do bieżącej generacji.

Serializer dopuszcza tylko opublikowane lub wybrane subskrypcje, pomijając disposed i niewysłane jednostki. `q:sub` powstaje z bieżącego wyboru, również dla wcześniej wysłanych źródeł. Produkcyjny fallback dostaje bezpieczny komunikat i digest; klasyfikacja błędu toleruje revoked Proxy.

## Poprawki po review

- Rollback pobranych backpatches respektuje anulowanie lane; dla żywego lane zachowuje również patche dodane po checkpoint. Regresja pobiera patche, wywołuje błąd Catch i sprawdza całą odpowiedź. Usunięcie warunku anulowania celowo odtworzyło wyciek `PRIVATE_DISCARDED_PATCH`.
- Kompilator emituje bezpośrednio `ctx.addRoot(row)` dla parametrów eventu. Snapshoty i cold-resume sprawdzają liczbowe `q:p` oraz przekazanie właściwego wiersza do handlera.
- Root jest rozpoznawany jako subscriber przez istniejącą tożsamość brandowaną, zamiast przez pola `kind` i `flags`. Zwykłe oraz zamrożone dane aplikacji nie są mutowane. Projekcje i zadania nadal są wybierane do publikacji.
- Pakiet OOOS przygotowuje captures `_res` przed serializacją. Metadane `q:idle` są aktywowane jako `q-d:qidle` dopiero po podmianie DOM i przygotowaniu korzeni. `_res` powiadamia odtworzone subskrypcje także wtedy, gdy computed zdążył już obliczyć wartość. Produkcyjny test zwalnia Pending po shellu i sprawdza automatyczną zmianę tekstu `1` → `17`.
- Obserwacje renderu są odłączalne. Anulowanie usuwa callbacki i referencje, kończy własne oczekiwania, a późniejszy wynik jest ignorowany. Trzy regresje WeakRef/GC obejmują Promise zwrócony, rzucony i zagnieżdżony; oryginalny Promise pozostaje osiągalny i nierozwiązany podczas GC.
- Usunięto nieużywane pole `SsrCatchController.subscription` oraz przypisania.

## Druga runda review

- Akumulator patchy kopiuje tablicę pierwszego lane tylko przy aktywnym journalu. Undo rodzica nie zawiera patchy anulowanego dziecka; ścieżka bez journala nie kopiuje tablicy. Regresja odtworzyła wyciek `PRIVATE_CANCELLED_CHILD_PATCH` w całej odpowiedzi przed poprawką.
- Istniejący observer renderu został przeniesiony do wspólnych helperów Promise jako `CancellableOperation`. Taski odłączają obserwacje przy disposal, kończą własne oczekiwania i sprawdzają disposal przed ponownym wywołaniem. Cleanup przed serializacją korzysta z `runTaskCleanups()`, bez wykonywania disposal tasku. Regresje obejmują Promise zwrócony/rzucony, brak ponownego uruchomienia oraz GC kontekstu przy nadal osiągalnym, nierozwiązanym Promise.
- Transakcja obserwuje async cleanup przez `waitFor()`. Anulowanie odłącza oczekiwanie i pozwala wycofać frame oraz wysłać fallback. Regresja zgłasza błąd rodzeństwa podczas cleanupu task/computed, sprawdzając zakończenie odpowiedzi przed rozwiązaniem cleanup Promise. Usunięcie tej obserwacji ponownie zablokowało wariant computed.
- Catch i Pending korzystają z wyjścia rozwiązanego już przez `SSRContent.run()`. Usunięto oba dodatkowe przebiegi `resolveSsrOutput()`.

Nie przerywamy natywnego wykonania funkcji cleanup aplikacji; przestajemy oczekiwać na nią w anulowanym frame.

## Trzecia runda review

- Definicje `sync$` z Catch są zbierane dopiero podczas przygotowania jego frame. Journal obejmuje rejestrację i emisję; backpressure przed wyborem zakresu nie ujawnia źródła odrzuconego handlera.
- Style SSR są przypisane do istniejącego ownera jednostki publikacji przez leniwy `WeakMap`. Wybrana jednostka przenosi je do journalowanej mapy emisji. Niewysłane jednostki Catch nie trafiają do styli shella; fallback publikuje własne style. Bez `useStyles()` dodatkowy przebieg wyboru jest pomijany.
- `_await` obserwuje wynik przez odłączalny token. Disposal ownera albo samego subscribera zeruje collector, invoke context i owner w tokenie. Test GC porównuje `_await` ze zwykłym `await`; funkcje użytkownika powstają poza closure renderu, aby kontrola nie zatrzymywała kontekstu niezależnie od helpera.
- Computed ma anulowalną operację jobu obejmującą oczekiwanie i retry. Abort budzi frameworkowe oczekiwanie i blokuje kolejne wywołanie funkcji; testy obejmują zwrócony i rzucony Promise, GC oraz timeout.
- Emitery początkowego SSR dla tekstu, atrybutów, props i eventów oraz komponenty, gałęzie i kolekcje obserwują async pracę w lifetime istniejącego ownera. Disposal kończy oczekiwanie, odłącza callbacki i blokuje retry/następny wiersz. Mechanizm backpatchy pozostaje osobny.
- Cleanup dodany do disposed tasku lub zakończonego jobu computed wykonuje się od razu. Nie trafia na listę, której nikt już nie opróżni.
- Cleanup shella korzysta z anulowalnego oczekiwania transakcji bez journala. Błąd Pending podczas never-settling cleanup pozwala wysłać fallback i zakończyć odpowiedź przed rozwiązaniem cleanup Promise.

Koszt operacji ownera ponosi rzeczywiste oczekiwanie async. `thenUntilDisposed()` zwraca synchroniczny wynik bez `OwnerOperation`, `Set` i callbacków anulowania; `retryUntilDisposed()` najpierw wywołuje kod i tworzy operację dopiero dla zwróconego/rzuconego Promise. Komponent zachowuje własny fast path. Guardy sprawdzają disposal przed retry oraz publikacją; późne odrzucenie po reentrant disposal jest obserwowane bez retry. Kontroler generacji pozostaje w Catch; zwykły SSR nie wyszukuje boundary na ścieżce sukcesu.

Resolver tworzy tablicę dopiero po zmianie potomka. Writer używa stosu tablic i indeksów bez obiektu na każdy fragment. Bufor Catch łączy fragmenty w bloki po 256, zachowując atomowe zatwierdzenie całego frame. Regresje sprawdzają kolejność 1000 elementów, niemutujący odczyt zagnieżdżonych Promise oraz odrzucenie już przygotowanych bloków po późnym błędzie metadanych.

Framework odłącza swoje obserwacje. Nie zatrzymuje własnych kontynuacji `async` użytkownika ani wykonywanego cleanup aplikacji bez jej współpracy.

## Leniwe operacje SSRContent, tasków i computed

`CancellableOperation` powstaje dopiero przy pierwszym Promise. Dwa helpery pracują na istniejącym lifetime: subscription SSRContent, recordzie tasku albo jobie computed. Synchroniczne wykonanie i cleanup nie tworzą dodatkowej operacji ani jej Set oczekiwań; gettery lifetime nie tworzą osobnego wrappera.

`thenInLifetime()` wykonuje kontynuację synchroniczną bez operacji. `retryInLifetime()` najpierw uruchamia funkcję; dopiero zwrócony albo rzucony Promise pobiera leniwą operację. Import QRL, async cleanup i zagnieżdżony Promise wyjścia przechodzą przez tę samą ścieżkę. Disposal sprawdza lifetime także wtedy, gdy operacja jeszcze nie powstała; istniejącą operację anuluje, odłącza callbacki i kończy oczekiwanie przed zakończeniem źródłowego Promise. Bounded retry korzysta z istniejącego silnika `retryAfter()`.

SSRContent ma osobny stan disposal, ponieważ gotowe wyjście i anulowane wyjście nie są tym samym stanem. Task zachowuje własne disposal niezależne od ownera. Job computed nadal powstaje dla ComputeCtx, cleanup i info; jego pole operation jest opcjonalne, a abort i timeout nie przydzielają operacji przez samo anulowanie. Osobna operacja cleanup tasku była już tworzona tylko dla async cleanup.

Regresje najpierw wykazały eager tworzenie operacji w trzech synchronicznych body. Nowe przypadki obejmują cleanup synchroniczny, zwrócony/rzucony Promise, Promise zagnieżdżony w wyjściu, import QRL, async cleanup i disposal przed pierwszym wywołaniem. Oczekiwanie kończy się przed ręcznym rozwiązaniem źródła; późny wynik nie wykonuje body ponownie ani nie publikuje wartości. Dotychczasowe testy WeakRef/GC dla osiągalnych never-settling Promise przechodzą.

Weryfikacja: 243 focused testy, build.core, typy pakietu, produkcyjne Chromium 46 passed / 2 skipped. Pełna suite: 4486 passed, te same 9 failed i 40 skipped; +14 passing regresji względem poprzedniego stanu. Lint kodu przechodzi. W dwóch plikach testów pozostają wcześniejsze naruszenia loop-style; pozostałe reguły oraz wszystkie nowe fragmenty są sprawdzone. Prettier i git diff --check przechodzą.

### Pomiar tej zmiany

Baseline to kopia źródeł sprzed tej optymalizacji (`/private/tmp/qwik-before-lazy-producers`), obejmująca poprzednie poprawki etapu. Każdy nowy scenariusz wykonuje 5000 synchronicznych body. Trzy pary procesów, 8 warmup i 25 próbek z GC; tabela używa średniej median czasu, maksimum peak heap/RSS i profilu alokacji 16 KiB / 8 prób. Heap jest próbkowany również co 64 iteracje, aby uwzględniać szczyt przed automatycznym GC. Self-check sprawdza wykonanie wszystkich tasków i wynik computed. Odpowiedź pozostaje identyczna.

| Scenariusz | Czas ms przed → po | Peak heap MiB | Peak RSS MiB  | Alokacje MiB/próba | Odpowiedź B   |
| ---------- | ------------------ | ------------- | ------------- | ------------------ | ------------- |
| content    | 7,09 → 6,92        | 14,93 → 12,88 | 90,19 → 91,58 | 7,61 → 6,14        | 70191 → 70191 |
| tasks      | 1,81 → 1,61        | 8,27 → 8,31   | 72,88 → 73,67 | 6,65 → 4,69        | 203 → 203     |
| computed   | 2,28 → 2,16        | 8,64 → 8,51   | 72,92 → 74,62 | 6,32 → 4,67        | 204 → 204     |

Kontrolne scenariusze tej zmiany względem tego samego baseline: plain: -1,16% czasu, -0,53% peak heap; packets: -1,13% czasu, -0,15% peak heap; discard: 3,31% czasu, -2,50% peak heap; fragments: 1,12% czasu, -0,11% peak heap; components: 3,65% czasu, -0,06% peak heap. Plain, packets i components mają dwie pary procesów; krótkie discard i fragments sprawdzono pięcioma parami ze względu na rozrzut. Nie potwierdzono powtarzalnej regresji ponad 5% czasu lub peak heap. Profil alokacji jest estymacją; pierwsza próba fragmentów miała duży rozrzut, którego kolejna nie potwierdziła.

Pomiary tej sekcji dotyczą wyłącznie leniwego tworzenia operacji. Tabela całego etapu niżej zachowuje odrębny baseline commita `542ddca39` i opisuje stan sprzed tej ostatniej optymalizacji.

## Czwarta runda review: useOn, korzenie po await i prostsze oczekiwanie

Naprawiono znikający `useOn` komponentu zwracającego `Catch`. Traversal zdarzeń wybiera wyjście boundary, a kontroler zachowuje transformację dla późniejszego fallbacku. Kompilator udostępnia pierwszy tag potomnych renderów jako istniejący rekord open-tag, gdy komponent z hookami zwraca Catch. Cache lexical lifetime jest współdzielony między emitterami; inne komponenty zachowują poprzednią emisję, w tym projekcje bez elementu.

`ownOutput()` łączy korzenie z invoke context i scope, gdy obie listy istnieją; pojedyncza lista nie jest kopiowana. Test native await potwierdza obecność obu korzeni. Cache kolejności ownerów pozostaje poza journalem; reader testuje kolejność po rollbacku, disposal i odczycie późniejszego potomka przed wcześniejszym.

Serializer ma jeden callback budzący aktualne oczekiwanie. Przyjęcie wyniku i anulowanie budzą ten sam waiter; oryginalny Promise dostaje jedną obserwację. Format, ID i forward refs nie zmieniają się. Regresja dla ośmiu kolejnych wyników wykazała 44 obserwacje przed zmianą i 8 po niej; istniejące testy błędów oraz never-settling/GC przechodzą.

Cleanup zwrócony przez task jest rejestrowany przy odbiorze jego oryginalnego wyniku. Disposal usuwa kontynuacje trzymające task i invoke context; pozostały statyczny callback wykonuje wyłącznie późno zwrócony cleanup. Nie przywraca kontekstu ani nie uruchamia retry. Testy obejmują wyścig kończenia/disposal, reentrant disposal, rzucany Promise rozwiązywany funkcją oraz throw/rejection cleanupu. Wynik synchroniczny rejestruje cleanup bez tworzenia callbacku obserwatora.

Weryfikacja: 334 focused testy z GC, produkcyjne Chromium 47 passed / 2 istniejące skipped, build.core i lint. Pełna suite: 4499 passed, te same 9 failed, 41 skipped; +13 passing regresji. Dodatkowy test inline fallbacku jest celowo SSR/resume-only; podstawowy Catch/useOn ma również kontrolę CSR. Asynchroniczny fallback CSR w tym fixture wykazał oddzielny problem przypinania zdarzeń, obecny przed tą rundą; nie zmieniono jego ścieżki klienta. Starsze naruszenia loop-style dwóch plików testowych pozostają poza zakresem.

Jedno finalne uruchomienie pełnej suite miało dodatkowy błąd kolejności `task1`/`task2` w visible-task spec (4498 passed / 10 failed). Następne uruchomienie wróciło do 4499 passed / 9 failed. Focused visible-task spec przeszedł 27/27 na bieżącym kodzie i na kopii sprzed zmian waitera/cache oraz późnego cleanupu. Przyczyna jednorazowej awarii pozostaje nieustalona; nie zmieniono testu ani ścieżki kolejności visible tasków.

### Pomiar uproszczenia serializera i późnego cleanupu

Baseline `/private/tmp/qwik-before-five-review` cofa tylko zmianę waitera/cache serializera i późnego cleanupu, zachowując pozostały etap. Node v26.1.0, produkcyjne flagi, 8 warmup i 25 prób z GC; pomiary sekwencyjne bez buildów/testów. Dwie pary procesów dla 256 kolejnych Promise, trzy dla 5000 synchronicznych tasków. Alokacje serializera: sampling 16 KiB, 8 prób.

| Scenariusz            | Czas ms przed → po | Peak heap MiB | Peak RSS MiB    | Alokacje MiB/próba | Odpowiedź B     |
| --------------------- | ------------------ | ------------- | --------------- | ------------------ | --------------- |
| 256 kolejnych Promise | 5,89 → 0,97        | 14,95 → 8,90  | 91,47 → 81,45   | 6,32 → 1,03        | 6186 → 6186     |
| 5000 tasków           | 1,59 → 1,61        | 8,41 → 8,18   | 73,59 → 73,94   | —                  | 203 → 203       |
| pakiety OOOS          | 15,21 → 15,28      | 26,27 → 26,29 | 122,03 → 121,91 | —                  | 343846 → 343846 |
| zwykły SSR            | 12,53 → 12,71      | 25,09 → 25,12 | 139,47 → 140,53 | —                  | 336117 → 336117 |

Dla kolejnych Promise liczba obserwacji wynosi 33152 → 256; SHA-256 zserializowanego wyniku jest identyczny. Pierwszy wariant późnego cleanupu wykazał wzrost kosztu tasków; synchroniczna ścieżka bez callbacku usunęła powtarzalną regresję ponad 5%. Kontrole OOOS i zwykłego SSR mają po jednej parze procesów, więc nie są pomiarem drobnych różnic. Mikrobenchmark kolejnych Promise znajduje się w `/private/tmp/qwik-sequential-serializer-bench.mjs`; wyniki w `/private/tmp/qwik-review-five-sequential.log`.

## Deduplikacja lifetime

Usunięto `thenUntilDisposed`, `retryUntilDisposed` i `runOwnerOperation`. Owner, task, computed, SSRContent i sama CancellableOperation używają istniejącego kontraktu CancellableLifetime oraz wspólnych `thenInLifetime`/`retryInLifetime`. Klasa operacji deleguje retry do wspólnego algorytmu; limit prób pozostaje taki sam. OwnerOperation obsługuje wyłącznie rejestrację disposal i zwalnianie tej rejestracji po zakończeniu zewnętrznego oczekiwania. Kolejne retry zachowują tę samą rejestrację.

Owner nie otrzymał nowego pola instancji ani obiektu adaptera. Jego operacja powstaje wyłącznie przy Promise; synchroniczna ścieżka nie wywołuje getPendingOperation. Pozostałe lifetime’y zachowują własne cached operations. Brak ownera obsługuje wspólny silnik. Produkcyjny kod skrócono o 58 linii po formatowaniu, wraz z aktualizacją wszystkich callerów.

Przed refaktorem nowe regresje wykazały brak wspólnego kontraktu ownera, brak obsługi null i nieskuteczny guard anulowanej operacji. Po zmianie przechodzi 250 focused testów z GC; wcześniejszy szerszy focused run obejmował 385 testów JSX/SSR/resume. Finalna pełna suite: 4504 passed, te same 9 failed i 41 skipped. Chromium: 47 passed / 2 istniejące skipped. build.core, typy, lint kodu i git diff --check przechodzą. W pliku runtime.unit pozostają starsze naruszenia loop-style, pominięte wyłącznie w jego lintowaniu.

Baseline to `/private/tmp/qwik-before-lifetime-dedup`. Osiem scenariuszy existing benchmarku, po jednej parze procesów, 8 warmup + 25 prób z GC. Dla content wykonano dodatkowo dwie pary w obu kolejnościach: pierwszy wzrost czasu 7,5% nie powtórzył się (kolejne -2,9% i -1,4%; średnia median około +1,0%). Nie potwierdzono powtarzalnej regresji ponad 5% czasu lub peak heap. Wielkość odpowiedzi jest jednakowa przed/po we wszystkich scenariuszach. Alokacji w tej rundzie nie profilowano; porównano czas, peak heap i RSS. Wyniki są w `/private/tmp/qwik-lifetime-dedup-bench.log` oraz `/private/tmp/qwik-lifetime-dedup-content-repeat.log`.

## Reader i tożsamość

Leniwy `WeakMap<encodedArray, Map<slotIndex, allocation>>` przechowuje canonical shell albo trwającą alokację. Wszystkie odczyty inline korzystają z konkretnego slotu; cache nie obejmuje prymitywów.

Promocja odczytanego slotu przenosi istniejącą alokację do nowego root ID. Dla nieodczytanego slotu zachowuje relokację danych. Odczyt podczas allocation/inflate współdzieli tę samą operację. Zachowane są cykle, boxing Promise, ownership i disposal; zwykłe obiekty nie są automatycznie zamieniane na osobne korzenie.

## Weryfikacja

- Focused writer/reader/Catch/scheduler: regresje prywatnego Error i captures, błędu encodera, anulowania przed zapisem, never/late-settling Promise, backpressure, transportu, nested Catch/fallback, Reveal i disposal.
- Check serializera oraz automatyczne regresje renderu z `WeakRef`: anulowany kontekst jest zbierany przy nadal osiągalnym, nierozwiązanym Promise. Pełną suite uruchomiono z `--pool=forks --execArgv=--expose-gc`, więc testy GC rzeczywiście się wykonały.
- Cold resume/spec: puste gałęzie, kolekcje, projekcje, context, refs, owner order, eager resume i nowe subscriptions wcześniej wysłanego sygnału.
- Tożsamość obiektu, QRL, sygnału, store i Promise przed/po odczycie rodzica; obiekt i QRL także podczas allocation/inflate.
- Produkcyjne Chromium: `catch-render.e2e.ts` i `pending.e2e.ts`, bez retry; 46 passed, 2 istniejące skipped. Test produkcyjny obejmuje błąd renderu, async renderu oraz encodera podczas serializacji i sprawdza całe HTML/state oraz interaktywność fallbacków.
- `pnpm build.core`, aktualizacja snapshotu typów przez `pnpm api.update`, focused unit/spec i pełna suite przed/po.
- Pełna suite baseline: 4396 passed, 9 failed, 40 skipped. Po trzeciej rundzie review: 4472 passed, te same 9 failed, 40 skipped; +76 passing regresji względem baseline, bez nowych awarii.
- ESLint kodu i nowych regresji z review przechodzi. Starsze naruszenia stylu w testach pozostają poza zakresem. Prettier i `git diff --check` obejmują zmienione pliki.

9 istniejących awarii to dwa acceptance-sweep testy kompilatora z nieobsługiwanym `catch` w starych fixture oraz siedem testów Insights symbol-tile. Nie zostały naprawione w tym zakresie.

Granica bezpieczeństwa: aplikacyjny graf trafia do HTML/state dopiero po wyborze wyjścia i zatwierdzeniu frame. Journal i filtr subscriptions uniemożliwiają publikację odrzuconego, niewysłanego grafu; produkcyjne testy sprawdzają brak `PRIVATE_` w całej odpowiedzi. Escaping JSON/skryptów/atrybutów zachowuje istniejące helpery i regresje writerów.

## Pomiary

Node v26.1.0, macOS arm64. Minifikowany bundle źródeł z flagami produkcyjnymi. Baseline wszystkich scenariuszy to `542ddca39`. Dwie niezależne pary procesów, każda 8 warmup + 25 próbek z GC przed próbą; dla komponentów pięć par, ponieważ pierwsze pomiary czasu były niestabilne. Czas to średnia median procesów; peak heap/RSS to maksimum. Wire jest liczbą znaków ASCII, równą bajtom w fixture. Profil alokacji: sampling 16 KiB, 8 próbek, uwzględnia obiekty zebrane przez minor/major GC. RSS obejmuje proces i przygotowanie bundle; nie jest precyzyjną miarą samego renderu.

| Scenariusz | Czas ms przed → po | Peak heap MiB | Peak RSS MiB    | Alokacje MiB/próba | Odpowiedź B     |
| ---------- | ------------------ | ------------- | --------------- | ------------------ | --------------- |
| plain      | 12,62 → 12,58      | 24,58 → 25,10 | 144,56 → 140,12 | 16,83 → 17,11      | 336117 → 336117 |
| packets    | 16,34 → 15,57      | 31,57 → 26,29 | 167,55 → 120,67 | 18,99 → 18,80      | 367768 → 343846 |
| discard    | 28,55 → 1,27       | 47,95 → 8,91  | 221,77 → 88,42  | 37,63 → 1,89       | 783383 → 1905   |
| fragments  | 11,78 → 2,03       | 10,34 → 8,43  | 78,92 → 77,88   | 3,00 → 3,53        | 90411 → 90411   |
| components | 3,99 → 4,15        | 9,90 → 10,01  | 74,95 → 76,22   | 3,29 → 3,61        | 80191 → 80191   |

Zwykły SSR: około −0,3% czasu i +2,1% peak heap. Komponenty synchroniczne: około +3,9% czasu oraz +1,1% peak heap; pojedyncze pary czasu miały rozrzut od −1,7% do +8,0%. Dodatkowe trzy pary nie potwierdziły powtarzalnej regresji ponad 5%. Pozostałe scenariusze poprawiają czas i peak heap. Profil alokacji nadal pokazuje koszt atomowego bufora Catch i metadanych publikacji; spadek peak heap nie oznacza braku wszystkich dodatkowych alokacji.

Wcześniejsze wersje przekraczały limit. Usunięto journal zwykłego shella bez Catch, zbędne przebiegi wyjścia, operacje ownera dla synchronicznych emitterów, tymczasowe kopie gotowych tablic i obiekty ramek writera. Ograniczenie bufora Catch do bloków po 256 usunęło regresję peak heap dla 6000 fragmentów względem początku całego etapu.

Pomiar discard obejmuje usunięcie wcześniej publikowanego porzuconego grafu, więc duży zysk wynika również z naprawy poprawności. Porównanie fragments dotyczy całego etapu, w tym writera i transakcji; nie izoluje tylko dwóch usuniętych przebiegów resolvera.

Benchmark jest w `scripts/benchmark-ssr-publication.mjs`. Odtworzenie baseline:

```bash
publicationBaseline=$(mktemp -d)
git archive 542ddca39 packages/qwik/src | tar -x -C "$publicationBaseline"
node --expose-gc scripts/benchmark-ssr-publication.mjs "$publicationBaseline" plain
node --expose-gc scripts/benchmark-ssr-publication.mjs . plain
# Zastąp plain przez packets/discard/fragments/components; dodaj alloc dla profilu alokacji.
```

Nie uruchamiać benchmarków czasu równolegle z buildami/testami. Są to lokalne mikrobenchmarki, nie uniwersalna kalibracja sprzętu produkcyjnego.

## Następne zakresy

Osobne plany są w `ssr-state-publication-next-stages.md`: async, kodeki, build/preload i dalsze mierzone optymalizacje. Nie zostały wdrożone w etapie 1.

## Uproszczenie pozostałych duplikacji — 13 października 2026

- `runLateCleanup()` współdzieli wywołanie późnego cleanupu w taskach i computed. Synchroniczny wyjątek nadal propaguje; odrzucenie zwróconego Promise jest konsumowane. Obsługa zwróconego cleanupu pozostaje statycznym callbackiem bez referencji do taska.
- `writeBufferedOutput()` współdzieli materializację shella, odroczonego HTML i pakietu OOOS. Zwraca `ValueOrPromise<void>` bez dodatkowego async wrappera. Granice commitu, anulowanie i bufor Catch grupowany po 256 fragmentów zachowują dotychczasowe zachowanie.
- Komponent korzysta z `CancellableOperation.retryAfter()` zamiast własnego licznika i rekurencji. Pierwsza próba jest wykonywana bez operacji; rzeczywisty Promise uruchamia odłączalną obserwację. Każdy retry tworzy nowy invoke context, zachowując host pierwszej próby. Stan kontynuacji znajduje się w osobnej funkcji, aby synchroniczna ścieżka nie tworzyła closures retry.
- `throwRetryError()` współdzieli diagnostykę developerską i ponowne rzucanie błędu bez wywoływania całego mechanizmu retry.

Dodano 11 regresji: synchroniczny render bez operacji, świeże konteksty dla rzucanego/odrzuconego Promise, stały host przy zmianie kontekstu rodzica, disposal podczas kolejnego retry, cleanup po wyczerpaniu limitu, tożsamość rzucanych wartości wraz z revoked Proxy, błędy późnego cleanupu taska/computed oraz dwa testy GC z nadal osiągalnym Promise komponentu. Regresje zachowania przechodziły przed refaktorem; jest to uproszczenie istniejącego kontraktu.

Weryfikacja: focused unit/spec obejmowały SSR, CSR i resume; końcowy focused przebieg komponentu i SSR z GC: 122 passed. Pełna suite z GC: 4515 passed, te same 9 failed, 41 skipped, względem poprzedniej bazy 4504 passed, 9 failed, 41 skipped. Produkcyjne Chromium Catch/Pending: 47 passed, 2 istniejące skipped, bez retry. `pnpm build.core`, typy, format i `git diff --check` przechodzą. Lint zmienionych modułów produkcyjnych przechodzi; w `runtime.unit.ts` pozostaje istniejąca, niezwiązana `.forEach()` naruszająca `qwik-local/loop-style`.

Granica bezpieczeństwa: callbacki do oryginalnych Promise nadal korzystają z odłączalnych obserwacji; dodatkowy callback cleanupu retry jest przypięty do Promise operacji, który kończy się także przy disposal. Commit i rozpoczęcie zapisu frame pozostają bez `await` pomiędzy nimi. Testy GC oraz produkcyjne testy braku prywatnych danych w HTML/state sprawdzają te właściwości. Escaping, ID korzeni i format stanu nie zostały zmienione.

### Pomiary względem checkoutu przed tym uproszczeniem

Baza: `/private/tmp/qwik-before-four-simplifications`, kopia całych źródeł Qwik przed tym refaktorem. Produkcyjny minifikowany bundle, Node v26.1.0, macOS arm64, 8 warmup + 25 próbek z GC. Trzy pary procesów dla komponentów, cztery dla fragments, po jednej dla pozostałych scenariuszy; kolejność komponentów i powtórzeń fragments była odwracana. Czas to średnia median, peak heap i RSS to maksima z przebiegów bez profilera. Sampling alokacji: 16 KiB, 8 próbek z uwzględnieniem zebranych obiektów. RSS obejmuje proces i bundlowanie. Dodano powtarzalne scenariusze `components-async` i `components-retry` do istniejącego skryptu benchmarkowego.

| Scenariusz       | Czas ms       | Peak heap MiB | Peak RSS MiB    | Sampling alokacji MiB/próba | Odpowiedź B     |
| ---------------- | ------------- | ------------- | --------------- | --------------------------- | --------------- |
| plain            | 12.87 → 12.86 | 25.16 → 25.10 | 139.70 → 128.34 | 17.49 → 17.29               | 336117 → 336117 |
| packets          | 15.43 → 15.38 | 26.32 → 26.29 | 123.53 → 119.78 | 18.39 → 18.57               | 343846 → 343846 |
| discard          | 1.18 → 1.16   | 8.72 → 8.72   | 88.41 → 88.36   | 1.78 → 1.85                 | 1906 → 1906     |
| fragments        | 1.96 → 1.98   | 10.30 → 10.28 | 78.17 → 78.27   | 1.59–3.40 → 1.70–3.57       | 90411 → 90411   |
| components       | 4.14 → 4.23   | 9.96 → 9.23   | 75.66 → 74.77   | 3.27 → 2.54                 | 80191 → 80191   |
| components-async | 8.05 → 8.13   | 23.83 → 23.71 | 111.38 → 111.75 | 17.42 → 17.99               | 80191 → 80191   |
| components-retry | 21.20 → 18.30 | 38.95 → 37.63 | 175.55 → 169.20 | 31.30 → 29.40               | 80191 → 80191   |
| content          | 6.52 → 6.62   | 12.87 → 12.99 | 90.23 → 90.47   | 6.13 → 6.11                 | 70191 → 70191   |
| tasks            | 1.76 → 1.76   | 8.18 → 8.27   | 74.48 → 74.27   | 4.62 → 4.37                 | 203 → 203       |
| computed         | 2.11 → 2.20   | 8.35 → 8.20   | 74.38 → 75.00   | 4.94 → 4.73                 | 204 → 204       |

Komponenty synchroniczne: +2,1% czasu, −7,3% peak heap i około −22,4% samplowanych alokacji. Async komponenty: +1,1% czasu i −0,5% peak heap. Dwa retry komponentu: −13,7% czasu i −3,4% peak heap. Rozmiar odpowiedzi jest identyczny we wszystkich dziesięciu scenariuszach. Nie potwierdzono powtarzalnej regresji ponad 5% czasu lub peak heap bez profilera.

Pierwsze warianty przekraczały limit: wspólne retry połączone z osobną finalizacją obserwowało wynik dwa razy. Usunięto dodatkową operację, dodatkowy Promise z typowego async renderu i przechwytywany stan retry z funkcji synchronicznej.

Sampling fragments jest niestabilny; nie wnioskuję z niego o poprawie alokacji. Dodatkowy profil wskazał niezmieniony `collectSyncFunctions` jako główne miejsce alokacji; w tym przebiegu wynik wyniósł 1,69 → 1,63 MiB/próba. Pierwsza para peak heap wykazała +20,8%, lecz trzy powtórzenia bez profilera dały odpowiednio −0,1%, +0,8% i −0,9%. Nie zmieniono tego kolektora poza zakresem czterech uproszczeń.

Logi: `/private/tmp/qwik-four-final-measurements.log`, `/private/tmp/qwik-four-fragments-repeat.log`, `/private/tmp/qwik-four-full-unit-gc.log`, `/private/tmp/qwik-four-chromium.log`. Nie dodano changesetu ani commitu.

## Trzy drobne uproszczenia i przegląd SSRContent — 13 października 2026

Usunięto metodę `CancellableOperation.retry()`; `retryAfter()` wywołuje bezpośrednio istniejący `retryInLifetime()` z tą samą wartością anulowania i limitem. Serializer sprawdza aktywne `$operation$` zamiast osobnego `$running$`. Operacja pozostaje aktywna po anulowaniu aż do zakończenia `finally`. Cleanup computed korzysta z istniejącego gettera `isCancelled`. Łącznie ubyło 10 linii kodu produkcyjnego, bez nowych obiektów czy adapterów.

Dodano dwie regresje: blokada serializacji/rollbacku między cancel i końcem `finally` oraz zachowanie własnej wartości anulowania podczas kolejnego retry bez spóźnionego wykonania. Testy zachowania przechodziły przed refaktorem: 236 passed z GC. Po zmianie focused writer/reader, runtime, computed, komponenty i SSR: 263 passed z GC. Dostosowano istniejącą regresję limitu retry do usuniętej metody. `pnpm tsc.check`, lint zmienionych modułów, format, `git diff --check` i `pnpm build.core.dev` przechodzą. Chromium Catch/Pending na świeżym buildzie: 47 passed, 2 istniejące skipped, bez retry. Nie powtarzano pełnej suite; wcześniejsze dziewięć niezwiązanych awarii pozostaje poza zakresem.

Granica bezpieczeństwa: cancel nie zwalnia blokady serializera przed odłączeniem obserwacji w `finally`; test z never-settling Promise sprawdza zakaz równoległej serializacji i rollbacku w tym oknie. Regresje GC sprawdzają odłączanie referencji, a Chromium brak odrzuconych danych w HTML/state i cold resume. Mechanizm przydzielania ID, journal, escaping i moment rozpoczęcia zapisu nie zostały zmienione.

### Pomiary trzech uproszczeń

Baza: `/private/tmp/qwik-before-three-small-cleanups`, kopia źródeł bezpośrednio przed zmianą. Produkcyjny minifikowany bundle, Node v26.1.0, macOS arm64, 25 próbek z GC. Dwanaście scenariuszy: po jednej parze procesów oraz trzy pary dla `components-retry`, `computed-cleanups` i `serialization-async`, z 8 warmup i naprzemienną kolejnością procesów. Sampling alokacji dla tych trzech scenariuszy: 16 KiB, 8 próbek. Dodano dwa ostatnie scenariusze do istniejącego skryptu benchmarkowego.

Początkowe pary tasków wykazały +10,7% i +28,4% czasu, następne −4,7% i −3,9%. Początkowy peak heap computed wyniósł +6,1%, lecz kolejne pary nie potwierdziły tego wzrostu. Dlatego oba scenariusze sprawdzono dodatkowo w trzech parach z 40 warmup. Poniższe wiersze `tasks` i `computed` pochodzą z tych dodatkowych przebiegów; pozostałe z podstawowych. Czas jest średnią median, heap/RSS maksimum z przebiegów bez profilera; RSS obejmuje bundlowanie.

| Scenariusz          | Czas ms       | Zmiana czasu | Peak heap MiB | Peak RSS MiB    | Sampling alokacji MiB/próba |
| ------------------- | ------------- | ------------ | ------------- | --------------- | --------------------------- |
| components-retry    | 18.61 → 18.79 | +1.0%        | 37.68 → 37.62 | 170.23 → 170.33 | 29.26 → 28.35               |
| computed-cleanups   | 2.88 → 2.94   | +2.3%        | 8.53 → 8.42   | 75.30 → 74.59   | 6.62 → 6.34                 |
| serialization-async | 2.05 → 2.08   | +1.5%        | 9.99 → 9.89   | 83.75 → 83.61   | 1.51 → 1.41                 |
| tasks               | 1.74 → 1.75   | +0.9%        | 10.17 → 10.31 | 77.17 → 76.55   | nie profilowano             |
| computed            | 2.21 → 2.23   | +1.1%        | 10.21 → 10.29 | 76.91 → 76.42   | nie profilowano             |

Po dłuższej rozgrzewce taski: +0,9% czasu i +1,3% peak heap; computed: +1,1% czasu i +0,8% peak heap. Dla trzech bezpośrednio zmienionych ścieżek czas różni się o około 1–2,3%, peak heap nie wzrósł. Rozmiar odpowiedzi jest identyczny we wszystkich dwunastu scenariuszach. Nie potwierdzono powtarzalnej regresji ponad 5% po rozgrzewce; małe różnice samplowanych alokacji nie dowodzą poprawy wydajności.

Logi: `/private/tmp/qwik-three-cleanups-bench.log`, `/private/tmp/qwik-three-cleanups-repeat.log`, `/private/tmp/qwik-three-cleanups-warm.log`, `/private/tmp/qwik-three-before-tests.log`, `/private/tmp/qwik-three-after-tests.log`, `/private/tmp/qwik-three-chromium.log`.

### SSRContent: wynik przeglądu po tych zmianach

Nie zmieniano `content.ts`. Instrumentacja produkcyjnego bundle liczyła rzeczywiste async wejścia do `CancellableOperation.then()` i osobno wywołania `.then()` źródłowych Promise. Jedno SSRContent z gotowym QRL, bez dodatkowych tasków/computed:

| Wynik producenta           | Obserwacje async frameworka | Obserwacje źródłowych Promise |
| -------------------------- | --------------------------- | ----------------------------- |
| string                     | 0                           | 0                             |
| Promise<string>            | 3                           | 1                             |
| tablica z Promise          | 2                           | 1                             |
| Promise<tablica z Promise> | 4                           | 2                             |

Dla `Promise<string>` trzy obserwacje odpowiadają retry producenta, rozwiązywaniu drzewa wyjścia i finalizacji ownera. Samo źródło jest obserwowane raz, a istniejące regresje GC z nadal osiągalnym Promise przechodzą. Nie jest to ponowne obserwowanie źródła przez kolejne `Promise.race`.

Najmniejszy kandydat do kolejnego refaktoru to połączenie rozwiązywania wyjścia z finalizacją: potencjalnie 3 → 2 obserwacje dla `Promise<string>`, przy zachowaniu współdzielonego retry. Nie wystarczy usunąć zewnętrzne `thenInLifetime`: odpowiada ono również za `dispose()` po błędzie rozwiązywania wyjścia. Callback finalizacji musi pozostać odłączalny; bezpośredni callback na oryginalnym Promise mógłby ponownie zatrzymywać kontekst odpowiedzi. Wariant musi zachować brak dodatkowych closures/operacji na ścieżce synchronicznej.

Przed takim refaktorem potrzebne są regresje odrzucenia Promise producenta i potomka, błędu podczas rozwiązywania drzewa, disposal pomiędzy etapami oraz GC z nierozwiązanym źródłem. Pomiar powinien objąć sync content, Promise<string> i zagnieżdżone Promise. W tym przeglądzie nie wdrażano ani nie benchmarkowano wariantu SSRContent. Instrumentacja: `/private/tmp/qwik-three-review/content-review.mjs`; wynik: `/private/tmp/qwik-ssr-content-review.log`.

Bez changesetu, commitu i zmian poza tym zakresem.

## SSRContent: połączenie rozwiązywania wyjścia z finalizacją — 13 października 2026

`SSRContent.run()` rozwiązuje wyjście i finalizuje ownera w tej samej kontynuacji. Dla gotowego QRL zwracającego `Promise<string>` liczba rzeczywistych obserwacji async w `CancellableOperation.then()` spadła z 3 do 2; źródłowy Promise nadal otrzymuje jedno `.then()`. Zagnieżdżone Promise mają własne obserwacje. Synchroniczny wynik nie tworzy operacji anulowania ani Set.

Wspólny `onError` wykonuje disposal dla błędu renderu, rozwiązywania wyjścia i finalizacji. Testy przed zmianą wykazały także istniejące braki disposal przy synchronicznym błędzie rozwiązywania drzewa oraz przy synchronicznym/asynchronicznym wejściu do finalizacji; refaktor zamyka te przypadki. Kontynuacje nadal korzystają z odłączalnego lifetime. Nie podpinano callbacków przechwytujących response context bezpośrednio do źródłowych Promise.

Dodano 12 focused testów w `content-ssr.unit.ts`: dwie obserwacje i jedna obserwacja źródła, synchroniczny fast path, siedem wariantów błędu wraz z disposal ownera, anulowanie podczas rozwiązywania drzewa i podczas oczekiwania na potomka oraz tożsamość synchronicznego drzewa/custom observer. Przed refaktorem pierwsze 11 testów miało 4 oczekiwane awarie: liczba obserwacji i trzy brakujące disposal. Dodatkowy test GC anuluje Catch dopiero podczas rozwiązywania drzewa zwróconego przez Promise, pozostawiając potomny Promise osiągalny i nierozwiązany.

Weryfikacja: końcowy focused przebieg z GC: 155 passed; szerszy unit/spec SSR/CSR/resume przed optymalizacją resolvera: 335 passed i 11 istniejących skipped. Pełna suite po końcowej zmianie z GC: 4530 passed, te same 9 failed, 41 skipped. `pnpm tsc.check`, lint refaktoru/regresji, format i `git diff --check` przechodzą. Świeży `pnpm build.core.dev` przechodzi. Chromium Catch/Pending: 47 passed, 2 istniejące skipped, bez retry.

Granica bezpieczeństwa: rozwiązywanie wyjścia nie publikuje HTML ani root ID; finalizacja nadal odbywa się przez `ownSsrOutput`, a writer zachowuje wybór jednostek, kontrolę generacji i journal. Disposal blokuje finalizację anulowanego wyniku, odłącza oczekiwania i czyści ownera także po błędzie. Testy GC z nadal osiągalnymi źródłami oraz produkcyjne sprawdzenia odrzuconego stanu chronią tę granicę. Format, escaping i tożsamość współdzielonych danych zachowują dotychczasowy protokół.

### Pomiary SSRContent

Baza: `/private/tmp/qwik-before-ssr-content-fold`, źródła sprzed refaktoru. Produkcyjny minifikowany bundle, Node v26.1.0, macOS arm64, 8 warmup + 25 próbek z GC. Trzy pary procesów dla pięciu wariantów content i fragments, naprzemienna kolejność; po jednej parze dla plain/packets/discard. Czas to średnia median, heap/RSS to maksimum; RSS obejmuje bundlowanie. Sampling alokacji dla content/fragments: 16 KiB, 8 próbek. Dodano cztery scenariusze content async/nested/retry do istniejącego skryptu benchmarkowego.

| Scenariusz           | Czas ms       | Peak heap MiB | Peak RSS MiB    | Sampling alokacji MiB/próba | Odpowiedź B     |
| -------------------- | ------------- | ------------- | --------------- | --------------------------- | --------------- |
| content              | 6.99 → 6.91   | 12.96 → 12.96 | 90.58 → 90.73   | 6.05 → 6.17                 | 70191 → 70191   |
| content-async        | 13.53 → 12.03 | 33.23 → 29.31 | 174.42 → 161.03 | 26.18 → 22.41               | 70191 → 70191   |
| content-nested       | 22.27 → 21.99 | 36.94 → 36.32 | 166.12 → 170.80 | 29.80 → 28.74               | 70191 → 70191   |
| content-async-nested | 24.45 → 24.03 | 38.90 → 38.78 | 198.62 → 198.95 | 38.32 → 37.57               | 70191 → 70191   |
| content-retry        | 26.69 → 25.20 | 38.82 → 36.94 | 192.81 → 172.30 | 33.78 → 29.75               | 70191 → 70191   |
| fragments            | 1.93 → 1.95   | 8.47 → 8.47   | 77.95 → 77.84   | 1.63 → 1.63                 | 90411 → 90411   |
| plain                | 13.02 → 12.95 | 25.44 → 25.29 | 128.62 → 128.45 | nie profilowano             | 336117 → 336117 |
| packets              | 15.36 → 15.43 | 26.30 → 26.27 | 126.42 → 127.80 | nie profilowano             | 343846 → 343846 |
| discard              | 1.17 → 1.18   | 8.86 → 8.70   | 88.36 → 88.84   | nie profilowano             | 1906 → 1906     |

Końcowy async content: −11,0% czasu, −11,8% peak heap oraz około −14,4% samplowanych alokacji. Synchroniczny content: −1,2% czasu, peak heap bez istotnej zmiany. Retry: −5,6% czasu i −4,9% peak heap. Rozmiary odpowiedzi są identyczne. W końcowych przebiegach nie potwierdzono powtarzalnej regresji ponad 5% czasu lub peak heap.

Pierwszy wariant przekraczał limit dla 6000 fragmentów: wzrost peak heap powtórzył się również po 40 warmup. Profil alokacji wskazał `resolveSsrOutput`: callback w gałęzi Promise przechwytywał parametr obserwacji, mimo że większość rekurencyjnych wywołań przetwarzała synchroniczne wartości. Gałąź przeniesiono do prywatnego `resolveSsrPromise`, wywoływanego tylko dla Promise. Przechodzenie po synchronicznym drzewie nie tworzy już tego przechwytywanego stanu. Zachowano custom observer, tożsamość gotowych tablic i odłączalne obserwacje potomków; regresja oraz pomiary obejmują oba warianty. Końcowy fragments: +1,1% czasu, −0,1% peak heap.

Logi: `/private/tmp/qwik-content-before.log`, `/private/tmp/qwik-content-resolver-tests.log`, `/private/tmp/qwik-content-expanded.log`, `/private/tmp/qwik-content-full-unit.log`, `/private/tmp/qwik-content-chromium.log`, `/private/tmp/qwik-content-final-bench.log`. Bez changesetu i commitu.

## Rozdzielenie odpowiedzialności renderera SSR

`ssr-render.ts` zmniejszono z 1644 do 855 linii. Renderer koordynuje uruchomienie root, zakresy/lane, backpressure i kolejność shell/OOOS. `ssr-publication.ts` jest właścicielem staged roots, stylów ownerów, wyboru subskrypcji, eager resume, definicji sync$, materializacji referencji i pojedynczej transakcji publikacji. `ssr-document.ts` składa kontener i sekcje head/body oraz przenosi headless carriers. Moduły nie importują renderera; publiczne eksporty i ABI kompilatora pozostają bez zmian.

Wewnętrzny journal i mapa generacji przygotowywanego frame nie są udostępniane przez obiekt publikacji. Renderer wywołuje `cancelScope()` zamiast sprawdzać te pola. Nadal przekazuje journal serializera schedulerowi przy pobieraniu patchy; kopia akumulatora pod journalem i guard anulowanych lane pozostają. `addRoot` i `ownOutput` są podpięte bezpośrednio do kontekstu, zachowując jego `this`; nie dodano wrapperów ani obserwacji Promise na ścieżce synchronicznej.

Granica publikacji: wybieramy tylko korzenie/metadane aktualnego wyjścia, cofamy niewysłaną operację przed commitem, a commit i rozpoczęcie zapisu nie mają pomiędzy nimi await. Błąd transportu po commicie kończy odpowiedź i nie cofa opublikowanych ID. Escaping atrybutów i skryptów zachowano.

Weryfikacja: 333 testy jednostkowe/spec (11 istniejących skip), w tym writer/reader, kompilator, useOn, disposal i GC; 47 testów Chromium Catch/Pending (2 istniejące skip), świeży build.core.dev z deklaracjami, lint i formatting. Trzy nowe testy modułu publikacji sprawdzają staging zwykłych danych, rollback korzeni/definicji sync$ podczas anulowania never-settling await oraz trwałość commitu przy błędzie transportu. Pełnej suite repozytorium nie powtarzano w tej rundzie.

Baza `/private/tmp/qwik-before-render-architecture`; produkcyjny minifikowany bundle, Node v26.1.0, macOS arm64, 8 warmup + 25 prób z GC. Trzy pary procesów dla packets/fragments/content, naprzemienna kolejność; po jednej parze dla pozostałych. Pomiary sekwencyjne, bez równoległych buildów/testów. Czas to średnia median; heap/RSS to maksimum przebiegów bez profilera. RSS obejmuje bundlowanie.

| Scenariusz    |  Czas | Peak heap |   RSS |   Rozmiar odpowiedzi |
| ------------- | ----: | --------: | ----: | -------------------: |
| plain         | +0.1% |     +1.1% | +0.2% | 336117 B, bez zmiany |
| packets       | +0.9% |     -0.1% | -2.2% | 343846 B, bez zmiany |
| discard       | +1.7% |     -0.7% | -0.1% |   1906 B, bez zmiany |
| fragments     | -2.7% |     -0.1% | +0.0% |  90411 B, bez zmiany |
| content       | -0.4% |     +0.8% | -0.5% |  70191 B, bez zmiany |
| content-async | -5.3% |     -1.5% | -0.1% |  70191 B, bez zmiany |

Nie zaobserwowano regresji powyżej 5% czasu lub peak heap. Sampling alokacji (16 KiB, 8 prób, jedna para procesów): plain −1,4%, packets +0,8%, fragments −4,5%. Są to pomiary lokalne; pojedynczych zmian czasu/alloc nie traktujemy jako gwarantowanego przyspieszenia.

Logi: `/private/tmp/qwik-render-architecture-final-tests.log`, `/private/tmp/qwik-render-architecture-final-build.log`, `/private/tmp/qwik-render-architecture-final-chromium.log`, `/private/tmp/qwik-render-architecture-bench.log`. Bez changesetu, commitu i pushowania.

## Domknięcie protokołu publikacji i przyrostowe metadane

`ssr-render.ts` wybiera gotowy zakres i wywołuje `publishRange(record)`. Wybór korzeni, anulowalne oczekiwanie na cleanup, materializacja HTML, eager resume, serializacja, metadane, patche i złożenie całego frame należą do publikacji. Shell używa `publishShellState()`; pusty stan zwraca undefined i nie tworzy Promise ani dodatkowego await. Ogólny callback `publishFrame(prepare)` jest prywatny. Renderer nadal wybiera kolejność zakresów i dostarcza pending owners oraz patche schedulera.

Writer ma jawny callback `writeBoundary`; po napotkaniu Catch oddaje sterowanie publikacji. Materializer zwraca aktualne wyjście boundary i nie wywołuje transportu. Operacja writera odłącza również ten callback przy anulowaniu. Commit i rozpoczęcie zapisu nadal nie mają pomiędzy nimi await; rozpoczęty frame kończymy, a błąd transportu nie cofa opublikowanych ID.

Jedna funkcja `bindBoundary()` obsługuje przypisania z jednostek i hooka serializera, pomijając identyczne przypisanie. Test potwierdza jeden wpis journalu zamiast dwóch dla nowego korzenia, również przy ponownej selekcji. Eager resume ma wspólną ścieżkę rejestracji i przegląda bieżący selected set; shell nadal przegląda pełny zbiór. Lokalny `visit` zastąpiono statycznym helperem z jawnymi argumentami.

Style używają Map z kolejką nowych ID. Checkpoint zapisuje wskaźnik kolejki, jej długość i pozycję odczytu; rollback przywraca je, a commit zwalnia pobrany przyrost. Emisja przegląda tylko kolejkę, bez skanowania wcześniej wysłanej mapy. Zachowano deduplikację także po overwrite/delete oraz escaping ID. Nie dodano kolekcji ani operation do każdego synchronicznego renderu.

Regresje: sześć pierwszych nowych testów zawiodło przed poprawką, a test pustego shella wykrył dodatkowy Promise w pierwszym wariancie. Native SSR sprawdza 20 rzeczywistych pakietów zwalnianych w odwrotnej kolejności: każdy ma własny styl i q:idle/\_res, bez skanowania historii styli/eager. Są też testy rollbacku po pobraniu stylów przed commitem i odłączania boundary callbacku writera. Focused/integration: 355 testów, w tym writer/reader i GC. Build.core.dev z deklaracjami, lint i tsc.check przechodzą. Chromium Catch/Pending: 47 pass, 2 istniejące skip.

Pełna suite: 4543 pass, te same 9 wcześniejszych fail, 41 skip. Pierwszy przebieg miał dodatkową awarię kolejności dwóch visible tasków; 54 focused przypadki i powtórzona pełna suite przechodzą w tym miejscu. Nie naprawiano niezwiązanych awarii.

### Wydajność

Baza `/private/tmp/qwik-before-publication-protocol`, snapshot źródeł sprzed tych zmian. Produkcyjny minifikowany bundle, Node v26.1.0, macOS arm64. 25 prób z GC, 8 warmup; trzy pary procesów dla fragments i 100/500 pakietów metadanych, z odwracaną kolejnością, po jednej dla pozostałych. Wszystkie pomiary sekwencyjne, bez równoległych testów/buildów. Czas to średnia median, heap/RSS to maksimum. RSS obejmuje bundlowanie. Benchmark metadanych zwalnia pierwszy zakres dopiero po shellu, potem każdy następny po zapisie poprzedniego frame; sprawdza style, \_res i liczbę faktycznych pakietów.

| Scenariusz             |   Czas | Peak heap |   RSS | Odpowiedź przed / po |
| ---------------------- | -----: | --------: | ----: | -------------------: |
| plain                  |  +1.4% |     +0.8% | +2.5% |    336117 / 336117 B |
| packets                |  +2.3% |     +0.4% | -2.7% |    343846 / 343846 B |
| discard                |  -5.7% |     -1.5% | +0.5% |        1906 / 1905 B |
| fragments              |  -5.5% |    -11.5% | -3.9% |      90411 / 90411 B |
| content                |  -3.7% |     -1.7% | +0.1% |      70191 / 70191 B |
| content-async          | -12.6% |     -2.4% | -1.5% |      70191 / 70191 B |
| packets-metadata       |  -5.5% |     -8.1% | -0.1% |      51221 / 51221 B |
| packets-metadata-large | -17.2% |    -10.9% | -1.7% |    256334 / 256334 B |

Dla content 8 warmup dało trzy pary czasu +11,7%, +7,7%, −4,0% (średnia +5,3%). Dłuższe rozgrzanie JIT sprawdzono osobno: 40 warmup, trzy pary w obu kolejnościach; wszystkie szybsze po zmianie, średnio około −3,7%, heap −1,7%. Powyższy wiersz content dotyczy tego rozgrzanego wariantu. Rozbieżności pierwszych prób nie traktujemy jako gwarantowanej poprawy czasu; cold/JIT pozostaje ograniczeniem lokalnych pomiarów.

Sampling alokacji: 16 KiB, 8 prób, jedna para procesów. Fragments −53,9%; 100 pakietów metadanych −13,7%; 500 pakietów −23,6%; rozgrzany content −0,1%. Nie potwierdzono regresji ponad 5% czasu lub peak heap w rozgrzanych pomiarach. Odpowiedzi mają niezmieniony rozmiar poza discard, gdzie digest błędu zależy od stacku i ma zmienną długość. Osobne porównanie HTML potwierdziło identyczność po normalizacji samego digestu oraz brak PRIVATE.

### Wcześniejsza awaria wykryta podczas weryfikacji

Nowy eksperymentalny fixture compiled JSX (kilka odroczonych komponentów, styles i clientOnly computed po resume shella) pozostawiał computed na wartości initial. Pierwszy wariant ze współdzielonym sygnałem odtworzono identycznie na runtime sprzed zmian: tymczasowo przywrócono dokładne trzy pliki ze snapshotu, wykonano świeży build i ten sam Chromium test, następnie odtworzono bieżący kod w finally. Kolejne uproszczone warianty także nie uruchamiały computed. Nie ustalono przyczyny i nie naprawiano tego w tym refaktorze. Eksperyment nie jest dołączony jako pomijany test; pokrycie wielu pakietów zapewniają native SSR regresja i benchmark. Zachowano reprodukcję poza checkoutem: `/private/tmp/qwik-publication-protocol-existing-metadata-fixture.tsx`, `...-existing-metadata-test.txt`; oryginalny wariant jest również w `...-browser.patch`, a baseline failure w `...-baseline-chromium.log`.

Logi: `/private/tmp/qwik-publication-protocol-focused.log`, `...-native-metadata-tests.log`, `...-full-repeat.log`, `...-final-build.log`, `...-final-chromium.log`, `...-bench.log`, `...-content-warm.log`. Bez changesetu, commitu i pushowania.

## Trzy poprawki po ponownym review

- Skan definicji sync$ zapamiętuje generacje zagnieżdżonych Catch przed zbieraniem metadanych. Anulowanie jeszcze nieodwiedzonego dziecka unieważnia przygotowywany frame, również gdy rodzeństwo czeka na async fallback.
- Catch zapisuje reapplyUseOn także przy początkowo pustym wyjściu. Zdarzenia document/window i widoczności, które mają już osobny carrier, pozostają na nim; fallback nie dostaje ich drugi raz.
- Kolejka cleanupów computed wykonuje się niezależnie od computed. Jeden odłączalny token pilnuje wyłącznie bookkeeping zakończenia; disposal i zastąpienie obserwacji usuwają referencję. Kolejność cleanupów zostaje zachowana. Pole i obserwacja powstają wyłącznie dla async cleanupu; synchroniczny wariant nadal zwraca bez Promise, Set ani CancellableOperation. runUserCleanups nie utrzymuje dodatkowego callbacku na cleanupie aktywnego joba.

### Regresje i sprawdzenia

Nowe testy przed implementacją potwierdziły wyciek PRIVATE_NESTED_SYNC, brak handlera późnego fallbacku oraz retencję po cleanupie. Dodatkowa odmiana GC dla aktywnego joba również była czerwona przed domknięciem poprawki. Dodano test kolejności dwóch batchy cleanupów po disposal i test produkcyjnego cold resume po pustym Pending.

- Focused: 279 testów, 9 plików, GC włączone (`--pool=forks --execArgv=--expose-gc`).
- Produkcyjne Catch/Pending Chromium: 27 testów po finalnym świeżym buildzie, bez retries i slowMo.
- Pełna suite finalnego wariantu: 4548 passed, 41 skipped, te same 9 awarii (2 acceptance-sweep, 7 Insights symbol-tile).
- build.core.dev, deklaracje, tsc.check, scoped ESLint i git diff --check przeszły.
- Oryginalne reprodukcje na minifikowanym produkcyjnym bundle: odrzucony button i sync source nieobecne; kontekst SSR zwolniony przez GC przy nadal nierozwiązanym cleanup Promise; późny button ma handler.

Granica bezpieczeństwa: definicje handlerów podlegają tej samej kontroli generacji co HTML i korzenie. Błąd przed commitem powoduje rollback; test z dwoma wewnętrznymi Catch i async fallbackiem sprawdza brak prywatnego źródła w odpowiedzi. Protokół commit→write oraz escaping nie zostały zmienione.

### Pomiary

Baza `/private/tmp/qwik-before-review-three-fixes` to snapshot przed tymi trzema poprawkami. Node v26.1.0, produkcyjny minifikowany bundle; po 8 warmup i 25 prób z GC, trzy pary osobnych procesów z odwracaną kolejnością. Benchmarki bez równoległych testów/buildów. Czas i peak heap w tabeli są średnią z trzech par; heap jest próbkowany przez harness.

| Scenariusz              |   Czas | Peak heap | Odpowiedź przed / po |
| ----------------------- | -----: | --------: | -------------------: |
| computed-async-cleanups | -13.7% |    -14.7% |          221 / 221 B |
| computed-cleanups       |  -8.1% |     -0.4% |          215 / 215 B |
| plain                   |  -1.2% |     -0.3% |    336117 / 336117 B |
| content                 |  +1.4% |     +0.2% |      70191 / 70191 B |
| packets-metadata-large  |  -0.3% |     -0.4% |    256334 / 256334 B |
| discard                 |  +0.3% |     -0.4% |        1906 / 1906 B |

Sampling alokacji: 16 KiB, 8 prób, jedna para. Async cleanups: 14 497 890 → 10 815 602 B (−25,4%). 500 pakietów styles/eager: 29 779 938 → 29 138 718 B (−2,2%). Brak powtarzalnej regresji ponad 5% czasu lub peak heap; odpowiedzi mają ten sam rozmiar.

Pierwszy wariant używał CancellableOperation do bookkeeping cleanupu i przekraczał próg czasu/heap w async benchmarku; zastąpiono go pojedynczym tokenem i powtórzono wszystkie pomiary. Nie zmieniano wymaganych cleanupów ani istniejącego mechanizmu anulowania joba.

Logi: `/private/tmp/qwik-review-three-before.log`, `...-gc-before.log`, `...-active-before.log`, `...-regressions.log`, `...-full-final.log`, `...-build-final.log`, `...-chromium-final.log`, `...-types-final.log`, `...-lint.log`, `...-bench-final.log`, `...-alloc.log`. Patch samego runtime względem snapshotu: `/private/tmp/qwik-review-three-final-runtime.patch`.

Nie naprawiano wcześniejszych awarii suite ani osobnej luki compiled JSX eager resume opisanej powyżej. Bez changesetu, commitu i pushowania.
