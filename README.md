# Pomocník pro kuchaře · Peters Canteen

Otevři `index.html` v prohlížeči. Složka obsahuje statický web včetně písem, náhledů z upravených fotek a přepsané historie. Pro GitHub Pages vlož obsah této složky do zdroje webu. Jako vstupní soubor slouží `index.html`.

- **Galerie** umožňuje hledat podle suroviny, úpravy a přílohy. Počet výskytů znamená počet různých dat stejného jídla. Při porovnání názvů se zohledňují i drobné rozdíly, například „s houskovým knedlíkem“ a „a houskovým knedlíkem“. Jiné receptury a názvy s jinou přílohou zůstávají samostatně. Datum otevře příslušný den v historii.
- **Generátor** nabízí nejvýše tři tipy na každý z vybraných dní. Sleduje dobu od posledního výskytu, zvyklosti pro daný den, zeleninu a střídání příloh. Vychází z historických prodejních cen. Po připnutí ryby nebo dražšího jídla omezuje další návrhy z téže skupiny v daném týdnu.
- **Historie** zobrazuje obědy po týdnech a vyhledává napříč týdny. Zahrnuje polévky, hlavní chody a dostupné tehdejší ceny a alergeny. Štítky surovin vycházejí z názvů a historického katalogu. Položku označ jako vegan po ověření receptury.

## Přidání jídelníčku

V Historii zvol **Doplnit jídelní lístek**, vyber datum a zadej každý chod na vlastní řádek. Lze použít jen název nebo připojit údaje v tomto pořadí.

```text
Kuřecí řízek s bramborovou kaší | 165 | Kuřecí | Brambory | Řízky
```

Doplnění i rozpracovaný týden se ukládají do používaného prohlížeče. **Stáhnout místní doplnění** vytvoří přenosnou zálohu, kterou lze načíst na jiném zařízení. **Stáhnout celý archiv pro GitHub** vytvoří nový `history.js`. Nahrazením tohoto souboru ve zdroji webu se aktualizuje výchozí historie pro všechny návštěvníky po dalším nasazení. Před nasazením vyber odpovídající přístup pro kuchyň a prohlédni fotky určené k publikaci.
