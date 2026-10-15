# Kolejne etapy serializacji v3

Zakresy są oddzielne od etapu 1. Publiczne `_serialize()`, `_deserialize()`, `Catch` i `Pending` pozostają bez zmian; numery `TypeIds` pozostają stałe.

## 2. Async

1. Rozwinąć istniejącą pojedynczą obserwację wyniku; waiter budzony przez wynik i anulowanie został wdrożony w etapie 1.
2. Przy rejestracji Promise/SerializerSignal rezerwować docelowe root ID; callback zapisuje wynik do tego slotu dopiero po sprawdzeniu odłączalnego tokenu.
3. Usunąć forward refs z nowego zapisu i uprościć reader. Zachować boxing Promise, cykle, rollback i wakeup przy anulowaniu.
4. Sprawdzić kolejność rezultatów, odrzucenia, współdzielenie Promise, never-settling i late-settling, produkcyjne cold resume.
5. Porównać czas/alokacje/peak heap/RSS/wire dla wielu Promise i anulowanych grafów. Powtarzalne >5% czasu lub peak heap blokuje zakończenie.

## 3. Kodeki

1. Oddzielić traversal, seen refs, journal i writer od encoderów oraz decoderów typów.
2. Automatycznie wybierać encoder przez hook wartości; użytkownik nie przekazuje listy kodeków. Statyczne encodery SSR pozostają synchroniczne.
3. Referencję decoderów reprezentować współdzielonym QRL bez captures; używać synchronicznego `resolved` fast path, a w pozostałych przypadkach resolvera QRL.
4. Wyeliminować importy zbierające wszystkie kodeki. Każdy kodek ma jawne zależności; traversal nie importuje implementacji typów.
5. Sprawdzić customowe wartości, stand-alone serializację, round-trip, cykle, obsługę błędów i rozmiar chunków. Build z samym sygnałem nie może zawierać decoderów nieużywanych typów.

## 4. Build i preload

1. Zachować eksporty kodeków w grafie optimizer/build; współdzielone QRL muszą wskazywać emitowane eksporty.
2. Kompilator może podpowiadać kodeki, ale brak podpowiedzi nie może uniemożliwiać użycia customowego kodu.
3. Writer zbiera dekodery rzeczywiście opublikowanych typów; preload nie obejmuje odrzuconych pakietów.
4. Preload korzysta z istniejącego mechanizmu QRL/chunk graph, respektuje ustawienia aplikacji i działa przy wyłączonym preloadzie.
5. Sprawdzić produkcyjny build, cold resume, standalone poza containerem, wyłączony preload oraz deduplikację preloadów pomiędzy pakietami.

## 5. Dalsze optymalizacje

Mierzyć osobno każdą zmianę:

- zmniejszyć kopiowanie w writerze i buforowaniu frame;
- dzielić skrypty bez ponownego parsowania JSON;
- budować ścieżki liniowo;
- usuwać redundantne tablice/cache po profilu alokacji.

Zachować transakcję publikacji i canonical identity. Porównać plain SSR, wiele pakietów i duże odrzucone grafy z tym samym baseline, warmup i liczbą prób. Optymalizacje nie zmieniają escaping ani ochrony niewysłanego stanu.
