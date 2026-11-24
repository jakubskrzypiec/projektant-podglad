const body = document.body;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* TRYB DIAGNOSTYCZNY — tylko z ?diag=1 w adresie, dla zwyklych gosci
   nic sie nie zmienia. Pokazuje na ekranie telefonu, co sie naprawde
   dzieje (wersja plikow, ruch karuzeli, bledy skryptu, fokus/zdarzenia
   przy zgodzie), bo czesci zachowan iPhone'a nie da sie odtworzyc poza nim. */
const diag = (() => {
  if (!/[?&]diag=1/.test(location.search)) return () => {};
  const pudlo = document.createElement("pre");
  pudlo.style.cssText = "position:fixed;left:6px;right:6px;bottom:6px;z-index:99999;margin:0;padding:8px;max-height:42vh;overflow:auto;background:rgba(0,0,0,.82);color:#9f9;font:11px/1.35 monospace;white-space:pre-wrap;border-radius:8px;pointer-events:none";
  const linie = [];
  const pisz = tekst => {
    linie.push(`${(performance.now() / 1000).toFixed(1)}s ${tekst}`);
    if (linie.length > 40) linie.shift();
    pudlo.textContent = linie.join("\n");
  };
  const wersja = document.querySelector('script[src*="script.js"]')?.getAttribute("src") || "?";
  const css = document.querySelector('link[href*="style.css"]')?.getAttribute("href") || "?";
  const start = () => {
    document.body.append(pudlo);
    pisz(`${wersja} | ${css} | ${innerWidth}x${innerHeight} | rm=${reduceMotion}`);
    pisz(navigator.userAgent.slice(0, 120));
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  window.addEventListener("error", e => pisz(`BLAD: ${e.message} @${e.lineno}`));
  window.addEventListener("unhandledrejection", e => pisz(`BLAD promise: ${e.reason}`));
  /* Przez 2 s po dotknieciu zgody: kazda animacja/przejscie CSS, fokus
     i "najechanie" (iPhone emuluje mysz przy dotyku) — z nazwa elementu. */
  let sledzDo = 0;
  const nazwa = el => el && el.tagName ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}` : "?";
  document.addEventListener("touchstart", e => {
    if (e.target.closest?.(".contact-form")) { sledzDo = performance.now() + 2000; pisz(`dotyk: ${nazwa(e.target)}`); }
  }, { capture: true, passive: true });
  const jesliSledzimy = f => e => { if (performance.now() < sledzDo) f(e); };
  document.addEventListener("transitionrun", jesliSledzimy(e => pisz(`przejscie: ${nazwa(e.target)}${e.pseudoElement || ""} ${e.propertyName}`)), true);
  document.addEventListener("animationstart", jesliSledzimy(e => pisz(`animacja: ${nazwa(e.target)} ${e.animationName}`)), true);
  document.addEventListener("focusin", jesliSledzimy(e => pisz(`fokus: ${nazwa(e.target)}`)), true);
  document.addEventListener("mouseover", jesliSledzimy(e => pisz(`najechanie: ${nazwa(e.target)}`)), true);
  /* Zmiana widocznej wysokosci = iPhone pokazal/schowal pasek systemowy. */
  window.visualViewport?.addEventListener("resize", () =>
    pisz(`ekran: widoczna wysokosc ${Math.round(window.visualViewport.height)} (okno ${innerHeight})`));
  return pisz;
})();

/* Header and navigation */
const header = document.querySelector("[data-header]");
const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 40);
};
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

/* ============================================================
   PRZEWIJANIE — jedno miejsce dla calej strony.

   Wczesniej pozycja strony byla ruszana przez cztery niezalezne
   mechanizmy naraz: globalne scroll-behavior: smooth, petle
   trzymajWMiejscu, scrollIntoView w pakietach i w ofercie oraz
   przywracanie pozycji po zamknieciu galerii. Kazdy z nich mial
   wlasny czas trwania, wiec potrafily przesuwac strone jednoczesnie
   w dwie strony, a kolejne klikniecia dokladaly nowe petle. Stad
   "losowe przeskoki" i zjezdzanie strony po kilku klknieciach.
   Teraz wszystko przechodzi przez te trzy funkcje.
   ============================================================ */

/* Realna wysokosc przyklejonego naglowka — cel przewijania ma sie o nia oprzec. */
const wysokoscNaglowka = () => header?.getBoundingClientRect().height || 68;

/* Wykonaj skok bez animacji przegladarki.

   Nie ruszamy tu stylu inline documentElement.scrollBehavior, bo poprzednia
   wersja przy dwoch rownoleglych wywolaniach zapisywala "auto" na stale
   i plynne przewijanie kotwic gaslo do konca sesji. Licznik + atrybut
   w HTML jest odporny na zagniezdzenie. */
let glebokoscBlokadyPlynnosci = 0;
const bezPlynnego = akcja => {
  const korzen = document.documentElement;
  if (glebokoscBlokadyPlynnosci === 0) korzen.dataset.scrollNatychmiast = "1";
  glebokoscBlokadyPlynnosci += 1;
  try {
    akcja();
  } finally {
    glebokoscBlokadyPlynnosci -= 1;
    if (glebokoscBlokadyPlynnosci === 0) delete korzen.dataset.scrollNatychmiast;
  }
};

/* Jedno trzymanie naraz — nowe klikniecie przerywa poprzednie. */
let aktywneTrzymanie = null;

/* Przewin do elementu, zostawiajac miejsce na naglowek.
   Zastepuje scrollIntoView, ktore nie wiedzialo o przyklejonym naglowku
   i ladowalo tresc pod nim. */
const przewinDoElementu = (element, { odstep = 22, plynnie = false } = {}) => {
  if (!element) return null;
  aktywneTrzymanie?.stop();

  const maksymalny = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  );
  const cel = Math.min(
    maksymalny,
    Math.max(
      0,
      window.scrollY + element.getBoundingClientRect().top - wysokoscNaglowka() - odstep
    )
  );

  if (plynnie && !reduceMotion) window.scrollTo({ top: cel, behavior: "smooth" });
  else bezPlynnego(() => window.scrollTo(0, cel));

  return cel; /* pozwala poczekac, az strona faktycznie tam dojedzie */
};

/* Utrzymaj element w tym samym miejscu ekranu przez czas trwania animacji.
   Uzywane tam, gdzie rozwijanie jednego kafla zwija sasiedni i klikniety
   naglowek ucieklby spod kursora. */
const trzymajWMiejscu = (element, czas = 320) => {
  if (!element || reduceMotion) return;

  aktywneTrzymanie?.stop();

  const poczatek = element.getBoundingClientRect().top;
  const zdarzenia = ["wheel", "touchstart", "keydown"];
  let przerwane = false;
  let klatka = 0;

  const przerwij = () => { przerwane = true; };
  zdarzenia.forEach(z => window.addEventListener(z, przerwij, { passive: true }));

  const uchwyt = {
    stop() {
      if (aktywneTrzymanie === uchwyt) aktywneTrzymanie = null;
      cancelAnimationFrame(klatka);
      zdarzenia.forEach(z => window.removeEventListener(z, przerwij));
    }
  };
  aktywneTrzymanie = uchwyt;

  const koniec = performance.now() + czas;

  const krok = () => {
    if (przerwane || aktywneTrzymanie !== uchwyt) return uchwyt.stop();
    const roznica = element.getBoundingClientRect().top - poczatek;
    if (Math.abs(roznica) > 0.5) bezPlynnego(() => window.scrollBy(0, roznica));
    if (performance.now() < koniec) klatka = requestAnimationFrame(krok);
    else uchwyt.stop();
  };

  klatka = requestAnimationFrame(krok);
};

/* TELEFON — otwieranie kafli (etapy, FAQ, dodatkowe uslugi) bez skakania.
   Uwaga klienta 12.11 + test na iPhonie 14 w Safari: "klikam i rzuca
   gora-dol".

   Poprzednia wersja (16.11 rano) w kazdej klatce animacji korygowala
   przewiniecie (scrollBy) i na ten czas wylaczala globalne
   scroll-behavior: smooth atrybutem na <html>. Chrome stosuje taki atrybut
   od razu, ale Safari NIE przelicza stylu przed scrollBy — kazda korekta
   startowala wiec jako osobna PLYNNA animacja, kilkadziesiat na sekunde,
   ktore sie scigaly. Stad "gora-dol". W emulacji (Chrome) niewidoczne.

   Teraz nie ma zadnych korekt w petli. Przy otwieraniu na telefonie:
   1. poprzednio otwarty kafel zwijamy NATYCHMIAST (bez animacji),
   2. w tej samej chwili — zanim telefon narysuje klatke — jednym
      natychmiastowym przewinieciem oddajemy dokladnie tyle, o ile kafel
      nad kliknietym sie skrocil; klikniety kafel zostaje pod palcem,
   3. klikniety kafel rozwija sie juz z animacja — rosnie W DOL, wiec nic
      nad nim sie nie rusza,
   4. jedno natywne, plynne przewiniecie przegladarki doprowadza go pod
      naglowek. Cel jest staly (nic nad kaflem juz sie nie zmienia), wiec
      nie ma sie z czym scigac.
   Komputer bez zmian. */
const naTelefonie = () => window.matchMedia("(max-width: 820px)").matches;

/* Natychmiastowe przewiniecie, odporne na globalne scroll-behavior: smooth
   rowniez w Safari: styl inline + wymuszone przeliczenie PRZED scrollTo. */
const przewinNatychmiast = cel => {
  const korzen = document.documentElement;
  const poprzedni = korzen.style.scrollBehavior;
  korzen.style.scrollBehavior = "auto";
  void getComputedStyle(korzen).scrollBehavior;
  window.scrollTo(0, Math.max(0, cel));
  korzen.style.scrollBehavior = poprzedni;
};

/* Zmien uklad (zwin inne kafle) tak, zeby wskazany element zostal w tym
   samym miejscu ekranu. Wywolywane synchronicznie w kliknieciu — przed
   narysowaniem klatki — wiec zmiany wysokosci nad elementem nie widac. */
const zmienBezPrzesuniecia = (element, zmiana) => {
  const przed = element.getBoundingClientRect().top;
  zmiana();
  const po = element.getBoundingClientRect().top;
  if (Math.abs(po - przed) > 0.5) przewinNatychmiast(window.scrollY + (po - przed));
};

/* Plynne przewiniecie elementu pod naglowek — prowadzone przez skrypt,
   w tym samym tempie i z ta sama krzywa co rozwijanie kafla.

   Uwaga 17.11 (iPhone): "rozwija sie nierowno, idzie w dol i potem skacze
   do gory". Wczesniej rozwijanie (0,55 s) i natywne plynne przewiniecie
   przegladarki (w Safari krotsze, inna krzywa) szly kazde swoim tempem.
   Teraz to jeden ruch: przez caly czas animacji ustawiamy przewiniecie
   klatka po klatce. Globalne scroll-behavior: smooth wylaczamy RAZ na
   czas ruchu (styl inline + wymuszone przeliczenie), a nie w kazdej
   klatce — dokladnie to w poprzedniej wersji Safari ignorowal i kazda
   klatka startowala osobna plynna animacje. Cel liczony jest raz: elementy
   nad kafelkiem nie zmieniaja juz wysokosci (zwiniete od razu, patrz
   zmienBezPrzesuniecia). Dotyk, kolko myszy lub klawisz przerywa ruch. */
let biezacyRuch = null;
const przewinPodNaglowek = (element, odstep = 14, czas = 560) => {
  biezacyRuch?.();
  const od = window.scrollY;
  const cel = Math.max(0, od + element.getBoundingClientRect().top - wysokoscNaglowka() - odstep);
  if (Math.abs(cel - od) < 2) return;

  const korzen = document.documentElement;
  const poprzedni = korzen.style.scrollBehavior;
  korzen.style.scrollBehavior = "auto";
  void getComputedStyle(korzen).scrollBehavior;

  const zdarzenia = ["wheel", "touchstart", "keydown"];
  let klatka = 0;
  const koniec = () => {
    cancelAnimationFrame(klatka);
    zdarzenia.forEach(z => window.removeEventListener(z, koniec));
    korzen.style.scrollBehavior = poprzedni;
    if (biezacyRuch === koniec) biezacyRuch = null;
  };
  zdarzenia.forEach(z => window.addEventListener(z, koniec, { passive: true }));
  biezacyRuch = koniec;

  /* Ta sama krzywa co rozwijanie: cubic-bezier(.2,.75,.25,1) w przyblizeniu. */
  const krzywa = t => 1 - Math.pow(1 - t, 3);
  const start = performance.now();
  const trwanie = reduceMotion ? 1 : czas;
  const krok = teraz => {
    const t = Math.min(1, (teraz - start) / trwanie);
    /* Dol strony rosnie razem z rozwijanym kaflem — nie wychodzimy za niego. */
    const maks = korzen.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(maks, od + (cel - od) * krzywa(t)));
    if (t < 1) klatka = requestAnimationFrame(krok);
    else koniec();
  };
  klatka = requestAnimationFrame(krok);
};

const menuButton = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");
const closeMenu = () => {
  menuButton?.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
  mobileMenu?.classList.remove("is-open");
  mobileMenu?.setAttribute("aria-hidden", "true");
  header?.classList.remove("menu-open");
};
menuButton?.addEventListener("click", () => {
  const isOpen = !menuButton.classList.contains("is-open");
  menuButton.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  mobileMenu?.classList.toggle("is-open", isOpen);
  mobileMenu?.setAttribute("aria-hidden", String(!isOpen));
  header?.classList.toggle("menu-open", isOpen);
});
mobileMenu?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));

const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
const navObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach(link => link.classList.toggle("is-active", link.getAttribute("href") === "#" + visible.target.id));
    }, { rootMargin: "-30% 0px -58%", threshold: [0, .2, .5] })
  : null;
navLinks.forEach(link => {
  const section = document.querySelector(link.getAttribute("href"));
  if (section) navObserver?.observe(section);
});

/* Hero rotating gold word */
const rotatingWord = document.querySelector("[data-rotating-word]");
const rotatingWords = ["inspirują", "angażują", "zostają", "intrygują"];
let rotatingIndex = 0;
/* Bez warunku !reduceMotion (uwaga klienta 12.11: "napisy przy Wnetrza,
   ktore... sie nie zmieniaja" na telefonie). Przy wlaczonym "Ogranicz ruch"
   slowo i tak sie zmienia, tylko przenikaniem zamiast przesuniecia (CSS). */
if (rotatingWord) {
  window.setInterval(() => {
    rotatingWord.classList.add("is-changing");
    window.setTimeout(() => {
      rotatingIndex = (rotatingIndex + 1) % rotatingWords.length;
      rotatingWord.textContent = rotatingWords[rotatingIndex];
    }, 290);
    window.setTimeout(() => rotatingWord.classList.remove("is-changing"), 610);
  }, 3100);
}

/* Reveal */
const revealItems = document.querySelectorAll(".reveal");
if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach(item => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .01, rootMargin: "0px 0px 90px 0px" });
  revealItems.forEach(item => revealObserver.observe(item));
}

/* Cursor light — stable, pointer-only, never sticky */
const finePointerGlow = matchMedia("(hover: hover) and (pointer: fine)").matches;
const spotlightPanels = [...document.querySelectorAll(".spotlight")];

const clearSpotlight = panel => {
  panel.classList.remove("is-pointer-glow");
  panel.style.removeProperty("--mx");
  panel.style.removeProperty("--my");
};

const clearAllSpotlights = () => spotlightPanels.forEach(clearSpotlight);

if (finePointerGlow) {
  spotlightPanels.forEach(panel => {
    const updateGlow = event => {
      const rect = panel.getBoundingClientRect();
      panel.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      panel.style.setProperty("--my", `${event.clientY - rect.top}px`);
      panel.classList.add("is-pointer-glow");
    };

    panel.addEventListener("pointerenter", updateGlow, { passive: true });
    panel.addEventListener("pointermove", updateGlow, { passive: true });
    panel.addEventListener("pointerleave", () => clearSpotlight(panel), { passive: true });
    panel.addEventListener("pointercancel", () => clearSpotlight(panel), { passive: true });
  });

  /* Przy przewijaniu swiatlo gaslo, mimo ze kursor dalej stal na kaflu -
     wracalo dopiero po ruszeniu mysza, co dawalo efekt migotania.
     Zamiast gasic wszystko, przeliczamy pozycje wzgledem ostatnio znanego
     kursora: kafel pod kursorem zachowuje swiatlo we wlasciwym miejscu,
     pozostale je traca. Wyglad swiatla sie nie zmienia. */
  let ostatniKursor = null;
  let odswiezanieZaplanowane = false;

  window.addEventListener("pointermove", event => {
    ostatniKursor = { x: event.clientX, y: event.clientY };
  }, { passive: true });

  const przeliczSpotlighty = () => {
    odswiezanieZaplanowane = false;
    if (!ostatniKursor) return clearAllSpotlights();

    spotlightPanels.forEach(panel => {
      const rect = panel.getBoundingClientRect();
      const pod = ostatniKursor.x >= rect.left && ostatniKursor.x <= rect.right
               && ostatniKursor.y >= rect.top  && ostatniKursor.y <= rect.bottom;

      if (pod) {
        panel.style.setProperty("--mx", `${ostatniKursor.x - rect.left}px`);
        panel.style.setProperty("--my", `${ostatniKursor.y - rect.top}px`);
        panel.classList.add("is-pointer-glow");
      } else if (panel.classList.contains("is-pointer-glow")) {
        clearSpotlight(panel);
      }
    });
  };

  window.addEventListener("blur", clearAllSpotlights);
  window.addEventListener("scroll", () => {
    if (odswiezanieZaplanowane) return;
    odswiezanieZaplanowane = true;
    requestAnimationFrame(przeliczSpotlighty);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearAllSpotlights();
  });
}

/* Project modal */
const modal = document.querySelector("[data-modal]");
const modalImage = modal?.querySelector("[data-modal-image]");
const modalTitle = modal?.querySelector("[data-modal-title]");
const modalCategory = modal?.querySelector("[data-modal-category]");
const modalThumbs = modal?.querySelector("[data-modal-thumbs]");
const modalDescription = modal?.querySelector("[data-modal-description]");
let modalImages = [];
let lastFocus = null;
let modalGalleryAlts = new Map();

const selectModalImage = (source, animate = true) => {
  if (!modalImage || !modalThumbs) return;
  modalImage.src = source;
  modalImage.alt = modalGalleryAlts.get(source) || modalTitle?.textContent || "Zdjęcie realizacji";
  modalThumbs.querySelectorAll("button").forEach(button => {
    const active = button.dataset.source === source;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) {
      const stripBounds = modalThumbs.getBoundingClientRect();
      const thumbBounds = button.getBoundingClientRect();
      let offset = 0;
      if (thumbBounds.left < stripBounds.left) offset = thumbBounds.left - stripBounds.left;
      else if (thumbBounds.right > stripBounds.right) offset = thumbBounds.right - stripBounds.right;
      if (offset) modalThumbs.scrollBy({ left: offset, behavior: animate && !reduceMotion ? "smooth" : "instant" });
    }
  });
};

const stepModalImage = direction => {
  if (!modalImages.length || !modalImage) return;
  const index = modalImages.indexOf(modalImage.getAttribute("src"));
  selectModalImage(modalImages[(index + direction + modalImages.length) % modalImages.length]);
};
modal?.querySelector("[data-image-prev]")?.addEventListener("click", () => stepModalImage(-1));
modal?.querySelector("[data-image-next]")?.addEventListener("click", () => stepModalImage(1));
modalImage?.addEventListener("click", event => {
  const bounds = modalImage.getBoundingClientRect();
  stepModalImage(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
});

/* Ochrona dotyczy tylko galerii otwartej w modalu. Obrazu wyswietlanego
   publicznie nie da sie technicznie ukryc przed narzedziami deweloperskimi,
   ale blokujemy bezposrednie przeciaganie i menu "Zapisz obraz jako". */
const modalGallery = modal?.querySelector(".modal__gallery");
modalGallery?.addEventListener("dragstart", event => {
  if (event.target.closest("img")) event.preventDefault();
});
modalGallery?.addEventListener("contextmenu", event => {
  if (event.target.closest("img")) event.preventDefault();
});

const packagesToggle = document.querySelector("[data-packages-toggle]");
const packageCards = [...document.querySelectorAll(".packages__grid .package-card")];
const packagesGrid = document.querySelector(".packages__grid");
packageCards.forEach(card => {
  card.open = true;
  card.querySelector("summary")?.addEventListener("click", event => event.preventDefault());
});
packagesToggle?.addEventListener("click", () => {
  if (packagesToggle.disabled) return;
  const open = packagesToggle.getAttribute("aria-expanded") !== "true";
  packagesToggle.disabled = true;

  /* Przycisk zostaje dokladnie tam, gdzie jest.

     Wczesniej przy zwijaniu strona najpierw przewijala sie na poczatek
     pakietow, czekala 520 ms i dopiero potem zaczynala zwijac (razem
     1,3 s), a na koniec przewijala sie jeszcze raz. Stad wrazenie
     opoznienia i podwojnego skoku. Teraz nie przewijamy w ogole —
     trzymamy klikniety przycisk w tym samym miejscu ekranu, wiec
     zwijanie i rozwijanie dzieje sie od razu i pod kursorem. */
  trzymajWMiejscu(packagesToggle, 560);

  const from = packagesGrid.getBoundingClientRect().height;
  packagesGrid.style.height = "auto";
  packageCards.forEach(card => { card.open = open; });
  const to = packagesGrid.scrollHeight;
  /* Przy zamykaniu zachowaj zawartość do końca animacji; dopiero wtedy
     zamknij <details>. W przeciwnym razie tekst znika w jednej klatce. */
  if (!open) packageCards.forEach(card => { card.open = true; });
  packagesGrid.style.height = `${from}px`;
  packagesGrid.style.overflow = "hidden";

  /* Ten sam bezpiecznik co w harmonijkach: bez niego zgubione onfinish
     zostawia przycisk na stale w stanie disabled i pakietow nie da sie
     juz ani zwinac, ani rozwinac. */
  let bezpiecznikPakietow = 0;

  const finish = () => {
    window.clearTimeout(bezpiecznikPakietow);
    if (!packagesToggle.disabled) return;
    packageCards.forEach(card => { card.open = open; });
    packagesGrid.style.height = "";
    packagesGrid.style.overflow = "";
    packagesToggle.disabled = false;

    /* Po rozwinieciu gora kafli potrafi zostac schowana pod naglowkiem —
       opisy sa dlugie, wiec siatka rosnie w obie strony wzgledem widoku.
       Podciagamy strone tak, zeby poczatek pakietow byl widoczny. Robimy
       to tylko przy rozwijaniu i tylko wtedy, gdy gora faktycznie jest
       ucieta, wiec nie ma zbednego ruchu. */
    if (open && packagesGrid.getBoundingClientRect().top < wysokoscNaglowka() + 12) {
      przewinDoElementu(packagesGrid, { plynnie: true });
    }
  };

  if (!reduceMotion && packagesGrid.animate) {
    /* 780 ms bylo wyraznie za wolne jak na harmonijke — stad "srednia
       animacja". Skrocone i zrownane z reszta serwisu (FAQ ma 250/210 ms).
       Tekst pojawia sie razem z wysokoscia, bez opoznienia 140 ms, ktore
       dawalo efekt doklejania sie opisow po fakcie. */
    const czas = open ? 420 : 340;

    const animation = packagesGrid.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: czas, easing: "cubic-bezier(.2,.75,.25,1)" }
    );
    packageCards.forEach(card => card.querySelector(".package-card__body")?.animate(
      open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: Math.round(czas * 0.8), fill: "none", easing: "ease-out" }
    ));
    animation.onfinish = finish;
    bezpiecznikPakietow = window.setTimeout(finish, czas + 200);
  } else {
    finish();
  }
  packagesToggle.setAttribute("aria-expanded", String(open));
  packagesToggle.querySelector("[data-packages-toggle-label]").textContent = open ? "Zwiń opisy pakietów" : "Rozwiń opisy pakietów";
});

/* Galeria na pełnym ekranie ma całkowicie zatrzymać stronę pod spodem.
   Samo overflow:hidden nie wystarcza na iOS, dlatego zapamiętujemy pozycję
   i przywracamy ją po zamknięciu. */
let lockedScrollY = 0;

const lockPageScroll = () => {
  lockedScrollY = window.scrollY || window.pageYOffset || 0;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  document.documentElement.classList.add("is-modal-open");
  body.classList.add("is-modal-open");
  body.style.top = `-${lockedScrollY}px`;
};

const unlockPageScroll = () => {
  if (!body.classList.contains("is-modal-open")) return;
  document.documentElement.classList.remove("is-modal-open");
  body.classList.remove("is-modal-open");
  body.style.top = "";
  body.style.paddingRight = "";
  /* Bez tego globalne scroll-behavior: smooth zamienialo powrot na animacje,
     ktora lapala sie z przywracaniem pozycji body — stad losowe przeskoki
     po zamknieciu galerii. */
  bezPlynnego(() => window.scrollTo(0, lockedScrollY));
};

/* Nad paskiem miniatur kółko myszy przewija sam pasek, nie stronę. */
modalThumbs?.addEventListener("wheel", event => {
  const strip = modalThumbs;
  if (strip.scrollWidth <= strip.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  strip.scrollLeft += delta;
}, { passive: false });

const openModal = card => {
  if (!modal || !card || !modalImage || !modalTitle || !modalThumbs) return;
  lastFocus = document.activeElement;
  const gallery = (card.dataset.gallery || card.dataset.image || "")
    .split(",")
    .map(source => source.trim())
    .filter(Boolean);
  modalImages = gallery;
  const galleryAltLabels = (card.dataset.galleryAlts || "")
    .split("|")
    .map(label => label.trim());
  const projectTitle = card.dataset.title || "";
  modalGalleryAlts = new Map(gallery.map((source, index) => [
    source,
    galleryAltLabels[index] ? `${projectTitle} - ${galleryAltLabels[index]}` : `${projectTitle} - zdjęcie ${index + 1}`
  ]));

  const firstImage = card.dataset.image || gallery[0] || "";
  modalImage.style.objectPosition = card.dataset.focus || "50% 50%";
  modalTitle.textContent = projectTitle;
  if (modalDescription) {
    modalDescription.textContent = card.dataset.description || "";
    protectPolishTypography(modalDescription);
  }
  modalThumbs.replaceChildren();

  gallery.forEach((source, index) => {
    const tile = document.createElement("button");
    const image = document.createElement("img");
    tile.className = "modal__thumb";
    tile.type = "button";
    tile.dataset.source = source;
    tile.setAttribute("aria-label", `Pokaż zdjęcie ${index + 1} z realizacji ${projectTitle}`);
    tile.setAttribute("aria-pressed", "false");
    tile.addEventListener("click", () => selectModalImage(source));

    image.src = source;
    image.alt = modalGalleryAlts.get(source) || `${projectTitle} - zdjęcie ${index + 1}`;
    image.draggable = false;
    image.loading = "lazy";
    image.decoding = "async";
    tile.append(image);
    modalThumbs.append(tile);
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  selectModalImage(firstImage, false);
  lockPageScroll();
  modal.querySelector(".modal__close")?.focus({ preventScroll: true });
};
const closeModal = () => {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  unlockPageScroll();
  if (modalImage) {
    modalImage.src = "";
    modalImage.alt = "";
  }
  modalThumbs?.replaceChildren();
  modalGalleryAlts = new Map();
  modalImages = [];
  lastFocus?.focus?.({ preventScroll: true });
};
document.addEventListener("click", event => {
  const trigger = event.target.closest("[data-project-card] > button");
  if (trigger) openModal(trigger.closest("[data-project-card]"));
});
modal?.querySelector(".modal__close")?.addEventListener("click", closeModal);
modal?.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && modal?.classList.contains("is-open")) closeModal();
  if (modal?.classList.contains("is-open") && event.key === "ArrowLeft") stepModalImage(-1);
  if (modal?.classList.contains("is-open") && event.key === "ArrowRight") stepModalImage(1);
});

/* Infinite, slow project carousel */
const viewport = document.querySelector("[data-project-viewport]");
const track = document.querySelector("[data-project-track]");
const projectPrev = document.querySelector("[data-project-prev]");
const projectNext = document.querySelector("[data-project-next]");
let sliderOffset = 0;
let sliderSetWidth = 0;
let sliderAnimating = false;
let sliderDesktop = false;
let sliderFinishTimer = 0;
let sliderMotionId = 0;
/* 30 px/s z minimalnym obrotem — wybor klientow 24.11 po porownaniu
   wariantow na stronie testowej (jakubskrzypiec.github.io/karuzela-test).
   Przy wolniejszym ruchu (14 px/s) Firefox pokazywal drganie. */
const sliderSpeed = 30; // px / second

const originals = () => [...(track?.querySelectorAll("[data-project-card]:not([data-clone])") || [])];
const clearClones = () => track?.querySelectorAll("[data-clone]").forEach(clone => clone.remove());

const setTrackPosition = (value, animate = false) => {
  if (!track) return;
  track.style.transition = animate ? "transform .72s cubic-bezier(.2,.72,.2,1)" : "none";
  track.style.transform = `translate3d(${-value}px,0,0)`;
};

const readRenderedSliderOffset = () => {
  if (!track) return sliderOffset;
  const transform = getComputedStyle(track).transform;
  if (!transform || transform === "none") return sliderOffset;
  try {
    return Math.max(0, -(new DOMMatrixReadOnly(transform).m41));
  } catch (_) {
    const values = transform.match(/-?\d*\.?\d+/g)?.map(Number) || [];
    return Math.max(0, -(values.length === 6 ? values[4] : values[12] || 0));
  }
};

const measureSlider = () => {
  const cards = originals();
  if (!track || cards.length < 2) {
    sliderSetWidth = 0;
    return;
  }
  const styles = getComputedStyle(track);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;
  const first = cards[0];
  const last = cards[cards.length - 1];
  sliderSetWidth = last.offsetLeft + last.offsetWidth - first.offsetLeft + gap;
};

const normalizeSlider = () => {
  if (!sliderSetWidth) return;
  while (sliderOffset >= sliderSetWidth) sliderOffset -= sliderSetWidth;
  while (sliderOffset < 0) sliderOffset += sliderSetWidth;
};

/* Ciagly ruch karuzeli jako animacja przegladarki (Web Animations),
   a nie przesuwanie w petli requestAnimationFrame.

   Uwaga klientow 16.11 i 17.11: "karuzela drga / laguje". Petla w JS
   przesuwala tasme co klatke o ok. 0,2 px; kazda zgubiona klatka glownego
   watku (ladowanie zdjec, przewijanie) dawala szarpniecie, a proba
   zaokraglania do pelnych pikseli zamienila plynny ruch w skoki co 1 px.
   Animacja liniowa jest prowadzona przez karte graficzna (compositor):
   plynna, z ulamkami piksela, niezalezna od tego, co robi skrypt strony.
   Cala tasma (z kartami i zdjeciami) przesuwa sie jako jedna warstwa,
   wiec zdjecia nie "plywaja" wzgledem ramek. */
let sliderAnim = null;

const startAutoplay = () => {
  if (!sliderDesktop || !track || !sliderSetWidth || !track.animate) return;
  sliderAnim?.cancel();
  normalizeSlider();
  setTrackPosition(sliderOffset);

  /* Ta sama animacja we wszystkich przegladarkach (24.11), jak na stronie
     testowej: rotate(0.001deg) — propozycja klientow dla Firefoksa,
     niewidoczny (ok. 0,06 px na calej dlugosci tasmy). */
  sliderAnim = track.animate(
    [
      { transform: "translate3d(0px,0,0) rotate(0.001deg)" },
      { transform: `translate3d(${-sliderSetWidth}px,0,0) rotate(0.001deg)` }
    ],
    { duration: (sliderSetWidth / sliderSpeed) * 1000, iterations: Infinity, easing: "linear" }
  );
  sliderAnim.currentTime = (sliderOffset / sliderSpeed) * 1000;
};

/* Zatrzymaj w aktualnym, widocznym miejscu (do klikniecia strzalki). */
const stopAutoplay = () => {
  if (!sliderAnim) return;
  sliderOffset = readRenderedSliderOffset();
  sliderAnim.cancel();
  sliderAnim = null;
  normalizeSlider();
  setTrackPosition(sliderOffset);
};

const setupSlider = () => {
  if (!track || !viewport) return;
  const shouldDesktop = window.innerWidth > 820;

  sliderAnim?.cancel();
  sliderAnim = null;
  window.clearTimeout(sliderFinishTimer);
  sliderMotionId += 1;
  clearClones();
  track.style.transition = "none";
  track.style.transform = "none";
  sliderOffset = 0;
  sliderDesktop = shouldDesktop;

  if (!shouldDesktop) return;

  /* Duplicate the complete set once, giving the transform a seamless loop. */
  originals().forEach(card => {
    const clone = card.cloneNode(true);
    clone.dataset.clone = "true";
    clone.setAttribute("aria-hidden", "true");
    track.append(clone);
  });

  requestAnimationFrame(() => {
    measureSlider();
    setTrackPosition(0);
    startAutoplay();
  });
};

const nudgeSlider = direction => {
  if (!track || !viewport) return;
  const first = originals()[0];
  if (!first) return;

  if (!sliderDesktop) {
    viewport.scrollBy({ left: direction * (first.offsetWidth + 20) * 2, behavior: "smooth" });
    return;
  }

  const gap = parseFloat(getComputedStyle(track).gap) || 0;
  const distance = (first.offsetWidth + gap) * 2; // faster jump: exactly 2 cards

  /* Każde kliknięcie przejmuje aktualną, widoczną pozycję karuzeli.
     Poprzednio kilka timeoutów kończyło animacje w innej kolejności:
     stary timeout cofał nowszy ruch albo zostawiał autoplay zatrzymany. */
  stopAutoplay();
  if (sliderAnimating) {
    sliderOffset = readRenderedSliderOffset();
    track.style.transition = "none";
    setTrackPosition(sliderOffset);
    void track.offsetWidth;
  }
  window.clearTimeout(sliderFinishTimer);
  const motionId = ++sliderMotionId;

  normalizeSlider();
  setTrackPosition(sliderOffset);
  /* Zmiana z kopii zestawu na odpowiadającą jej pozycję w zestawie
     bazowym musi zostać narysowana przed rozpoczęciem kolejnego ruchu.
     Bez tego przeglądarka scalała oba zapisy transformacji i przy szybkim
     klikaniu animowała długą drogę wstecz — wyglądało to jak powrót
     karuzeli do początku. */
  void track.offsetWidth;

  if (direction < 0 && sliderOffset < distance) {
    sliderOffset += sliderSetWidth;
    setTrackPosition(sliderOffset);
    void track.offsetWidth;
  }

  sliderAnimating = true;
  sliderOffset += direction * distance;
  setTrackPosition(sliderOffset, true);

  sliderFinishTimer = window.setTimeout(() => {
    if (motionId !== sliderMotionId) return;
    normalizeSlider();
    setTrackPosition(sliderOffset);
    sliderAnimating = false;
    startAutoplay();
  }, 740);
};

/* The carousel keeps moving even while the cursor is above it.
   Hover is reserved for the card overlay, as requested. */
projectPrev?.addEventListener("click", () => nudgeSlider(-1));
projectNext?.addEventListener("click", () => nudgeSlider(1));

if (document.readyState === "complete") setupSlider();
else window.addEventListener("load", setupSlider, { once: true });

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(setupSlider, 180);
});

if ("ResizeObserver" in window && track) {
  const carouselResizeObserver = new ResizeObserver(() => {
    if (!sliderDesktop || sliderAnimating) return;
    const szla = Boolean(sliderAnim);
    stopAutoplay();
    measureSlider();
    normalizeSlider();
    setTrackPosition(sliderOffset);
    if (szla) startAutoplay();
  });
  carouselResizeObserver.observe(track);
}

/* TELEFON — karuzela projektow przesuwa sie sama (uwaga 16.11).
   Na komputerze karuzela plynie ciagle (transform + kopie kart). Na
   telefonie zostaje przewijanie palcem ze zatrzaskiwaniem na karcie,
   wiec zamiast ciaglego ruchu (gryzlby sie z zatrzaskiem) co kilka sekund
   plynnie przechodzimy do nastepnej karty, a po ostatniej wracamy do
   pierwszej. Dotkniecie karuzeli wstrzymuje ruch na chwile, zeby nie
   walczyc z palcem; nic sie nie dzieje, gdy karuzela jest poza ekranem,
   karta przegladarki w tle albo otwarta galeria. */
if (viewport && track) {
  const ODSTEP_RUCHU = 2500;
  const PAUZA_PO_DOTYKU = 6000;
  let pauzaDo = 0;

  const wstrzymaj = () => { pauzaDo = performance.now() + PAUZA_PO_DOTYKU; };
  ["touchstart", "pointerdown", "wheel"].forEach(zdarzenie =>
    viewport.addEventListener(zdarzenie, wstrzymaj, { passive: true }));

  /* Pozycja przewiniecia, przy ktorej karta stoi na srodku (tak jak
     zatrzaskuje ja scroll-snap-align: center). */
  const pozycjaKarty = karta =>
    karta.offsetLeft + karta.offsetWidth / 2 - viewport.clientWidth / 2;

  window.setInterval(() => {
    if (sliderDesktop || document.hidden || body.classList.contains("is-modal-open")) return diag(`karuzela: pomijam (desktop=${sliderDesktop} hidden=${document.hidden})`);
    if (performance.now() < pauzaDo) return diag("karuzela: pauza po dotyku");
    const ramka = viewport.getBoundingClientRect();
    if (ramka.bottom < 0 || ramka.top > window.innerHeight) return diag("karuzela: poza ekranem");

    const karty = originals();
    if (karty.length < 2) return;
    const teraz = viewport.scrollLeft;
    let biezaca = 0;
    karty.forEach((karta, i) => {
      if (Math.abs(pozycjaKarty(karta) - teraz) < Math.abs(pozycjaKarty(karty[biezaca]) - teraz)) biezaca = i;
    });
    const maks = viewport.scrollWidth - viewport.clientWidth;
    const naKoncu = teraz >= maks - 4;
    const nastepna = naKoncu || biezaca >= karty.length - 1 ? 0 : biezaca + 1;
    diag(`karuzela: ${Math.round(teraz)} -> karta ${nastepna} (${Math.round(pozycjaKarty(karty[nastepna]))}) maks=${Math.round(maks)} snap=${getComputedStyle(viewport).scrollSnapType}`);
    przesunKaruzele(Math.max(0, Math.min(maks, pozycjaKarty(karty[nastepna]))));
  }, ODSTEP_RUCHU);

  /* Wlasna animacja scrollLeft zamiast scrollTo({behavior: "smooth"}).
     Safari na iPhonie potrafi zignorowac plynne przewiniecie kontenera
     z scroll-snap-type: x mandatory (zatrzask od razu cofa go na biezaca
     karte) — karuzela stala w miejscu. Na czas przejscia wylaczamy wiec
     zatrzask i sami przesuwamy scrollLeft w kazdej klatce; po dojechaniu
     zatrzask wraca, a karta stoi juz dokladnie w punkcie zatrzasku.
     Dotkniecie w trakcie przerywa ruch i oddaje karuzele palcowi. */
  let ruchKaruzeli = 0;
  function przesunKaruzele(cel) {
    cancelAnimationFrame(ruchKaruzeli);
    const od = viewport.scrollLeft;
    const droga = cel - od;
    if (Math.abs(droga) < 2) return;
    /* Ok. 0,45 s na jedna karte; dluzszy powrot z ostatniej na pierwsza
       maks. 0,9 s, zeby nie "przelecial" w mgnieniu oka. */
    const czas = Math.min(900, 380 + Math.abs(droga) * 0.2);
    const start = performance.now();
    const krzywa = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const startPauzy = pauzaDo;

    viewport.style.scrollSnapType = "none";
    const koniec = () => {
      cancelAnimationFrame(ruchKaruzeli);
      viewport.style.scrollSnapType = "";
    };

    const klatka = teraz => {
      if (pauzaDo !== startPauzy) return koniec(); /* palec przejal karuzele */
      const t = Math.min(1, (teraz - start) / czas);
      viewport.scrollLeft = od + droga * krzywa(t);
      if (t < 1) ruchKaruzeli = requestAnimationFrame(klatka);
      else { koniec(); diag(`karuzela: koniec ruchu, scrollLeft=${Math.round(viewport.scrollLeft)} (cel ${Math.round(cel)})`); }
    };
    ruchKaruzeli = requestAnimationFrame(klatka);
  }
}

/* Stable DETAILS animation — FAQ + packages */
const detailsAnimations = new WeakMap();
const detailsTargetOpen = new WeakMap();

const animateDetails = (item, willOpen) => {
  const summary = item.querySelector(":scope > summary");
  if (!summary) return;

  /* Harmonijki animuja sie takze przy "Ogranicz ruch" — to tylko zmiana
     wysokosci, bez przesuwania. Skok bez animacji byl odbierany jako
     "skakanie strony" (uwaga klienta 12.11). */
  if (!item.animate) {
    item.open = willOpen;
    detailsTargetOpen.set(item, willOpen);
    return;
  }

  const running = detailsAnimations.get(item);
  const currentHeight = item.getBoundingClientRect().height;

  if (running) {
    running.onfinish = null;
    running.oncancel = null;
    running.cancel();
  }

  if (willOpen && !item.open) item.open = true;

  item.style.height = "auto";
  item.style.overflow = "hidden";

  /* When closing, the resting height is not always the summary height: inside a
     stretched grid row the tile keeps the height of its neighbours. Measure that
     real closed height so the panel stops there instead of collapsing all the way
     down and springing back up. */
  let targetHeight;
  if (willOpen) {
    targetHeight = item.scrollHeight;
  } else {
    const wasOpen = item.open;
    item.open = false;
    targetHeight = Math.max(
      summary.getBoundingClientRect().height,
      item.getBoundingClientRect().height
    );
    item.open = wasOpen;
  }

  item.style.height = `${currentHeight}px`;
  item.getBoundingClientRect(); // force current frame

  detailsTargetOpen.set(item, willOpen);
  item.dataset.animating = "true";

  const animation = item.animate(
    [
      { height: `${currentHeight}px` },
      { height: `${targetHeight}px` }
    ],
    {
      duration: willOpen ? 250 : 210,
      easing: "cubic-bezier(.2,.75,.25,1)"
    }
  );

  detailsAnimations.set(item, animation);

  /* Bezpiecznik.

     Caly stan harmonijki wisial na zdarzeniu onfinish: to ono zdejmuje
     data-animating i domyka <details>. Jesli zdarzenie przepadnie —
     a przepada, gdy przegladarka przestanie rysowac klatki, np. przy
     przelaczeniu karty w trakcie animacji — atrybut zostaje na zawsze,
     getNextDetailsState zwraca ciagle te sama wartosc i kafel przestaje
     reagowac na klikniecia. Odtworzone w praktyce. Jesli animacja nie
     zamknie sie w swoim czasie, domykamy stan recznie. */
  let bezpiecznik = 0;

  const finish = () => {
    window.clearTimeout(bezpiecznik);
    if (detailsAnimations.get(item) !== animation) return;
    if (!detailsTargetOpen.get(item)) item.open = false;
    item.style.height = "";
    item.style.overflow = "";
    delete item.dataset.animating;
    detailsAnimations.delete(item);
  };

  bezpiecznik = window.setTimeout(finish, (willOpen ? 250 : 210) + 150);

  animation.onfinish = finish;
  animation.oncancel = () => {
    window.clearTimeout(bezpiecznik);
    if (detailsAnimations.get(item) !== animation) return;
    item.style.height = "";
    item.style.overflow = "";
    delete item.dataset.animating;
    detailsAnimations.delete(item);
  };
};

/* Zwiniecie harmonijki natychmiast, bez animacji — z przerwaniem animacji,
   ktora moglaby jeszcze trwac po szybkim klikaniu. */
const zamknijDetailsOdRazu = item => {
  const running = detailsAnimations.get(item);
  if (running) {
    running.onfinish = null;
    running.oncancel = null;
    running.cancel();
    detailsAnimations.delete(item);
  }
  item.open = false;
  item.style.height = "";
  item.style.overflow = "";
  delete item.dataset.animating;
  detailsTargetOpen.set(item, false);
};

const getNextDetailsState = item => {
  if (detailsTargetOpen.has(item) && item.dataset.animating === "true") {
    return !detailsTargetOpen.get(item);
  }
  return !item.open;
};

/* FAQ — one question at a time */
const faqItems = [...document.querySelectorAll(".faq__list details")];

faqItems.forEach(item => {
  const summary = item.querySelector(":scope > summary");
  if (!summary) return;

  summary.addEventListener("click", event => {
    event.preventDefault();
    /* Celowo BEZ trzymajWMiejscu — usuniete 25.09, znalezione przez
       dokladny pomiar na zywej stronie po zgloszeniu klienta.

       trzymajWMiejscu SAM W SOBIE dziala poprawnie: mierzy pozycje
       klikni etego elementu i koryguje scroll, zeby zostal w miejscu.
       Problem jest w tym UKLADZIE — tutaj i w sekcji procesu WIDOCZNYCH
       jest NA RAZ WIELE pytan/kafli (nie jeden przycisk sterujacy wszystkim
       jak w pakietach). Kompensacja "podaza" za KLIKNIETYM elementem, ale
       scroll to zmiana GLOBALNA — przesuwa WSZYSTKO na ekranie, WLACZNIE
       Z INNYMI, NIEKLIKNIETYMI pytaniami/kaflami, ktore same w sobie NIE
       zmienily pozycji w dokumencie. Przy klikaniu PO KOLEI (np. z gory
       na dol) kazde kolejne domkniecie sasiada NAD kliknietym elementem
       przesuwa kompensacje w TA SAMA strone, wiec sie KUMULUJE.

       Zmierzone na zywej stronie (sekcja procesu, sekwencja klikniec
       0,1,2,3,4,5 z gory na dol): scroll dryfowal do -1450 px, a klikniety
       na koncu kafel byl calkowicie poza ekranem — dokladnie "scrolluje
       strone do gory a nie pokazuje tego kafla" z uwagi klienta.

       Bez kompensacji, klikniety element MOZE przesunac sie na ekranie
       o wysokosc sasiada, ktory sie domyka (zwykle 100-350 px) — to jest
       normalne, przewidywalne zachowanie kazdego akordeonu (Bootstrap,
       Material UI, itd. dzialaja dokladnie tak). To duzo mniejszy
       i bardziej przewidywalny ruch niz kilkuset-pikselowy dryf calej
       strony. */
    const willOpen = getNextDetailsState(item);
    const otwarteInne = faqItems.filter(other =>
      other !== item && (other.open || detailsTargetOpen.get(other) === true));

    /* Telefon: inne pytania zwijamy od razu, bez przesuniecia kliknietego
       (opis przy naTelefonie u gory pliku), potem jedno plynne przewiniecie. */
    if (willOpen && naTelefonie()) {
      zmienBezPrzesuniecia(item, () => otwarteInne.forEach(zamknijDetailsOdRazu));
      animateDetails(item, true);
      przewinPodNaglowek(item, 14, 380);
      return;
    }

    if (willOpen) otwarteInne.forEach(other => animateDetails(other, false));
    animateDetails(item, willOpen);
  });
});

/* Karty pakietów mają jeden wspólny przycisk. Dodatkowe usługi otwierają się osobno. */
document.querySelectorAll(".package-card").forEach(item => {
  item.querySelector(":scope > summary")?.addEventListener("click", event => {
    event.preventDefault();
    packagesToggle?.click();
  });
});
document.querySelectorAll(".extra-service").forEach(item => {
  const summary = item.querySelector(":scope > summary");
  if (!summary) return;

  summary.addEventListener("click", event => {
    event.preventDefault();
    const willOpen = getNextDetailsState(item);
    /* Przy zamykaniu zdejmij wyrownanie wysokosci (patrz DODATKOWE USLUGI) —
       inaczej animacja zmierzylaby wysokosc docelowa z wyrownaniem i kafel
       by sie nie zwinal. Po animacji wyrownanie liczy sie od nowa. */
    if (!willOpen) document.querySelectorAll(".offer-extra__list .extra-service").forEach(u => { u.style.minHeight = ""; });
    animateDetails(item, willOpen);
    /* Uslugi otwieraja sie niezaleznie (nic nad kliknieta sie nie zwija),
       wiec wystarczy jedno plynne przewiniecie pod naglowek. */
    if (willOpen && naTelefonie()) przewinPodNaglowek(item, 14, 380);
  });
});

/* DODATKOWE USLUGI — otwarte kafle w tym samym rzedzie maja rowna wysokosc
   (uwaga 17.11: "wyrownaj te kafelki"). Przez CSS (align-self: stretch)
   sie nie da: rozwijany <details> z overflow: hidden zle podaje siatce
   swoja wysokosc i tekst byl obcinany (rzad 128 px przy tresci 209 px).
   Po kazdym otwarciu/zamknieciu (gdy zadna animacja juz nie trwa) mierzymy
   naturalna wysokosc otwartych kafli w rzedzie i ustawiamy obu wyzsza.
   Zamkniete kafle zostaja niskie. Na telefonie (jedna kolumna) nic. */
const uslugi = [...document.querySelectorAll(".offer-extra__list .extra-service")];
if (uslugi.length) {
  const wyrownajUslugi = () => {
    if (uslugi.some(u => u.dataset.animating)) return;
    uslugi.forEach(u => { u.style.minHeight = ""; });
    const rzedy = new Map();
    uslugi.forEach(u => {
      const gora = Math.round(u.getBoundingClientRect().top + window.scrollY);
      if (!rzedy.has(gora)) rzedy.set(gora, []);
      rzedy.get(gora).push(u);
    });
    rzedy.forEach(rzad => {
      const otwarte = rzad.filter(u => u.open);
      if (rzad.length < 2 || otwarte.length < 2) return;
      const najwyzszy = Math.max(...otwarte.map(u => u.getBoundingClientRect().height));
      otwarte.forEach(u => { u.style.minHeight = `${najwyzszy}px`; });
    });
  };
  let czasUslug = 0;
  const zaplanujUslugi = () => {
    window.clearTimeout(czasUslug);
    czasUslug = window.setTimeout(wyrownajUslugi, 60);
  };
  new MutationObserver(zaplanujUslugi).observe(document.querySelector(".offer-extra__list"), {
    attributes: true, subtree: true, attributeFilter: ["open", "data-animating"]
  });
  window.addEventListener("resize", zaplanujUslugi);
}

/* Polish typography: no hanging one-letter words and no single-word orphans.
   We leave headings with intentional <br> breaks alone and protect editorial copy only. */
const typographySelectors = [
  ".rich-copy p",
  ".section-quote",
  ".package-card summary p",
  ".package-card__body p",
  ".package-card__body li",
  ".modal__description",
  ".process-item small",
  ".process-answer p",
  ".process-answer b",
  ".faq__list summary",
  ".faq__list details > div p",
  ".faq__cta p",
  ".contact__lead",
  ".contact__people em",
  ".footer p",
  ".footer__person em",
  /* Oferta — uwaga klienta nr 11 (22.09): "wiszace literki".
     Akapity pod tabela i opisy pakietow nie byly tu objete, wiec
     jednoliterowe spojniki zostawaly na koncu linii. */
  ".offer-matrix__note",
  ".offer-matrix__help p",
  ".offer-matrix__panel-inner p",
  ".offer-matrix__pdf-note",
  ".offer-consult__intro p",
  ".offer-consult__journey-row p",
  /* Dodatkowe uslugi — nowe teksty od klientow (17.11). */
  ".extra-service__body-inner p"
];

const protectPolishTypography = node => {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(textNode => {
    /* Tylko samodzielne jednoliterowe slowa ("a", "i", "w", "z"...).
       Wczesniej bylo \b([aiouwz])\s+ \u2014 w JS \b nie zna polskich liter, wiec
       koncowka "a" po "\u0142" ("przysz\u0142a", "odzwierciedla\u0142a") tez byla brana
       za spojnik i sklejana z nastepnym slowem. Powstawaly dlugie,
       nierozerwalne bloki, a linia przed nimi rozciagala sie przy
       justowaniu ("jak      najlepiej" w Konsultacji, uwaga 16.11). */
    textNode.nodeValue = textNode.nodeValue.replace(/(^|[\s\u00A0(\u201E"\u00AB])([aiouwz])\s+/gi, "$1$2\u00A0");
  });

  /* Join the final two words of the block. This prevents the last line from
     ending up with one lonely word after responsive reflow. */
  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    const textNode = textNodes[index];
    if (!textNode.nodeValue || !textNode.nodeValue.trim()) continue;
    textNode.nodeValue = textNode.nodeValue.replace(/(\S+)\s+(\S+)(\s*)$/, "$1\u00A0$2$3");
    break;
  }
};

document.querySelectorAll(typographySelectors.join(",")).forEach(protectPolishTypography);

/* Dzielenie wyrazów pozostaje wyłącznie w sekcji O nas. */
window.dzielenieWyrazowPL?.(".about__copy .rich-copy p");
/* Opisy pakietow na stronie glownej tez sa justowane — bez dzielenia waska
   kolumna rozpychala odstepy (uwaga 16.11: "jak      najlepiej"). */
window.dzielenieWyrazowPL?.(".packages .package-card__body > p");

/* O NAS i PAKIETY — najwyzej 2 przeniesienia wyrazow na akapit (uwaga Oliwii
   16.11: "tekst jest zbyt pociety pauzami, dwie na akapit moga sie pojawic"),
   bez dzielenia ostatniego slowa akapitu (na koncu zostawal samotny
   kawalek wyrazu) — i przy tym jak najmniejsze dziury miedzy slowami.

   Przegladarka sama wybiera, gdzie przelamac wiersz, i nie zna limitu.
   Pierwsza wersja zostawiala po prostu 2 PIERWSZE przeniesienia w akapicie;
   pomiar na podgladzie pokazal dziury do 128 px (normalna spacja 4,7 px),
   bo przeniesienia "zuzywaly sie" tam, gdzie nie byly potrzebne.

   Teraz odwrotnie: zaczynamy od tekstu BEZ dzielenia i w kazdej rundzie
   sprawdzamy kazde slowo, ktore da sie podzielic — zostaje to, ktore
   najbardziej zmniejsza najwieksza dziure w akapicie. Najwyzej 2
   przeniesienia na akapit (opisy pakietow: 4, patrz limitPrzeniesien). Przy zmianie szerokosci liczymy od
   nowa, bo inna szerokosc = inne lamanie. */
const MIEKKI_LACZNIK = "­";
const MAKS_PRZENIESIEN = 2;
const akapityDoDzielenia = [...document.querySelectorAll(".about__copy .rich-copy p, .packages .package-card__body > p")];
const oryginalyAkapitow = new WeakMap();

const tekstoweWezly = element => {
  const chodzik = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const wezly = [];
  while (chodzik.nextNode()) wezly.push(chodzik.currentNode);
  return wezly;
};

/* Tekst z pelnym dzieleniem; jesli akapit przy wczytaniu nie byl justowany
   (np. strona otwarta w waskim oknie), dzielimy go teraz. */
const przygotujAkapit = akapit => {
  const wezly = tekstoweWezly(akapit);
  const zapis = oryginalyAkapitow.get(akapit);
  if (zapis) wezly.forEach((w, i) => { if (zapis[i] != null) w.nodeValue = zapis[i]; });
  const justowany = getComputedStyle(akapit).textAlign === "justify";
  if (justowany && !akapit.textContent.includes(MIEKKI_LACZNIK) && window.dzielenieWyrazowPL) {
    akapit.dataset.dzielTeraz = "";
    window.dzielenieWyrazowPL("[data-dziel-teraz]");
    delete akapit.dataset.dzielTeraz;
  }
  oryginalyAkapitow.set(akapit, tekstoweWezly(akapit).map(w => w.nodeValue));
  return justowany;
};

/* Lista slow: wezel, pozycja i tekst z lacznikami (z oryginalu). */
const slowaAkapitu = akapit => {
  const zapis = oryginalyAkapitow.get(akapit);
  const slowa = [];
  tekstoweWezly(akapit).forEach((wezel, w) => {
    const re = /[^\s ]+/g;
    let m;
    while ((m = re.exec(zapis[w]))) slowa.push({ w, od: m.index, tekst: m[0], dzieli: m[0].includes(MIEKKI_LACZNIK) });
  });
  return slowa;
};

/* Zapisz tekst, w ktorym laczniki maja tylko slowa z zestawu "wolno". */
const ulozAkapit = (akapit, slowa, wolno) => {
  const zapis = oryginalyAkapitow.get(akapit);
  const wezly = tekstoweWezly(akapit);
  wezly.forEach((wezel, w) => {
    let tekst = "";
    let poz = 0;
    slowa.forEach((s, i) => {
      if (s.w !== w) return;
      tekst += zapis[w].slice(poz, s.od);
      tekst += wolno.has(i) ? s.tekst : s.tekst.split(MIEKKI_LACZNIK).join("");
      poz = s.od + s.tekst.length;
    });
    tekst += zapis[w].slice(poz);
    if (wezel.nodeValue !== tekst) wezel.nodeValue = tekst;
  });
};

/* Pomiar: dla kazdego slowa pierwszy i ostatni prostokat oraz linie. */
const zmierzAkapit = akapit => {
  const wezly = tekstoweWezly(akapit);
  const prawaKrawedz = akapit.getBoundingClientRect().right;
  /* Slowa mierzymy w aktualnym tekscie, kolejno — ta sama kolejnosc
     i liczba slow co w slowaAkapitu (laczniki nie zmieniaja podzialu). */
  const wynik = [];
  wezly.forEach(wezel => {
    const re = /[^\s ]+/g;
    let m;
    while ((m = re.exec(wezel.nodeValue))) {
      const zakres = document.createRange();
      zakres.setStart(wezel, m.index);
      zakres.setEnd(wezel, m.index + m[0].length);
      const r = [...zakres.getClientRects()].filter(x => x.width > 0);
      if (!r.length) { wynik.push(null); continue; }
      wynik.push({ pierwszy: r[0], ostatni: r[r.length - 1], przelamane: new Set(r.map(x => Math.round(x.top))).size > 1 });
    }
  });
  /* Linie: kazda konczy sie tam, gdzie zaczyna sie nastepna. Ostatnia linia
     akapitu nie trafia na liste — nie jest justowana, wiec jej odstepy
     sa zawsze normalne. */
  const opisLinii = [];
  let start = 0;
  for (let i = 1; i < wynik.length; i += 1) {
    const a = wynik[i - 1];
    const b = wynik[i];
    if (a && b && Math.round(a.ostatni.top) !== Math.round(b.pierwszy.top)) {
      opisLinii.push({ od: start, nastepne: i });
      start = i;
    }
  }
  const linieZOdstepami = opisLinii.map(linia => {
    const odstepy = [];
    for (let i = linia.od + 1; i < linia.nastepne; i += 1) {
      const a = wynik[i - 1];
      const b = wynik[i];
      if (a && b && Math.round(a.ostatni.top) === Math.round(b.pierwszy.top)) odstepy.push(b.pierwszy.left - a.ostatni.right);
    }
    let srednio = odstepy.length ? odstepy.reduce((x, y) => x + y, 0) / odstepy.length : 0;
    /* Linia z jednym slowem nie ma odstepow, ale tez nie da sie jej
       wyjustowac — zostaje puste miejsce do prawej krawedzi (zmierzone:
       samo "odzwierciedlala" i 153 px pustego w Konsultacji projektowej).
       Liczymy ja jako dziure rowna temu wolnemu miejscu. */
    if (!odstepy.length) {
      const gora = Math.round(wynik[linia.od]?.pierwszy.top ?? 0);
      let prawa = 0;
      for (let i = linia.od; i < linia.nastepne; i += 1) {
        const s = wynik[i];
        if (!s) continue;
        [s.pierwszy, s.ostatni].forEach(r => { if (Math.round(r.top) === gora) prawa = Math.max(prawa, r.right); });
      }
      if (prawa) srednio = Math.max(0, prawaKrawedz - prawa);
    }
    return { nastepneSlowo: linia.nastepne, srednio };
  });
  return {
    linie: linieZOdstepami,
    przelamane: wynik.filter(x => x && x.przelamane).length,
    najgorsza: Math.max(0, ...linieZOdstepami.map(l => l.srednio))
  };
};

/* Limit przeniesien: O nas — 2 (prosba Oliwii), opisy pakietow — 4
   (tam klienci zglaszali dziure, nie liczbe przeniesien, a kolumny sa wezsze). */
const limitPrzeniesien = akapit => (akapit.closest(".packages") ? 4 : MAKS_PRZENIESIEN);

const ograniczDzielenie = akapit => {
  if (!przygotujAkapit(akapit)) return;
  const slowa = slowaAkapitu(akapit);
  /* Ostatnie slowo nigdy sie nie dzieli (samotny kawalek wyrazu na koncu).
     Przedostatnie moze: ostatnia linia ma wtedy i tak 2 czesci, a bez tego
     sklejona para konczaca akapit potrafila zostawic jedno slowo samo
     w linii ("odzwierciedlala" + 153 px pustego w Konsultacji). */
  const zakazane = new Set([slowa.length - 1]);
  const kandydaci = slowa.map((s, i) => i).filter(i => slowa[i].dzieli && !zakazane.has(i));
  const wolno = new Set();
  ulozAkapit(akapit, slowa, wolno);
  const stan = zmierzAkapit(akapit);
  const limit = limitPrzeniesien(akapit);

  /* Kazda runda: sprawdz KAZDE slowo, ktore da sie podzielic, i wybierz to,
     ktore najbardziej zmniejsza najwieksza dziure w akapicie (sprawdzane
     tez pary — wynik praktycznie ten sam przy wielokrotnie dluzszym czasie,
     wiec zostaje szybsza wersja). */
  let biezacy = stan;
  for (let runda = 0; runda < limit; runda += 1) {
    let najlepszy = null;
    kandydaci.forEach(i => {
      if (wolno.has(i)) return;
      wolno.add(i);
      ulozAkapit(akapit, slowa, wolno);
      const proba = zmierzAkapit(akapit);
      wolno.delete(i);
      if (proba.przelamane > limit) return;
      if (proba.najgorsza >= biezacy.najgorsza - 0.5) return;
      if (!najlepszy || proba.najgorsza < najlepszy.stan.najgorsza) najlepszy = { i, stan: proba };
    });
    if (!najlepszy) break;
    wolno.add(najlepszy.i);
    biezacy = najlepszy.stan;
  }
  ulozAkapit(akapit, slowa, wolno);
};

/* Akapit po akapicie, z przerwa miedzy nimi — kazdy to kilkadziesiat
   pomiarow ukladu, a razem ok. 0,4 s; w jednym kawalku strona by sie
   na ten czas przycinala. */
let przebiegAkapitow = 0;
const ograniczWszystkie = () => {
  const przebieg = ++przebiegAkapitow;
  const kolejka = akapityDoDzielenia.slice();
  const nastepny = () => {
    if (przebieg !== przebiegAkapitow) return; /* nowszy przebieg (zmiana szerokosci) */
    const akapit = kolejka.shift();
    if (!akapit) {
      window.dispatchEvent(new Event("akapity-ulozone"));
      return;
    }
    ograniczDzielenie(akapit);
    window.setTimeout(nastepny, 0);
  };
  nastepny();
};
if (akapityDoDzielenia.length) {
  (document.fonts?.ready || Promise.resolve()).then(ograniczWszystkie);
  let szerokoscAkapitow = window.innerWidth;
  let czasAkapitow = 0;
  window.addEventListener("resize", () => {
    if (window.innerWidth === szerokoscAkapitow) return;
    szerokoscAkapitow = window.innerWidth;
    window.clearTimeout(czasAkapitow);
    czasAkapitow = window.setTimeout(ograniczWszystkie, 200);
  });
}

/* Process accordion + progress */
const processItems = [...document.querySelectorAll("[data-process-item]")];
const processGhost = document.querySelector("[data-process-ghost]");
const processRange = document.querySelector(".process__range");

const setProcessProgress = step => {
  if (!processRange || !processItems.length) return;
  const safeStep = Math.max(0, Math.min(processItems.length, step));
  processRange.style.setProperty("--process-progress", `${(safeStep / processItems.length) * 100}%`);
};

setProcessProgress(0);

let processScrollRevision = 0;
if (processItems.length) {
  ["wheel", "touchstart", "keydown"].forEach(eventName => {
    window.addEventListener(eventName, () => { processScrollRevision += 1; }, { passive: true });
  });
}

processItems.forEach((item, index) => {
  const button = item.querySelector("[data-process-toggle]");
  button?.addEventListener("click", () => {
    const scrollRevision = ++processScrollRevision;
    const willOpen = !item.classList.contains("is-open");
    const ustawStan = (other, open) => {
      other.classList.toggle("is-open", open);
      other.querySelector("[data-process-toggle]")?.setAttribute("aria-expanded", String(open));
    };

    if (willOpen) {
      /* Inne etapy zwijamy od razu (bez animacji, klasa .bez-animacji
         wylacza transition w CSS), a klikniety zostaje w miejscu — nic nad
         nim sie juz nie rusza. Potem rozwija sie z animacja, a strona w tym
         samym tempie dojezdza tak, zeby etap stal pod naglowkiem i dalo sie
         go od razu czytac (uwagi 17.11: komputer "gwaltownie przewija",
         telefon "idzie w dol i skacze do gory" — wczesniej dwa osobne ruchy). */
      const lista = item.parentElement;
      zmienBezPrzesuniecia(button, () => {
        lista.classList.add("bez-animacji");
        processItems.forEach(other => { if (other !== item) ustawStan(other, false); });
        void lista.offsetHeight;
      });
      lista.classList.remove("bez-animacji");
      ustawStan(item, true);
      /* Jeden ruch razem z rozwijaniem (.55 s w CSS) — telefon i komputer:
         klikniety etap staje pod naglowkiem, gotowy do czytania. */
      przewinPodNaglowek(button, 14, 560);
    } else {
      ustawStan(item, false);
    }
    void scrollRevision;

    setProcessProgress(index + 1);

    if (processGhost) {
      processGhost.style.opacity = "0";
      processGhost.style.transform = "translateY(14px)";
      window.setTimeout(() => {
        processGhost.textContent = String(index + 1).padStart(2, "0");
        processGhost.style.opacity = "";
        processGhost.style.transform = "";
      }, 180);
    }
  });
});


/* Map pin: keep the Gliwice marker for the initial view, then remove it as soon
   as the user starts interacting with the embedded map. This prevents the
   marker from pretending to point at Gliwice after the map has been panned. */
const embeddedMap = document.querySelector('.map');
const embeddedMapFrame = embeddedMap?.querySelector('iframe');

if (embeddedMap && embeddedMapFrame) {
  let pointerOverMap = false;
  let mapInteractionWatcher = 0;

  const hideMapPin = () => {
    embeddedMap.classList.add('is-interacted');
    if (mapInteractionWatcher) {
      window.clearInterval(mapInteractionWatcher);
      mapInteractionWatcher = 0;
    }
  };

  embeddedMap.addEventListener('mouseenter', () => {
    pointerOverMap = true;
    if (!mapInteractionWatcher) {
      mapInteractionWatcher = window.setInterval(() => {
        if (document.activeElement === embeddedMapFrame) hideMapPin();
      }, 120);
    }
  });

  embeddedMap.addEventListener('mouseleave', () => {
    pointerOverMap = false;
    if (mapInteractionWatcher) {
      window.clearInterval(mapInteractionWatcher);
      mapInteractionWatcher = 0;
    }
  });

  window.addEventListener('blur', () => {
    if (pointerOverMap) hideMapPin();
  });

  /* On touch devices the iframe becomes the interaction target after a tap. */
  embeddedMap.addEventListener('touchstart', hideMapPin, { passive: true });
}

/* Success message */
document.querySelectorAll('.contact-form input[type="datetime-local"]').forEach(input => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  if (!input.value) input.value = localDate.toISOString().slice(0, 16);
  input.addEventListener("click", () => {
    if (typeof input.showPicker === "function") {
      try { input.showPicker(); } catch { /* Przeglądarka zachowuje natywną obsługę pola. */ }
    }
  });
});

document.querySelectorAll(".contact-form input[name='_next']").forEach(input => {
  const section = document.querySelector("#formularz") ? "formularz" : "kontakt";
  input.value = `${location.origin}${location.pathname}?wyslano=1#${section}`;
});
const params = new URLSearchParams(location.search);
/* Stan "wyslano" — jeden dla obu drog: wysylki w tle i powrotu z ?wyslano=1. */
const pokazPodziekowanie = () => {
  document.querySelectorAll(".contact__form-head").forEach(head => {
    head.classList.add("is-sent");
    head.querySelector("h3").textContent = "Dziękujemy za kontakt";
    head.querySelector(".section-label").textContent = "Zapraszamy do obejrzenia naszych projektów, a my przygotujemy odpowiedź.";
  });
  document.querySelector(".contact-form")?.setAttribute("hidden", "");
  const success = document.querySelector("[data-success]");
  if (success) {
    success.removeAttribute("hidden");
    success.classList.add("is-visible");
    success.closest(".contact__page--right")?.append(success);
  }
};

