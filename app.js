"use strict";
const $ = id => document.getElementById(id);
const C = window.Chef;
const dayNames = ["Pondělí","Úterý","Středa","Čtvrtek","Pátek"];
const formats = {
  date: new Intl.DateTimeFormat("cs-CZ", {dateStyle:"medium",timeZone:"UTC"}),
  day: new Intl.DateTimeFormat("cs-CZ", {weekday:"long",day:"numeric",month:"numeric",year:"numeric",timeZone:"UTC"}),
  month: new Intl.DateTimeFormat("cs-CZ", {month:"long",year:"numeric",timeZone:"UTC"}),
  week: new Intl.DateTimeFormat("cs-CZ", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}),
  shortWeek: new Intl.DateTimeFormat("cs-CZ", {day:"numeric",month:"long",timeZone:"UTC"})
};
const labelDate = value => formats.date.format(C.date(value));
const capitalize = text => text[0].toUpperCase() + text.slice(1);
const labelDay = value => {
  const text = formats.day.format(C.date(value));
  return capitalize(text);
};
function labelWeek(week, long = false) {
  const end = C.add(week,4);
  const format = long || week.slice(0,4) !== end.slice(0,4) ? formats.week : formats.shortWeek;
  return format.formatRange(C.date(week), C.date(end));
}
const formatPrice = price => Number.isFinite(price) ? price + " Kč" : "";
const words = (value, input) => C.key(input).split(" ").filter(Boolean).every(word => C.key(value).includes(word));
const photos = new Map();
for (const row of window.CHEF_PHOTOS || []) {
  const id = C.dishKey(row.title);
  const views = row.images?.length ? row.images : row.image ? [{image:row.image, date:row.date}] : [];
  if (!photos.has(id)) photos.set(id, {...row, images:[]});
  const combined = photos.get(id).images;
  for (const view of views) {
    if (!combined.some(old => old.image === view.image)) combined.push(view);
  }
}
const unavailablePhotos = new Set();
function dishPhotos(id) {
  const views = photos.get(id)?.images || [];
  return views.filter(view => !unavailablePhotos.has(view.image));
}
const hasPhoto = id => dishPhotos(id).length > 0;
const savedStore = "peters-canteen-history-v1";
const draftStore = "peters-canteen-draft-v1";
function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function saveStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
let additions = readStore(savedStore, []);
let draft = readStore(draftStore, {});
let history, dishes, weeks;
let shown = 24;
let selectedHistoryDate = null;
let selectedWeek = "";
let currentIdeas = [];
let weekForDraft = "";
let menuRowBeingEdited = null;

