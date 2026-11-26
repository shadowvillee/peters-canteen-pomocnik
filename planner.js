(function (global) {
  "use strict";
  const norm = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const key = title => norm(title).replace(/[^a-z0-9]+/g, " ").trim();
  // Ignore interchangeable connectors before named sides. The side itself stays in the identity.
  const sideConnector = /\b(?:a|s|se) (?=(?:houskov\w* knedl\w*|bramborov\w* (?:knedl\w*|kas\w*|salat\w*|kroket\w*)|(?:karlovarsk|spekov|varsavsk)\w* knedl\w*|(?:dus|jasminov)\w* ryz\w*|(?:pecen|varen|stouchan|op[ea]kan|baby)\w* brambor\w*|(?:farmarsk\w* )?hranol\w*|testovin\w*|kysel\w* okurk\w*)\b)/g;
  const dishKey = title => key(title).replace(sideConnector, "");
  const date = value => new Date(value + "T12:00:00Z");
  const iso = value => value.toISOString().slice(0, 10);
  const add = (value, days) => iso(new Date(date(value).getTime() + days * 86400000));
  const weekday = value => (date(value).getUTCDay() + 6) % 7;
  const monday = value => add(value, -weekday(value));
  const age = (a, b) => Math.round((date(a) - date(b)) / 86400000);
  const localToday = () => new Intl.DateTimeFormat("sv-SE", {timeZone: "Europe/Prague"}).format(new Date());
  const side = dish => dish.sides.find(s => s !== "Zelenina a salát" && s !== "Bez určené přílohy") || dish.sides[0];
  const premium = dish => /\bflank\b|\broastbeef\b|\brostenec\b|\btelec|\bsteak z hovezi/.test(norm(dish.title));
  const mixedMeat = "Hovězí a vepřové";
  const meat = ["Kuřecí", "Hovězí", "Vepřové", mixedMeat, "Ryby", "Krůtí", "Ostatní maso", "Maso", "Bezmasé", "Vegan", "Neurčeno"];
  const matchesProtein = (protein, filter) => !filter || protein === filter ||
    (protein === mixedMeat && (filter === "Hovězí" || filter === "Vepřové"));
  const isPljeskavice = title => /\bpl(?:jesk|esk|isk)avic[ea]\b/.test(norm(title));

  function refineDish(row) {
    const title = norm(row.title);
    const mainCourse = row.kind !== "Polévka" && row.style !== "Polévky";
    let {protein, style} = row;
    if (mainCourse && protein === "Neurčeno" && isPljeskavice(row.title)) {
      protein = mixedMeat;
      style = "Pečené a grilované";
    }
    if (["Neurčeno","Bezmasé"].includes(protein) && /\bslanin\w*|\bspekem\b/.test(title)) protein = "Vepřové";
    if (mainCourse && protein === "Neurčeno" &&
        /\bcevab?cic|\bcevapcic|\bmlet\w* mas|\bmasov\w* (?:karbanat|kulick)|\bsekan(?:a pecene|y maslovy rizek)/.test(title)) {
      protein = "Maso";
    }
    if (/^smazeny masovy karbanatek/.test(title)) style = "Smažená jídla";

    const extras = [];
    if (mainCourse && /\bdynov\w* pyre\b/.test(title) && !/^dynov\w* pyre\b/.test(title)) extras.push("Dýňové pyré");
    if (mainCourse && /\bpecen\w* zelenin/.test(title) && !/^pecen\w* zelenin/.test(title)) extras.push("Pečená zelenina");
    if (mainCourse && /\bkysel\w* okurk/.test(title)) extras.push("Kyselá okurka");
    const combined = [...new Set([...row.sides, ...extras])];
    const sides = combined.length > 1 ? combined.filter(x => x !== "Bez určené přílohy") : combined;
    const sideLabels = sides.flatMap(side => {
      if (side === "Zelenina a salát" && sides.includes("Pečená zelenina")) return [];
      if (side === "Brambory") {
        if (/\bbramborov\w* kas/.test(title)) return ["Bramborová kaše"];
        if (/\bstouchan\w* brambor/.test(title)) return ["Šťouchané brambory"];
        if (/\bvaren\w* brambor/.test(title)) return ["Vařené brambory"];
        if (/\bpecen\w* brambor|\bpecen\w* grenail/.test(title)) return ["Pečené brambory"];
      }
      return [side];
    });
    return {...row, protein, style, sides, sideLabels};
  }

  function byTitle(rows) {
    const map = new Map();
    for (const row of rows) {
      const id = dishKey(row.title);
      if (!map.has(id)) map.set(id, {id, occurrences: []});
      map.get(id).occurrences.push(row);
    }
    return [...map.values()].map(entry => {
      entry.occurrences.sort((a, b) => b.date.localeCompare(a.date));
      entry.dates = [...new Set(entry.occurrences.map(row => row.date))];
      return {...entry, ...entry.occurrences[0]};
    });
  }

  function learn(rows) {
    const mains = rows.filter(r => r.kind === "Jídlo");
    const seen = Array.from({length: 7}, () => new Set());
    const schnitzel = new Set();
    const styles = Array.from({length: 7}, () => new Map());
    const byDay = new Map();
    for (const row of mains) {
      const day = weekday(row.date);
      seen[day].add(row.date);
      styles[day].set(row.style, (styles[day].get(row.style) || 0) + 1);
      if (day === 4 && row.style === "Řízky") schnitzel.add(row.date);
    }
    for (const row of rows) {
      if (!byDay.has(row.date)) byDay.set(row.date, []);
      byDay.get(row.date).push(row);
    }
    const standard = [...byDay.values()].filter(day => day.filter(x => x.kind === "Polévka").length === 2 &&
      day.filter(x => x.kind === "Jídlo").length === 4).length;
    const fourth = [...byDay.values()].map(day => day.filter(x => x.kind === "Jídlo")[3]).filter(Boolean);
    const vegetarianFourth = fourth.filter(dish => ["Bezmasé","Vegan"].includes(dish.protein)).length;
    return {mains, seen, schnitzel, styles, standard, fourth, vegetarianFourth};
  }

  function recommend(rows, settings) {
    const dates = settings.days.slice().sort();
    if (!dates.length) return [];
    const study = learn(rows.filter(row => row.date < dates[0]).slice().sort((a,b) => a.date.localeCompare(b.date)));
    const choices = byTitle(study.mains);
    const pinned = settings.pinned || {};
    const hasPriceLimit = Number.isFinite(settings.limit);
    const historyRanks = new Set();
    const previouslyProposedSides = [];
    const used = Object.values(pinned).flat();
    const prices = choices.filter(x => Number.isFinite(x.price)).map(x => x.price).sort((a, b) => a - b);
    const upperPrice = prices[Math.floor(prices.length * .82)] || 180;
    let fish = used.filter(x => x.protein === "Ryby").length;
    let costly = used.filter(x => premium(x) || (x.price || 0) > upperPrice).length;
    return dates.map(day => {
      const dow = weekday(day);
      const existing = pinned[day] || [];
      const latest = previouslyProposedSides.at(-1);
      const previousFriday = study.mains.filter(r => r.style === "Řízky" && weekday(r.date) === 4).at(-1);
      const pattern = dow === 4 && study.seen[4].size > 0 && study.schnitzel.size / study.seen[4].size >= .6;
      const ranked = choices.flatMap(dish => {
        if (settings.proteins.length && !settings.proteins.includes(dish.protein)) return [];
        if (hasPriceLimit && (!Number.isFinite(dish.price) || dish.price > settings.limit)) return [];
        if (used.some(x => dishKey(x.title) === dish.id)) return [];
        if (fish >= 1 && dish.protein === "Ryby") return [];
        if (costly >= 1 && (premium(dish) || (dish.price || 0) > upperPrice)) return [];
        const elapsed = age(day, dish.date);
        if (elapsed < 0) return [];
        const matches = dish.vegetables.filter(v => settings.vegetables.includes(v));
        const dishSide = side(dish);
        const sameDaySide = existing.some(x => side(x) === dishSide);
        const countStyle = study.styles[dow].get(dish.style) || 0;
        const scoreReasons = [];
        let score = Math.min(elapsed, 180) / 11 + Math.log2(dish.dates.length + 1) * 1.5;
        score += Math.min(countStyle / Math.max(1, study.seen[dow].size) * 3, 5);
        if (elapsed >= 35) scoreReasons.push("Na menu chybělo " + elapsed + " dní");
        if (elapsed < 14) score -= 14;
        if (pattern && dish.style === "Řízky") {
          score += 20;
          scoreReasons.push("Páteční vzor · řízky na " + study.schnitzel.size + " z " + study.seen[4].size + " pátků");
          if (previousFriday && side(previousFriday) !== dishSide) {
            score += 4;
            scoreReasons.push("Jiná příloha než u posledního pátečního řízku");
          }
        }
        if (matches.length) {
          score += matches.length * 7;
          scoreReasons.push("Preferovaná zelenina · " + matches.join(", "));
        }
        if (dishSide === latest && dishSide !== "Bez určené přílohy") score -= 5;
        if (sameDaySide) score -= 6;
        if (historyRanks.has(dish.id)) score -= 26;
        if (dish.price && dish.price <= upperPrice) score += 1.25;
        if (premium(dish) || (dish.price || 0) > upperPrice) score -= 7;
        return [{...dish, score, reasons: scoreReasons.length ? scoreReasons : ["Už bylo na jídelním lístku"]}];
      }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "cs"));
      const ideas = ranked.slice(0, 1);
      if (ideas.length) {
        const alternatives = ranked.slice(1);
        const differentSide = alternatives.find(x => side(x) !== side(ideas[0]) && x.score >= ideas[0].score - 9);
        const second = differentSide || alternatives[0];
        if (second) ideas.push(second);
        const remaining = alternatives.filter(x => x !== second);
        const meatless = dish => ["Bezmasé","Vegan"].includes(dish.protein);
        const offerMeatless = !settings.proteins.length && !ideas.some(meatless) && study.fourth.length &&
          study.vegetarianFourth / study.fourth.length > .5;
        const vegetarian = offerMeatless && remaining.find(meatless);
        if (vegetarian) {
          ideas.push({...vegetarian, reasons:[...vegetarian.reasons, "Bezmasý čtvrtý chod byl častý v minulých menu"]});
        } else if (remaining.length) ideas.push(remaining[0]);
      }
      const top = ideas[0];
      if (top) {
        historyRanks.add(top.id);
        previouslyProposedSides.push(side(top));
        if (top.protein === "Ryby") fish++;
        if (premium(top) || (top.price || 0) > upperPrice) costly++;
      }
      return {day, ideas};
    });
  }

  function related(dish, dishes) {
    const omit = new Set(["kureci","veprovy","veprove","hovezi","s","a","na","se","brambory","duse", "pecene"]);
    const words = new Set(dish.id.split(" ").filter(x => x.length >= 4 && !omit.has(x)));
    return dishes.filter(x => x.id !== dish.id && x.kind === dish.kind).map(x => {
      let score = x.protein !== "Neurčeno" &&
        (matchesProtein(x.protein, dish.protein) || matchesProtein(dish.protein, x.protein)) ? 3 : 0;
      if (x.style === dish.style && x.style !== "Ostatní jídla") score += 4;
      if (side(x) === side(dish) && side(x) !== "Bez určené přílohy") score += 2;
      score += x.id.split(" ").filter(word => words.has(word)).length;
      return {score, dish: x};
    }).filter(x => x.score >= 4).sort((a,b) => b.score-a.score || b.dish.date.localeCompare(a.dish.date)).slice(0, 5);
  }

  global.Chef = {norm, key, dishKey, date, iso, add, weekday, monday, localToday, meat, mixedMeat, matchesProtein, refineDish, byTitle, learn, recommend, related};
})(typeof window === "object" ? window : globalThis);