if (params.get("wyslano") === "1") pokazPodziekowanie();

/* Zgoda w formularzu — po zaznaczeniu dotykiem zdejmujemy fokus z ukrytego
   pola. Na iPhonie fokus na polu formularza potrafi na chwile pokazac
   systemowy, niebieski element pod formularzem (uwaga 16.11). Zaznaczenie
   z klawiatury zostawia fokus, zeby dalej dalo sie przejsc Tabem. */
document.querySelectorAll(".consent").forEach(etykieta => {
  const pole = etykieta.querySelector("input");
  if (!pole) return;
  let dotyk = false;
  etykieta.addEventListener("pointerdown", () => { dotyk = true; }, { passive: true });
  etykieta.addEventListener("touchstart", () => { dotyk = true; }, { passive: true });
  ["touchstart", "pointerdown", "click"].forEach(z => etykieta.addEventListener(z, () => diag(`zgoda: ${z} scrollY=${Math.round(scrollY)}`), { passive: true }));
  ["focus", "blur"].forEach(z => pole.addEventListener(z, () => diag(`zgoda: pole ${z} vv=${Math.round(window.visualViewport?.height || 0)}`)));
  pole.addEventListener("change", () => {
    if (dotyk) pole.blur();
    dotyk = false;
  });
});

/* Wysylka bez opuszczania strony.

   Zwykly POST szedl na formsubmit.co, ktory po przetworzeniu przerzucal
   uzytkownika z powrotem na kontakt.html?wyslano=1 — czyli wyjscie ze
   strony, mrugniecie i przeladowanie. FormSubmit ma koncowke /ajax/,
   ktora zwraca JSON zamiast przekierowania, wiec podziekowanie pokazujemy
   w miejscu formularza.

   Zwykla wysylka zostaje jako zapas: jesli skrypt sie nie wykona albo
   fetch padnie, formularz dziala po staremu. */