function el(tag, text, className) {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function dishImage(dish, {lazy = false, view = dishPhotos(dish.id)[0]} = {}) {
  const img = el("img");
  if (lazy) img.loading = "lazy";
  const showPlaceholder = () => {
    img.alt = "Fotka jídla není k dispozici";
    img.src = "assets/no-foto.png";
  };
  if (view && !unavailablePhotos.has(view.image)) {
    img.alt = dish.title;
    img.addEventListener("error", () => {
      const wasAvailable = hasPhoto(dish.id);
      unavailablePhotos.add(view.image);
      showPlaceholder();
      if (wasAvailable && !hasPhoto(dish.id) && $("with-photo").checked) renderGallery();
    }, {once:true});
    img.src = view.image;
  } else {
    showPlaceholder();
  }
  return img;
}

function trigger(label, action, className = "secondary") {
  const b = el("button", label, className);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}

const proteinIcons = new Map([
  ["Kuřecí", "drumstick"], ["Krůtí", "drumstick"], ["Hovězí", "beef"], ["Vepřové", "ham"],
  [C.mixedMeat, "beef"],
  ["Ryby", "fish"], ["Ostatní maso", "utensils"], ["Maso", "utensils"], ["Bezmasé", "leaf"], ["Vegan", "leaf"]
]);

function tags(row) {
  const box = el("div", "", "dish-labels");
  const main = el("div", "", "dish-labels-main");
  const iconName = proteinIcons.get(row.protein);
  if (iconName) {
    const badge = el("span", "", iconName === "leaf" ? "protein-badge plant" : "protein-badge");
    const icon = el("img", "", "protein-icon");
    icon.alt = "";
    icon.src = "assets/icons/" + iconName + ".svg";
    badge.append(icon, document.createTextNode(row.protein));
    main.append(badge);
  }
  const style = row.style === "Sladká jídla a dezerty" ? "Sladké" : row.style;
  if (style && !["Ostatní jídla","Polévky"].includes(style)) main.append(el("span", style, "dish-style"));
  if (main.childElementCount) box.append(main);
  const sides = [...new Set((row.sideLabels || row.sides).filter(s => s && s !== "Bez určené přílohy"))];
  if (sides.length) {
    const line = el("p", "", "dish-sides");
    line.append(el("span", "Příloha", "dish-sides-label"), document.createTextNode(" " + sides.join(" · ")));
    box.append(line);
  }
  return box;
}

function countLabel(count) {
  return count === 1 ? "1× na menu" : count ? count + "× na menu" : "Fotka z archivu";
}

function fill(select, title, values) {
  const old = select.value;
  select.replaceChildren(new Option(title, ""), ...values.map(s => new Option(s, s)));
  if (values.includes(old)) select.value = old;
}

function recordID(row) {
  return [row.date,row.kind,C.dishKey(row.title)].join("|");
}

function reloadData() {
  const unique = new Map(window.HISTORY.map(row => [recordID(row), row]));
  for (const row of additions) unique.set(recordID(row), row);
  history = [...unique.values()].map(C.refineDish).sort((a,b) => a.date.localeCompare(b.date));
  const served = C.byTitle(history);
  for (const [id, row] of photos) {
    if (!served.some(dish => dish.id === id)) {
      served.push({...row, id, dates:[], occurrences:[]});
    }
  }
  dishes = served.sort((a,b) => Number(photos.has(b.id))-Number(photos.has(a.id)) || b.date.localeCompare(a.date));
  weeks = [...new Set(history.map(row => C.monday(row.date)))].sort().reverse();
  if (!weeks.includes(selectedWeek)) selectedWeek = weeks[0] || "";
  renderWeekOptions();
  fill($("protein"), "Všechny suroviny", C.meat);
  fill($("side"), "Všechny přílohy", [...new Set(dishes.flatMap(d => d.sides))].sort((a,b)=>a.localeCompare(b,"cs")));
  fillStyles();
  renderGallery();
  renderHistory();
  const learned = C.learn(history);
  $("plan-evidence").textContent = "Řízky na " + learned.schnitzel.size + " z " + learned.seen[4].size +
    " doložených pátků · Dvě polévky a čtyři hlavní chody v " + learned.standard + " dnech.";
}

function fillStyles() {
  const protein = $("protein").value;
  fill($("style"), "Všechny typy", [...new Set(dishes.filter(d => (d.kind !== "Polévka" || photos.has(d.id)) &&
    C.matchesProtein(d.protein, protein)).map(d => d.style))].sort((a,b)=>a.localeCompare(b,"cs")));
}

function renderGallery() {
  const query = $("dish-query").value;
  const protein = $("protein").value;
  const style = $("style").value;
  const side = $("side").value;
  const filtered = dishes.filter(d => (d.kind !== "Polévka" || photos.has(d.id)) && (!query || words(d.title, query)) &&
    C.matchesProtein(d.protein, protein) && (!style || d.style === style) && (!side || d.sides.includes(side)) &&
    (!$("with-photo").checked || hasPhoto(d.id)));
  $("gallery-count").textContent = "Nalezeno " + filtered.length;
  const grid = $("dish-grid");
  grid.replaceChildren();
  for (const dish of filtered.slice(0, shown)) {
    const card = el("article", "", "dish");
    card.append(dishImage(dish, {lazy:true}));
    const body = el("div", "", "dish-body");
    const h = el("h2");
    h.append(trigger(dish.title, () => detail(dish), "dish-title"));
    body.append(h, tags(dish), el("div", countLabel(dish.dates.length) + (dish.dates.length ? " · naposledy " + labelDate(dish.dates[0]) : ""), "meta"));
    card.append(body);
    grid.append(card);
  }
  if (!filtered.length) {
    const noVegan = protein === "Vegan" && !dishes.some(d => d.protein === "Vegan");
    grid.append(el("p", noVegan ? "V historii zatím není jídlo potvrzené jako vegan." : "Žádné jídlo neodpovídá zadaným filtrům.", "empty"));
  }
  $("more").hidden = shown >= filtered.length;
}

function detailPhotos(dish, preferredDate) {
  const views = dishPhotos(dish.id);
  const figure = el("figure", "", "detail-photos");
  const main = el("div", "", "detail-photo");
  figure.append(main);

  function showPhoto(view) {
    const image = dishImage(dish, {view});
    main.replaceChildren(image);
    if (view) {
      const expand = trigger("⛶", () => {
        $("photo-viewer-image").replaceChildren(dishImage(dish, {view}));
        $("photo-viewer").showModal();
      }, "secondary photo-expand");
      expand.setAttribute("aria-label", "Zvětšit fotku na celou obrazovku");
      expand.title = "Zvětšit fotku";
      image.addEventListener("error", () => { expand.hidden = true; }, {once:true});
      main.append(expand);
    }
  }

  if (views.length < 2) {
    showPhoto(views[0]);
    return figure;
  }

  const caption = el("figcaption", "", "photo-caption");
  caption.setAttribute("aria-live", "polite");
  const thumbnails = el("div", "", "photo-thumbnails");
  thumbnails.setAttribute("role", "group");
  thumbnails.setAttribute("aria-label", "Záběry jídla");
  const choices = views.map((view, index) => {
    const choice = trigger("", () => selectPhoto(index), "photo-thumb");
    choice.setAttribute("aria-label", "Záběr " + (index + 1) + " z " + views.length + (view.date ? ", " + labelDate(view.date) : ""));
    const thumbnail = dishImage(dish, {lazy:true, view});
    thumbnail.alt = "";
    choice.append(thumbnail);
    thumbnails.append(choice);
    return choice;
  });
  function selectPhoto(index) {
    const view = views[index];
    showPhoto(view);
    caption.textContent = "Záběr " + (index + 1) + " z " + views.length + (view.date ? " · " + labelDate(view.date) : "");
    choices.forEach((choice, i) => choice.setAttribute("aria-pressed", String(i === index)));
  }
  selectPhoto(Math.max(0, views.findIndex(view => preferredDate && view.date === preferredDate)));
  figure.append(caption, thumbnails);
  return figure;
}

function detail(dish, preferredDate) {
  const contents = $("dish-detail");
  const heading = el("h2", dish.title);
  heading.id = "dish-detail-title";
  heading.tabIndex = -1;
  contents.replaceChildren(heading, tags(dish), el("p", countLabel(dish.dates.length), "meta"), detailPhotos(dish, preferredDate));
  if (dish.dates.length) {
    contents.append(el("h3", "Data v jídelníčku"));
    const dates = el("div", "", "date-links");
    for (const day of dish.dates) {
      const a = el("a", labelDate(day));
      a.href = "#historie";
      a.addEventListener("click", event => { event.preventDefault(); openHistory(day); });
      dates.append(a);
    }
    contents.append(dates);
  }
  const linked = C.related(dish, dishes);
  if (linked.length) {
    const section = el("section", "", "similar-dishes");
    section.append(el("h3", "Podobná jídla"));
    const list = el("ul", "", "similar-list");
    for (const item of linked) {
      const li = el("li");
      li.append(trigger(item.dish.title, () => detail(item.dish), "similar-dish"));
      list.append(li);
    }
    section.append(list);
    contents.append(section);
  }
  const dialog = $("detail");
  if (!dialog.open) dialog.showModal();
  else heading.focus({preventScroll:true});
  dialog.scrollTop = 0;
  $("detail-top").hidden = true;
}

function renderWeekOptions() {
  const panel = $("history-week-options");
  panel.replaceChildren();
  let previousMonth = "";
  let options;
  for (const week of weeks) {
    const month = week.slice(0,7);
    if (month !== previousMonth) {
      const group = el("section");
      options = el("div", "", "week-choices");
      group.append(el("h3", capitalize(formats.month.format(C.date(week))), "week-month"), options);
      panel.append(group);
      previousMonth = month;
    }
    const option = trigger(labelWeek(week), () => {
      chooseWeek(week);
      setWeekOptionsOpen(false, true);
    }, "week-option");
    option.dataset.week = week;
    options.append(option);
  }
}

function setWeekOptionsOpen(open, focus = false) {
  const panel = $("history-week-options");
  panel.hidden = !open;
  const toggle = $("history-week-toggle");
  toggle.setAttribute("aria-expanded", String(open));
  if (open) {
    const option = panel.querySelector('[aria-current="true"]') || panel.querySelector("button");
    if (option) {
      panel.scrollTop += option.getBoundingClientRect().top - panel.getBoundingClientRect().top - 44;
      option.focus({preventScroll:true});
    }
  } else if (focus) toggle.focus({preventScroll:true});
}

function chooseWeek(week) {
  selectedWeek = week;
  selectedHistoryDate = null;
  $("history-query").value = "";
  renderHistory();
}

function openHistory(day) {
  selectedHistoryDate = day;
  $("detail").close();
  $("history-query").value = "";
  selectedWeek = C.monday(day);
  location.hash = "historie";
  updateRoute();
  renderHistory();
  requestAnimationFrame(() => $("day-" + day)?.scrollIntoView({block:"start"}));
}

function renderHistory() {
  const index = weeks.indexOf(selectedWeek);
  $("history-week-value").textContent = index < 0 ? "Žádné týdny" : labelWeek(selectedWeek, true);
  $("history-week-toggle").disabled = index < 0;
  $("history-week-options").querySelectorAll(".week-option").forEach(option => {
    if (option.dataset.week === selectedWeek) option.setAttribute("aria-current","true");
    else option.removeAttribute("aria-current");
  });
  $("previous-week").disabled = index < 0 || index >= weeks.length - 1;
  $("next-week").disabled = index <= 0;
  const filter = $("history-query").value.trim();
  const table = new Map();
  const result = filter ? history.filter(row => words(row.title, filter)).slice().reverse() :
    history.filter(row => C.monday(row.date) === weeks[index]);
  for (const row of result) {
    if (!table.has(row.date)) table.set(row.date, []);
    table.get(row.date).push(row);
  }
  const container = $("menus");
  container.replaceChildren();
  for (const [day, rows] of table) {
    const section = el("article", "", "panel history-day");
    section.id = "day-" + day;
    if (day === selectedHistoryDate) section.style.borderColor = "var(--accent)";
    section.append(el("h2", labelDay(day)));
    for (const kind of ["Polévka", "Jídlo"]) {
      const courses = rows.filter(r => r.kind === kind);
      if (!courses.length) continue;
      section.append(el("h3", kind === "Polévka" ? "Polévky" : "Hlavní chody", "section-label"));
      for (const row of courses) {
        const article = el("div", "", "history-dish");
        const title = dishes.find(d => d.id === C.dishKey(row.title));
        article.append(trigger(row.title, () => detail(title, day), "link"), el("strong", formatPrice(row.price)));
        if (kind === "Jídlo") article.append(tags(row));
        if (row.allergens) article.append(el("div", "Alergeny v tehdejším menu " + row.allergens, "meta"));
        if (additions.some(item => recordID(item) === recordID(row))) {
          article.append(trigger("Upravit záznam", () => editMenu(row)));
        }
        section.append(article);
      }
    }
    container.append(section);
  }
  if (!table.size) container.append(el("p","Pro tento výběr nejsou žádné záznamy.","empty"));
}

function checks(parent, values, checked = true) {
  for (const [value, label] of values) {
    const name = el("label");
    const input = el("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = checked;
    name.append(input, document.createTextNode(label));
    parent.append(name);
  }
}
const checked = id => [...$(id).querySelectorAll(":checked")].map(x => x.value);

function plannedWeek() {
  return $("week-start").value ? C.monday($("week-start").value) : "";
}

function persistDraft() {
  const ok = saveStore(draftStore,draft);
  $("draft-status").textContent = ok ? "" : "Rozpracovaný týden je uložený jen po dobu otevření stránky.";
}

function renderDraft() {
  const sheet = $("draft");
  sheet.replaceChildren();
  const monday = plannedWeek();
  const items = Object.entries(draft).filter(([day]) => C.monday(day) === monday && draft[day].length).sort(([a],[b])=>a.localeCompare(b));
  $("copy-draft").disabled = !items.length;
  if (!items.length) sheet.append(el("p","Připnuté návrhy se objeví tady.","meta"));
  for (const [day, rows] of items) {
    const section = el("div", "", "draft-item");
    section.append(el("h3", labelDay(day)));
    for (const row of rows) {
      const paragraph = el("p", row.title + " ");
      paragraph.append(trigger("Odebrat",()=> {
        draft[day] = draft[day].filter(x => x.id !== row.id);
        if (!draft[day].length) delete draft[day];
        persistDraft();
        renderDraft();
        if (weekForDraft === monday) generate();
      }, "link"));
      section.append(paragraph);
    }
    sheet.append(section);
  }
  return items;
}

function generate() {
  const monday = plannedWeek();
  if (!monday) return;
  const rawLimit = $("price-limit").value;
  const pinned = Object.fromEntries(Object.entries(draft).filter(([day]) => C.monday(day) === monday));
  const settings = {
    days:checked("plan-days").map(i => C.add(monday, Number(i))), proteins:checked("plan-proteins"),
    vegetables:checked("plan-vegetables"), limit:rawLimit === "" ? Infinity : Number(rawLimit), pinned
  };
  currentIdeas = C.recommend(history, settings);
  weekForDraft = monday;
  const target = $("ideas");
  target.replaceChildren();
  if (!settings.days.length) target.append(el("p","Vyber alespoň jeden den.","empty"));
  for (const result of currentIdeas) {
    const section = el("article", "", "panel day");
    section.append(el("h2", labelDay(result.day)));
    for (const dish of result.ideas) {
      const idea = el("div", "", "idea");
      idea.append(trigger(dish.title, () => detail(dish), "dish-title"), tags(dish),
        el("div", "Naposledy " + labelDate(dish.date) + (formatPrice(dish.price) ? " · tehdy " + formatPrice(dish.price) : ""), "meta"),
        el("div", dish.reasons.join(" · "), "meta"));
      const actions = el("div", "", "idea-actions");
      actions.append(trigger("Připnout na tento den", () => {
        (draft[result.day] ??= []).push({id:dish.id,title:dish.title,date:dish.date,protein:dish.protein,price:dish.price,sides:dish.sides});
        persistDraft();
        renderDraft();
        generate();
      }));
      idea.append(actions);
      section.append(idea);
    }
    if (!result.ideas.length) section.append(el("p","V historii nejsou další návrhy pro tyto suroviny, cenový strop a skladbu týdne.","empty"));
    target.append(section);
  }
}

function guess(title, kind) {
  const t = C.norm(title);
  const patterns = [
    ["Kuřecí", /\bkurec|\bkure\b/],["Hovězí", /\bhovez|\bflank|\btelec/],["Vepřové", /\bvepr|\bkrkovic|\bpanenk/],
    ["Ryby", /\blosos|\btresk|\bpstruh|\bryb|\bcandat/],["Krůtí", /\bkruti/],["Vegan", /\bvegan/],
    ["Ostatní maso", /\bkachn|\bzverin|\bklobas/],["Bezmasé", /bezmase|\btofu/]
  ];
  const chosen = patterns.find(([,rx])=>rx.test(t));
  const sides = [["Knedlíky",/knedl/],["Rýže",/ryz/],["Hranolky",/hranol/],["Krokety",/kroket/],["Bramborový salát",/bramborov\w* salat/],["Těstoviny",/testovin/]];
  const matched = sides.filter(([,rx])=>rx.test(t)).map(([name])=>name);
  if (!matched.length && /brambor/.test(t)) matched.push("Brambory");
  return {protein:chosen ? chosen[0] : "Neurčeno",sides:matched.length?matched:["Bez určené přílohy"],
    style:kind==="Polévka"?"Polévky":/rizek/.test(t)?"Řízky":/kari|kung.?pao|thajsk/.test(t)?"Asijská jídla":
      /omack|gulas|na smetane|rag[uou]/.test(t)?"S omáčkou a dušené":/pecen|grilovan|spiz/.test(t)?"Pečené a grilované":"Ostatní jídla",
    vegetables:[]};
}

function editMenu(row = null) {
  menuRowBeingEdited = row;
  $("edit-title").textContent = row ? "Upravit záznam" : "Doplnit jídelní lístek";
  $("edit-status").textContent = "";
  $("edit-date").value = row ? row.date : selectedHistoryDate || C.localToday();
  $("edit-kind").value = row ? row.kind : "Jídlo";
  $("edit-lines").value = row ? [row.title,row.price??"",row.protein,row.sides.join(", "),row.style].join(" | ") : "";
  $("edit-menu").showModal();
}

function validateRecord(row) {
  return row && typeof row.title==="string" && row.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    Number.isFinite(C.date(row.date).getTime()) && C.iso(C.date(row.date)) === row.date &&
    ["Jídlo","Polévka"].includes(row.kind) && (row.price===null || Number.isFinite(row.price) && row.price>=0) &&
    C.meat.includes(row.protein) && typeof row.style==="string" && typeof row.allergens==="string" &&
    Array.isArray(row.sides) && row.sides.every(x=>typeof x==="string") &&
    Array.isArray(row.vegetables) && row.vegetables.every(x=>typeof x==="string");
}

function recordUpdate(rows, remove) {
  const records = new Map(additions.map(r=>[recordID(r),r]));
  if (remove) records.delete(recordID(remove));
  rows.forEach(r=>records.set(recordID(r), r));
  additions = [...records.values()];
  const saved = saveStore(savedStore, additions);
  reloadData();
  $("edit-status").textContent = saved ? "Uloženo do tohoto prohlížeče." : "Záznamy jsou v této relaci. Stáhni je pro další použití.";
  $("edit-lines").value = "";
  menuRowBeingEdited = null;
}

function updateRoute() {
  const routes = ["galerie","generator","historie"];
  const locationName = location.hash.slice(1);
  const name = routes.includes(locationName) ? locationName : "galerie";
  routes.forEach(route => $(route).hidden = route !== name);
  document.querySelectorAll("nav a").forEach(a => {
    if (a.hash === "#" + name) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
}

$("filters").addEventListener("submit", e=>e.preventDefault());
$("filters").addEventListener("input", e=>{
  if(e.target === $("protein")) fillStyles();
  shown = 24;
  renderGallery();
});
$("filters").addEventListener("reset", ()=> setTimeout(()=> {fillStyles(); shown=24; renderGallery();},0));
$("more").onclick = () => {shown += 24; renderGallery();};
$("history-week-toggle").onclick = () => setWeekOptionsOpen($("history-week-options").hidden);
$("history-week-picker").addEventListener("keydown", event => {
  const panel = $("history-week-options");
  if (panel.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setWeekOptionsOpen(false, true);
    return;
  }
  if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
  const options = [...panel.querySelectorAll(".week-option")];
  const index = options.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
    Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
  options[next].focus({preventScroll:true});
  options[next].scrollIntoView({block:"nearest"});
});
$("history-week-picker").addEventListener("focusout", event => {
  if (event.relatedTarget && !$("history-week-picker").contains(event.relatedTarget)) setWeekOptionsOpen(false);
});
document.addEventListener("click", event => {
  if (!$("history-week-picker").contains(event.target)) setWeekOptionsOpen(false);
});
$("history-query").oninput = () => {selectedHistoryDate = null; renderHistory();};
$("previous-week").onclick = () => chooseWeek(weeks[weeks.indexOf(selectedWeek)+1]);
$("next-week").onclick = () => chooseWeek(weeks[weeks.indexOf(selectedWeek)-1]);
$("add-menu").onclick = () => editMenu();
document.querySelectorAll("[data-close]").forEach(button=>button.onclick=()=>button.closest("dialog").close());
$("detail").addEventListener("scroll", () => {
  $("detail-top").hidden = $("detail").scrollTop < 180;
}, {passive:true});
$("detail-top").onclick = () => {
  $("dish-detail-title").focus({preventScroll:true});
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("detail").scrollTo({top:0, behavior:reducedMotion ? "instant" : "smooth"});
};
$("menu-form").onsubmit = e=>{
  e.preventDefault();
  const day = $("edit-date").value;
  const kind = $("edit-kind").value;
  const rows = $("edit-lines").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
    const [title,cost,protein,sides,style,vegetables] = line.split("|").map(x=>x.trim());
    const row = {date:day,kind,title,price:cost?Number(cost.replace(",", ".")):null,allergens:"",...guess(title,kind)};
    if(protein) row.protein = C.meat.find(x=>C.key(x)===C.key(protein)) || protein;
    if(sides) row.sides = sides.split(",").map(s=>s.trim()).filter(Boolean);
    if(style && kind!=="Polévka") row.style=style;
    if(menuRowBeingEdited && C.dishKey(title)===C.dishKey(menuRowBeingEdited.title)) {
      row.vegetables = menuRowBeingEdited.vegetables;
      row.allergens = menuRowBeingEdited.allergens;
    }
    if(vegetables) row.vegetables = vegetables.split(",").map(s=>s.trim()).filter(Boolean);
    return row;
  });
  if(!rows.length || !rows.every(validateRecord)) {
    $("edit-status").textContent = "Zkontroluj názvy, ceny a označení surovin podle galerie.";
    return;
  }
  recordUpdate(rows, menuRowBeingEdited);
  $("edit-menu").close();
  openHistory(day);
};
function download(text, name, type) {
  const source = URL.createObjectURL(new Blob([text], {type}));
  const link = el("a");
  link.href = source; link.download = name; link.click();
  setTimeout(()=>URL.revokeObjectURL(source),1000);
}
$("export-menu").onclick = () => download(JSON.stringify(additions,null,2),"peters-canteen-doplnena-historie.json","application/json");
$("export-shared").onclick = () => download("window.HISTORY = " + JSON.stringify(history) + ";\n","history.js","text/javascript");
$("import-menu").onchange = async e=>{
  const file = e.target.files[0];
  if(!file) return;
  try {
    const rows = JSON.parse(await file.text());
    if(!Array.isArray(rows)||!rows.every(validateRecord)) throw Error("Neplatné záznamy");
    recordUpdate(rows);
  } catch {
    $("edit-status").textContent = "Soubor není export historie v podporovaném formátu.";
  } finally {e.target.value="";}
};
$("plan-form").onsubmit = e=>{e.preventDefault();generate();};
$("week-start").onchange = () => {
  $("ideas").replaceChildren(); weekForDraft=""; renderDraft();
};
$("copy-draft").onclick = async ()=>{
  const text = renderDraft().map(([day,rows]) => labelDay(day) + "\n" + rows.map(r=>"• "+r.title).join("\n")).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    $("draft-status").textContent="Zkopírováno.";
  } catch {
    const area = el("textarea");
    area.value = text;
    area.rows = 8;
    area.readOnly = true;
    $("draft-status").replaceChildren(area);
    area.select();
  }
};
checks($("plan-days"),dayNames.map((name,i)=>[String(i),name]));
checks($("plan-proteins"),C.meat.filter(x=>x!=="Neurčeno").map(x=>[x,x]),false);
checks($("plan-vegetables"),[...new Set(window.HISTORY.flatMap(x=>x.vegetables))].sort((a,b)=>a.localeCompare(b,"cs")).map(x=>[x,x]),false);
$("week-start").value = C.add(C.monday(C.localToday()), 7);
window.addEventListener("hashchange",updateRoute);
reloadData();
renderDraft();
updateRoute();
