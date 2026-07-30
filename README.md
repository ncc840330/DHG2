# Tatai
Created with CodeSandbox

## Excel exportok

A DHG, törlési kérelem és HW check exportokat a `netlify/shared/xlsx.ts` írja.
Excel 2016-kompatibilis kimenetet ad: a szövegek a `sharedStrings.xml`-ben
vannak (nem `inlineStr` cellákban), minden `sheetView`-hoz tartozik `selection`,
és az `autoFilter` mögött ott van a `_xlnm._FilterDatabase` név. Emiatt lehet a
letöltött fájlból másik munkafüzetbe másolni.

### Régi letöltés megtisztítása

A javítás előtt letöltött fájlokat nem kell újra exportálni:

```bash
npm run fix:xlsx -- DHG_2026-02-06.xlsx          # DHG_2026-02-06.cleaned.xlsx
npm run fix:xlsx -- --check letoltesek/*.xlsx    # csak jelentés, nem ír fájlt
npm run fix:xlsx -- --in-place DHG_2026-02-06.xlsx
npm run fix:xlsx -- --help
```

A `--check` nem nulla kilépési kóddal jelez, ha a fájl javításra vár, így
ellenőrzésre is használható. Tesztek: `npm run test:xlsx`.

Ha egy friss export sem másolható, érdemes megnézni, hogy az Excel nem
Védett nézetben (Protected View) nyitotta-e meg a letöltött fájlt — abban az
állapotban a másolás a fájl tartalmától függetlenül tiltott, amíg a
Szerkesztés engedélyezése meg nem történik.