document.querySelectorAll(".contact-form").forEach(formularz => {
  const przycisk = formularz.querySelector("[type='submit']");

  const pokazBlad = tresc => {
    let blad = formularz.querySelector("[data-blad-wysylki]");
    if (!blad) {
      blad = document.createElement("p");
      blad.className = "form-error";
      blad.setAttribute("data-blad-wysylki", "");
      blad.setAttribute("role", "alert");
      formularz.append(blad);
    }
    blad.textContent = tresc;
  };

  formularz.addEventListener("submit", async event => {
    if (!window.fetch || !formularz.reportValidity()) return;
    event.preventDefault();

    const adres = formularz.getAttribute("action")
      .replace("formsubmit.co/", "formsubmit.co/ajax/");
    const dane = new FormData(formularz);
    dane.delete("_next"); /* przy wysylce w tle nie ma dokad wracac */

    formularz.querySelector("[data-blad-wysylki]")?.remove();
    if (przycisk) przycisk.disabled = true;

    try {
      const odpowiedz = await fetch(adres, {
        method: "POST",
        body: dane,
        headers: { Accept: "application/json" }
      });
      if (!odpowiedz.ok) throw new Error(odpowiedz.status);
      pokazPodziekowanie();
    } catch (_) {
      if (przycisk) przycisk.disabled = false;
      pokazBlad("Nie udało się wysłać wiadomości. Spróbuj ponownie lub napisz na tooniprojektuja@gmail.com.");
    }
  });
});

document.querySelector("[data-pdf-preview]")?.addEventListener("click", event => {
  const button = event.currentTarget;
  const note = document.querySelector("[data-pdf-note]");
  if (!note) return;
  note.hidden = !note.hidden;
  button.setAttribute("aria-expanded", String(!note.hidden));
});



/* =============================================================
   OFERTA — rozwijanie opisu pakietu (trzecia wersja)

   Zalozenia:
   - animacja ma byc subtelna,
   - nic sie nie ma "urywac" ani skakac,
   - jesli ktos przewinal sie nizej (np. po tabeli), klikniecie
     "Rozwin opis" ma go cofnac do gory, do opisu.

   Dlaczego jeszcze raz inaczej:
   Druga wersja probowala animowac wysokosc czystym CSS-em przez trick
   grid-template-rows: 0fr -> 1fr. Sam pomysl byl dobry (przegladarka
   animuje to na wlasnym watku, niezaleznie od JS), ale trafilismy na
   pulapke specyfikacji Grid: z minmax(0, Nfr) w kontenerze o
   niezdefiniowanej wysokosci "fr" nie rozwija sie do tresci, tylko
   zostaje na minimum. Bez minmax odwrotnie — panel byl zawsze wysoki na
   jedna linie tekstu, nawet zamkniety. Zmierzone empirycznie oba warianty,
   zaden nie dawal poprawnego wyniku dla obu stanow naraz.

   Teraz: JS mierzy realna wysokosc tresci (inner.scrollHeight) i ustawia
   ja jako docelowa wartosc "height" w pikselach — sama animacja to zwykly
   CSS transition (w oferta.css), a nie petla klatek w JS. To jest dokladnie
   ten sam mechanizm co harmonijki FAQ i uslug dodatkowych w tym serwisie,
   tylko bez <details> (tutaj to zwykle diwy sterowane klasa .is-open).

   Przewijanie strony jest calkowicie osobne: natywne
   window.scrollTo({behavior:"smooth"}), ktore samo jest sterowane przez
   przegladarke, a nie przez nasz JS w petli — dzieki temu nie zalezy od
   tego, czy JS akurat dostaje czas procesora, i nie da sie go "rozjechac"
   z animacja wysokosci, bo obie sa niezalezne od siebie i zadna nie steruje
   tym samym w kazdej klatce. */
const packToggles = [...document.querySelectorAll("[data-pack-toggle]")];
const packPanels = [...document.querySelectorAll("[data-pack-panel]")];

if (packToggles.length && packPanels.length) {
  const kontenerPaneli = document.querySelector("[data-pack-panels]");
  const ODSTEP_OD_NAGLOWKA = 24;

  /* Bezpiecznik na wypadek, gdyby zdarzenie transitionend nie przyszlo
     (np. przegladarka calkowicie wstrzymala karte w tle w trakcie
     animacji). Bez tego panel zostalby zamrozony w polowie na zawsze —
     ten sam blad, ktory juz raz zlapalismy przy harmonijkach FAQ. */
  const bezpieczniki = new WeakMap();

  const domknijPanel = (panel, otwarty) => {
    window.clearTimeout(bezpieczniki.get(panel));
    bezpieczniki.delete(panel);
    /* Jawne przerwanie animowanej transition, nie tylko ustawienie
       docelowej wartosci. Zwykle transitionend przychodzi sam i to
       wystarcza, ale gdyby z jakiegos powodu nie przyszedl (a bezpiecznik
       ponizej go zastepuje), sama zmiana wartosci CSS nie musi przerwac
       JUZ trwajacej animacji do tej samej wartosci — bez jawnego
       "transition: none" na chwile stan potrafi zostac zamrozony
       w polowie zamiast doskoczyc do konca. */
    panel.style.transition = "none";
    panel.style.height = otwarty ? "auto" : "0px";
    panel.getBoundingClientRect();
    panel.style.transition = "";
  };

  const ustawWysokosc = (panel, otwarty) => {
    const inner = panel.querySelector(".offer-matrix__panel-inner");
    if (!inner) return;

    window.clearTimeout(bezpieczniki.get(panel));

    if (reduceMotion) {
      domknijPanel(panel, otwarty);
      return;
    }

    /* Start animacji zawsze z REALNEJ, aktualnej wysokosci — takze wtedy,
       gdy poprzednia animacja tego samego panelu zostala przerwana
       w polowie (np. szybkie klikanie tego samego przycisku). */
    const startowa = panel.getBoundingClientRect().height;
    panel.style.height = `${startowa}px`;
    panel.getBoundingClientRect(); /* wymuszenie przeliczenia stylu */

    /* Mierzymy caly panel, a nie samo scrollHeight jego tresci.
       inner.scrollHeight pomija obramowanie i margin-bottom dymka, przez co
       animacja konczyla sie ok. 28 px za wysoko. Przelaczenie na "auto" po
       transitionend dodawalo te brakujace piksele naraz i dolna krawedz
       wykonywala widoczny skok. panel.scrollHeight uwzglednia caly zajety
       obszar, rowniez gdy panel jest aktualnie zwiniety do 0 px. */
    const docelowa = otwarty ? panel.scrollHeight : 0;
    panel.style.height = `${docelowa}px`;

    const czas = getComputedStyle(panel).transitionDuration;
    const ms = (parseFloat(czas) || 0.42) * 1000;
    bezpieczniki.set(panel, window.setTimeout(() => domknijPanel(panel, otwarty), ms + 150));
  };

  packPanels.forEach(panel => {
    panel.addEventListener("transitionend", event => {
      if (event.target !== panel || event.propertyName !== "height") return;
      domknijPanel(panel, panel.classList.contains("is-open"));
    });
  });

  packToggles.forEach(toggle => {
    toggle.addEventListener("click", () => {
      const id = toggle.dataset.packToggle;
      const otwieramy = toggle.getAttribute("aria-expanded") !== "true";

      packToggles.forEach(inny => {
        const stan = otwieramy && inny === toggle;
        inny.setAttribute("aria-expanded", String(stan));
        inny.classList.toggle("is-open", stan);
      });

      packPanels.forEach(panel => {
        const maBycOtwarty = otwieramy && panel.dataset.packPanel === id;
        const bylOtwarty = panel.classList.contains("is-open");
        panel.classList.toggle("is-open", maBycOtwarty);
        panel.setAttribute("aria-hidden", String(!maBycOtwarty));
        if (maBycOtwarty !== bylOtwarty) ustawWysokosc(panel, maBycOtwarty);
      });

      /* Przewijamy tylko przy otwieraniu i tylko wtedy, gdy trzeba.

         Gorna krawedz kontenera paneli nie zmienia polozenia w trakcie
         rozwijania (panel rosnie w dol, w strone tabeli), wiec cel liczymy
         raz, od razu po klikniiu — nie trzeba czekac na koniec niczego. */
      if (!otwieramy) return;

      const odniesienie = kontenerPaneli || packPanels[0];
      const naglowek = document.querySelector("[data-header]");
      const wysokoscNaglowka = naglowek?.getBoundingClientRect().height || 68;

      const gornaKrawedz = odniesienie.getBoundingClientRect().top;
      const trzebaPrzewinac = gornaKrawedz < wysokoscNaglowka
        || gornaKrawedz > wysokoscNaglowka + ODSTEP_OD_NAGLOWKA + 40;

      if (!trzebaPrzewinac) return;

      const maksymalnyScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const cel = Math.min(
        maksymalnyScroll,
        Math.max(
          0,
          window.scrollY + gornaKrawedz - wysokoscNaglowka - ODSTEP_OD_NAGLOWKA
        )
      );

      window.scrollTo({
        top: cel,
        behavior: reduceMotion ? "instant" : "smooth"
      });
    });
  });
}


/* O NAS — rowne kolumny robi teraz sam CSS (grid + space-between).
   Wczesniejsza wersja liczyla wysokosc bloku w skrypcie i dzielila akapity
   miedzy kolumny; dawalo to rowna wysokosc, ale zostawialo na dole lewej
   kolumny pojedyncza wiszaca linie. Kod zostal usuniety zamiast rozbudowany. */

/* PAKIETY — "Otrzymujesz" na jednej linii we wszystkich kaflach
   (uwaga klienta nr 3, 22.09: "Wyrownaj rowniez linie Otrzymujesz:
   zeby lecialy od jednego poziomu").

   Opisy pakietow maja rozna dlugosc, wiec naglowek pod nimi startowal
   w kazdym kaflu na innej wysokosci. Wszystkie cztery kafle otwieraja
   sie jednym przyciskiem, wiec wystarczy zrownac wysokosc samych opisow
   do najwyzszego. Liczone z tresci, nie na sztywno. */
const siatkaPakietow = document.querySelector(".packages__grid");

if (siatkaPakietow) {
  const opisyPakietow = () => [...siatkaPakietow.querySelectorAll(".package-card__body > p")];

  const wyrownajOpisyPakietow = () => {
    const opisy = opisyPakietow();
    if (!opisy.length) return;

    opisy.forEach(opis => { opis.style.minHeight = ""; });

    /* Kafle jeden pod drugim (telefon) — nie ma czego wyrownywac w linii,
       a wyrownanie do najdluzszego opisu robilo puste dziury pod krotszymi. */
    const lewe = opisy.map(opis => Math.round(opis.getBoundingClientRect().left));
    if (new Set(lewe).size < 2) return;

    /* Kafle zamkniete nie maja wymiarow — nie ma czego wyrownywac. */
    const wysokosci = opisy.map(opis => opis.getBoundingClientRect().height);
    if (!wysokosci.some(Boolean)) return;

    const najwyzszy = Math.max(...wysokosci);
    opisy.forEach(opis => { opis.style.minHeight = `${najwyzszy}px`; });
  };

  /* Kafle otwiera wspolny przycisk, a zamyka animacja — lapiemy obie
     zmiany zamiast wpinac sie w srodek tamtej logiki. */
  new MutationObserver(() => window.requestAnimationFrame(wyrownajOpisyPakietow))
    .observe(siatkaPakietow, { attributes: true, subtree: true, attributeFilter: ["open"] });

  /* Tak samo jak przy kolumnach "o nas": obserwujemy szerokosc rodzica,
     a nie zdarzenie resize okna. Ustawiamy min-height na kafle wewnatrz
     siatki, wiec obserwowanie samej siatki robiloby petle. */
  const ramaPakietow = siatkaPakietow.parentElement;
  let przeliczenieOpisow = 0;
  const zaplanujPrzeliczenie = () => {
    window.clearTimeout(przeliczenieOpisow);
    przeliczenieOpisow = window.setTimeout(wyrownajOpisyPakietow, 150);
  };

  if (ramaPakietow && "ResizeObserver" in window) {
    let ostatniaSzerokosc = 0;
    new ResizeObserver(wpisy => {
      const szerokosc = Math.round(wpisy[0].contentRect.width);
      if (szerokosc === ostatniaSzerokosc) return;
      ostatniaSzerokosc = szerokosc;
      zaplanujPrzeliczenie();
    }).observe(ramaPakietow);
  }

  window.addEventListener("resize", zaplanujPrzeliczenie);
  window.addEventListener("akapity-ulozone", wyrownajOpisyPakietow);

  document.fonts?.ready.then(wyrownajOpisyPakietow);
}


/* =============================================================
   OFERTA NA TELEFONIE — pakiety jako zakladki zamiast tabeli
   (uwaga klienta 12.11: "tabela z pakietami nie jest dostosowana do
   wersji mobilnej, obecna wersja jest niefunkcjonalna dla uzytkownika,
   ktory nie mial wczesniej z nami stycznosci").

   Na telefonie tabela rozpadala sie na osobne kafle "Rzut ukladu
   funkcjonalnego: Pakiet 1 ✓, Pakiet 2 ✓, Pakiet 3 ✓" — kilkanascie
   identycznych kafli, z ktorych nie dalo sie odczytac, czym rozni sie
   jeden pakiet od drugiego. Teraz uzytkownik wybiera pakiet i widzi jego
   opis oraz pelna liste: co jest w pakiecie, a co nie.

   Widok budujemy z tej samej tabeli, wiec tresc jest w jednym miejscu —
   zmiana w tabeli (oferta.html) od razu zmienia tez wersje na telefon.
   Na komputerze nic sie nie zmienia: ten widok jest tam ukryty w CSS.
   ============================================================= */
const tabelaOferty = document.querySelector(".offer-matrix__table");

if (tabelaOferty) {
  const przyciskiPakietow = [...tabelaOferty.querySelectorAll("thead [data-pack-toggle]")];
  const pakiety = przyciskiPakietow.map(przycisk => ({
    id: przycisk.dataset.packToggle,
    numer: przycisk.querySelector(".offer-matrix__num")?.textContent.trim() || "",
    nazwa: przycisk.querySelector(".offer-matrix__name")?.textContent.trim() || "",
    opis: document.querySelector(`[data-pack-panel="${przycisk.dataset.packToggle}"] .offer-matrix__panel-inner`)
  }));

  /* Wiersze tabeli: grupy (naglowki) i pozycje z wartosciami dla pakietow. */
  const grupy = [];
  tabelaOferty.querySelectorAll("tbody tr").forEach(wiersz => {
    if (wiersz.classList.contains("offer-matrix__group")) {
      grupy.push({ nazwa: wiersz.textContent.trim(), pozycje: [] });
      return;
    }
    if (!grupy.length) grupy.push({ nazwa: "", pozycje: [] });
    const komorki = [...wiersz.querySelectorAll("td")].map(td => {
      if (td.querySelector(".of-yes")) return { typ: "tak" };
      if (td.querySelector(".of-no")) return { typ: "nie" };
      return { typ: "wartosc", tekst: td.textContent.trim() };
    });
    grupy[grupy.length - 1].pozycje.push({
      nazwa: wiersz.querySelector("th")?.textContent.trim() || "",
      komorki
    });
  });

  const el = (tag, klasa, tekst) => {
    const node = document.createElement(tag);
    if (klasa) node.className = klasa;
    if (tekst != null) node.textContent = tekst;
    return node;
  };

  const widok = el("div", "offer-mobile reveal");
  widok.setAttribute("data-offer-mobile", "");

  const podpowiedz = el("p", "offer-mobile__hint", "Wybierz pakiet, aby zobaczyć, co zawiera.");
  const zakladki = el("div", "offer-mobile__tabs");
  zakladki.setAttribute("role", "tablist");
  zakladki.setAttribute("aria-label", "Pakiety projektowe");

  const cialo = el("div", "offer-mobile__body");
  cialo.setAttribute("role", "tabpanel");
  cialo.id = "offer-mobile-panel";

  let aktywny = -1;
  let animacjaWysokosci = 0;
  let przyciski = [];

  const zbudujTresc = indeks => {
    const pakiet = pakiety[indeks];
    const tresc = el("div", "offer-mobile__inner");

    const wszystkie = grupy.flatMap(grupa => grupa.pozycje);
    const zawarte = wszystkie.filter(pozycja => pozycja.komorki[indeks]?.typ !== "nie").length;

    const glowa = el("div", "offer-mobile__head");
    glowa.append(
      el("p", "offer-mobile__num", pakiet.numer),
      el("h3", "offer-mobile__name", pakiet.nazwa),
      el("p", "offer-mobile__count", `${zawarte} z ${wszystkie.length} pozycji w pakiecie`)
    );
    tresc.append(glowa);

    if (pakiet.opis) {
      const opis = el("div", "offer-mobile__desc");
      pakiet.opis.querySelectorAll("p").forEach(akapit => opis.append(el("p", "", akapit.textContent.trim())));
      tresc.append(opis);
    }

    grupy.forEach(grupa => {
      if (grupa.nazwa) tresc.append(el("h4", "offer-mobile__group", grupa.nazwa));
      const lista = el("ul", "offer-mobile__list");
      grupa.pozycje.forEach(pozycja => {
        const komorka = pozycja.komorki[indeks] || { typ: "nie" };
        const li = el("li", `offer-mobile__item offer-mobile__item--${komorka.typ}`);
        const znak = el("span", "offer-mobile__mark", komorka.typ === "tak" ? "✓" : komorka.typ === "nie" ? "—" : komorka.tekst);
        znak.setAttribute("aria-hidden", "true");
        li.append(znak, el("span", "offer-mobile__label", pozycja.nazwa));
        if (komorka.typ === "nie") li.append(el("span", "offer-mobile__note", "poza pakietem"));
        const dlaCzytnika = komorka.typ === "tak" ? "w pakiecie" : komorka.typ === "nie" ? "" : `w pakiecie: ${komorka.tekst}`;
        if (dlaCzytnika) li.append(el("span", "visually-hidden", ` — ${dlaCzytnika}`));
        lista.append(li);
      });
      tresc.append(lista);
    });

    tresc.querySelectorAll(".offer-mobile__desc p").forEach(protectPolishTypography);
    return tresc;
  };

  const pokazPakiet = indeks => {
    if (indeks === aktywny) return;
    const pierwszy = aktywny === -1;
    aktywny = indeks;

    przyciski.forEach((przycisk, i) => {
      const wybrany = i === indeks;
      przycisk.setAttribute("aria-selected", String(wybrany));
      przycisk.tabIndex = wybrany ? 0 : -1;
      przycisk.classList.toggle("is-active", wybrany);
    });
    cialo.setAttribute("aria-labelledby", przyciski[indeks].id);

    const nowa = zbudujTresc(indeks);

    if (pierwszy) {
      cialo.replaceChildren(nowa);
      return;
    }

    /* Zakladki sa przyklejone pod naglowkiem, wiec "zawsze widac" je na
       ekranie. Jesli poczatek listy schowal sie juz pod nimi (uzytkownik byl
       nizej), po zmianie pakietu wracamy lagodnie na poczatek nowego pakietu. */
    const dolZakladek = zakladki.getBoundingClientRect().bottom;
    const goraCiala = cialo.getBoundingClientRect().top;
    if (goraCiala < dolZakladek) {
      const odstepPodZakladkami = 14;
      window.scrollTo({
        top: Math.max(0, window.scrollY + goraCiala - dolZakladek - odstepPodZakladkami),
        behavior: reduceMotion ? "auto" : "smooth"
      });
    }

    /* Plynna zmiana wysokosci + przenikanie tresci, zeby nic nie skakalo. */
    window.clearTimeout(animacjaWysokosci);
    const z = cialo.getBoundingClientRect().height;
    cialo.style.height = `${z}px`;
    cialo.replaceChildren(nowa);
    nowa.classList.add("is-entering");
    const na = nowa.getBoundingClientRect().height;
    cialo.getBoundingClientRect();
    cialo.style.height = `${na}px`;
    requestAnimationFrame(() => requestAnimationFrame(() => nowa.classList.remove("is-entering")));

    animacjaWysokosci = window.setTimeout(() => {
      cialo.style.height = "";
    }, 420);
  };

  przyciski = pakiety.map((pakiet, indeks) => {
    const przycisk = el("button", "offer-mobile__tab");
    przycisk.type = "button";
    przycisk.id = `offer-mobile-tab-${pakiet.id}`;
    przycisk.setAttribute("role", "tab");
    przycisk.setAttribute("aria-controls", cialo.id);
    przycisk.append(el("span", "offer-mobile__tab-num", pakiet.numer), el("span", "offer-mobile__tab-name", pakiet.nazwa));
    przycisk.addEventListener("click", () => pokazPakiet(indeks));
    zakladki.append(przycisk);
    return przycisk;
  });

  /* Strzalki lewo/prawo przelaczaja zakladki — standard dla role="tablist". */
  zakladki.addEventListener("keydown", event => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const nastepny = (aktywny + (event.key === "ArrowRight" ? 1 : -1) + przyciski.length) % przyciski.length;
    pokazPakiet(nastepny);
    przyciski[nastepny].focus();
  });

  widok.append(podpowiedz, zakladki, cialo);
  const tabelaKontener = tabelaOferty.closest(".offer-matrix__scroll");
  tabelaKontener?.parentNode.insertBefore(widok, tabelaKontener);
  pokazPakiet(0);

  /* Reveal dla nowego elementu — ten sam efekt co reszta strony. */
  if (reduceMotion || !("IntersectionObserver" in window)) widok.classList.add("is-visible");
  else {
    const obserwator = new IntersectionObserver(wpisy => {
      if (!wpisy.some(w => w.isIntersecting)) return;
      widok.classList.add("is-visible");
      obserwator.disconnect();
    }, { threshold: .01, rootMargin: "0px 0px 90px 0px" });
    obserwator.observe(widok);
  }
}
