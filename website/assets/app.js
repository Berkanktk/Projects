(function () {
  "use strict";

  const README_PATH = "../README.md";

  const contentEl = document.getElementById("content");
  const subtitleEl = document.querySelector(".subtitle");
  const navEl = document.getElementById("section-nav");
  const searchEl = document.getElementById("search");
  const themeToggle = document.getElementById("theme-toggle");

  initTheme();

  fetch(README_PATH, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then((text) => render(parseReadme(text)))
    .catch((err) => {
      contentEl.innerHTML = "";
      const p = document.createElement("div");
      p.className = "error";
      p.textContent = "Could not load README.md (" + err.message + ").";
      contentEl.appendChild(p);
    });

  // ---------- Parsing ----------

  function parseReadme(raw) {
    const lines = raw.replace(/\r\n/g, "\n").split("\n");

    // Split into top-level ("# ") sections, preserving order.
    const sections = [];
    let current = null;
    for (const line of lines) {
      const match = /^#\s+(.+?)\s*$/.exec(line);
      if (match) {
        current = { title: match[1], bodyLines: [] };
        sections.push(current);
      } else if (current) {
        current.bodyLines.push(line);
      }
    }

    const result = { intro: null, categories: [] };

    for (const section of sections) {
      const title = section.title;
      if (/^table of contents$/i.test(title)) continue;

      if (/^introduction$/i.test(title)) {
        result.intro = parseIntro(section.bodyLines);
        continue;
      }

      const parsed = parseTableSection(section.bodyLines);
      if (parsed.table) {
        result.categories.push({
          title,
          slug: slugify(title),
          headers: parsed.table.headers,
          rows: parsed.table.rows,
          notes: parsed.notes,
        });
      } else if (parsed.notes.length) {
        // Trailing section with no table (e.g. footnotes at end of file).
        result.categories.push({
          title,
          slug: slugify(title),
          headers: null,
          rows: [],
          notes: parsed.notes,
        });
      }
    }

    return result;
  }

  function parseIntro(bodyLines) {
    const text = bodyLines.map((l) => l.trim()).filter(Boolean);
    const paragraph = text.find((l) => !l.startsWith(">"));
    const quoteLine = text.find((l) => l.startsWith(">"));
    return {
      paragraph: paragraph || "",
      quote: quoteLine ? quoteLine.replace(/^>\s*/, "") : "",
    };
  }

  function parseTableSection(bodyLines) {
    let start = -1;
    let end = -1;
    for (let i = 0; i < bodyLines.length; i++) {
      const isRow = bodyLines[i].trim().startsWith("|");
      if (isRow && start === -1) start = i;
      if (isRow) end = i;
      else if (start !== -1 && !isRow) break;
    }

    const notes = [];
    let table = null;

    if (start !== -1) {
      const before = bodyLines.slice(0, start);
      const after = bodyLines.slice(end + 1);
      notes.push(...before, ...after);

      const tableLines = bodyLines.slice(start, end + 1).map(splitTableRow);
      const headers = tableLines[0];
      const rows = tableLines.slice(2); // skip header + separator row
      table = { headers, rows };
    } else {
      notes.push(...bodyLines);
    }

    const cleanNotes = notes
      .map((l) => l.trim())
      .filter((l) => l.length && !/^-{3,}$/.test(l));

    return { table, notes: cleanNotes };
  }

  function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  }

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // Parses a subset of inline markdown ([text](url), **bold**, plain text)
  // into DOM nodes, appended to `parent`.
  function appendInline(parent, text) {
    const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      if (match[1] !== undefined) {
        const a = document.createElement("a");
        a.href = match[2];
        a.textContent = match[1];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        parent.appendChild(a);
      } else if (match[3] !== undefined) {
        const b = document.createElement("strong");
        b.textContent = match[3];
        parent.appendChild(b);
      }
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function extractLinks(cell) {
    const links = [];
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = re.exec(cell)) !== null) {
      links.push({ label: match[1], url: match[2] });
    }
    return links;
  }

  // ---------- Icons ----------

  const ICON_PATHS = {
    code: '<polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/>',
    external:
      '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    link: '<path d="M9 17H7a5 5 0 0 1 0-10h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>',
  };

  function createIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("link-icon");
    svg.innerHTML = ICON_PATHS[name] || ICON_PATHS.link;
    return svg;
  }

  function linkKind(label) {
    if (/repo/i.test(label)) return "code";
    if (/showcase|demo|live/i.test(label)) return "external";
    return "link";
  }

  function statPill(count, label) {
    const pill = document.createElement("span");
    pill.className = "stat-pill";
    const num = document.createElement("strong");
    num.textContent = count;
    pill.appendChild(num);
    pill.appendChild(document.createTextNode(" " + label));
    return pill;
  }

  // ---------- Rendering ----------

  function render(data) {
    contentEl.innerHTML = "";
    navEl.innerHTML = "";

    if (data.intro) {
      subtitleEl.textContent = data.intro.paragraph;
      const intro = document.createElement("div");
      intro.className = "intro";
      if (data.intro.quote) {
        const bq = document.createElement("blockquote");
        appendInline(bq, data.intro.quote);
        intro.appendChild(bq);
      }

      const totalProjects = data.categories.reduce(
        (sum, cat) => sum + cat.rows.length,
        0,
      );
      const totalCategories = data.categories.filter(
        (cat) => cat.rows.length,
      ).length;
      if (totalProjects) {
        const stats = document.createElement("div");
        stats.className = "stats";
        stats.appendChild(statPill(totalProjects, "projects"));
        stats.appendChild(statPill(totalCategories, "categories"));
        intro.appendChild(stats);
      }

      contentEl.appendChild(intro);
    }

    const allCards = [];
    let cardIndex = 0;

    data.categories.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "section";
      section.id = cat.slug;

      const h2 = document.createElement("h2");
      const h2Title = document.createElement("span");
      h2Title.textContent = cat.title;
      h2.appendChild(h2Title);
      if (cat.rows.length) {
        const count = document.createElement("span");
        count.className = "section-count";
        count.textContent = cat.rows.length;
        h2.appendChild(count);
      }
      section.appendChild(h2);

      if (cat.headers && cat.rows.length) {
        const grid = document.createElement("div");
        grid.className = "card-grid";

        const nameIdx = 0;
        const descIdx = cat.headers.findIndex((h) => /description/i.test(h));
        const typeIdx = cat.headers.findIndex((h) => /type|platform/i.test(h));
        const statusIdx = cat.headers.findIndex((h) => /status/i.test(h));
        const linksIdx = cat.headers.findIndex((h) => /link/i.test(h));

        cat.rows.forEach((cells) => {
          if (!cells.length || !cells[nameIdx]) return;
          const card = document.createElement("article");
          card.className = "card";
          card.style.animationDelay = Math.min(cardIndex * 25, 300) + "ms";
          cardIndex += 1;

          const titleRow = document.createElement("div");
          titleRow.className = "card-title-row";

          const title = document.createElement("div");
          title.className = "card-title";
          title.textContent = cells[nameIdx];
          titleRow.appendChild(title);

          if (statusIdx !== -1 && cells[statusIdx]) {
            const badge = document.createElement("span");
            const statusText = cells[statusIdx].trim();
            const statusSlug = statusText.toLowerCase();
            badge.className = "badge " + statusSlug;
            badge.textContent = statusText;
            titleRow.appendChild(badge);
            card.classList.add("status-" + statusSlug);
          }
          card.appendChild(titleRow);

          if (typeIdx !== -1 && cells[typeIdx]) {
            const meta = document.createElement("div");
            meta.className = "card-meta";
            meta.textContent = cells[typeIdx];
            card.appendChild(meta);
          }

          if (descIdx !== -1 && cells[descIdx]) {
            const desc = document.createElement("p");
            desc.className = "card-desc";
            appendInline(desc, cells[descIdx]);
            card.appendChild(desc);
          }

          const linksWrap = document.createElement("div");
          linksWrap.className = "card-links";
          const links = linksIdx !== -1 ? extractLinks(cells[linksIdx]) : [];
          if (links.length) {
            links.forEach((link) => {
              const a = document.createElement("a");
              a.href = link.url;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              const kind = linkKind(link.label);
              a.className = "card-link " + (kind === "external" ? "primary" : "secondary");
              a.appendChild(createIcon(kind));
              const label = document.createElement("span");
              label.textContent = link.label;
              a.appendChild(label);
              linksWrap.appendChild(a);
            });
          } else {
            const none = document.createElement("span");
            none.className = "none";
            none.textContent = "No public link";
            linksWrap.appendChild(none);
          }
          card.appendChild(linksWrap);

          card.dataset.search = (
            cells[nameIdx] +
            " " +
            (cells[descIdx] || "")
          ).toLowerCase();
          grid.appendChild(card);
          allCards.push(card);
        });

        section.appendChild(grid);
      }

      if (cat.notes.length) {
        const notes = document.createElement("div");
        notes.className = "section-notes";
        cat.notes.forEach((line) => {
          const p = document.createElement("p");
          appendInline(p, line);
          notes.appendChild(p);
        });
        section.appendChild(notes);
      }

      contentEl.appendChild(section);

      const navLink = document.createElement("a");
      navLink.href = "#" + cat.slug;
      navLink.textContent = cat.title;
      navEl.appendChild(navLink);
    });

    const noResults = document.createElement("div");
    noResults.id = "no-results";
    noResults.className = "no-results hidden";
    noResults.textContent = "No projects match your search.";
    contentEl.appendChild(noResults);

    searchEl.addEventListener("input", () => filterCards(allCards));
    trackActiveSection();
  }

  function filterCards(cards) {
    const query = searchEl.value.trim().toLowerCase();
    let visibleTotal = 0;
    cards.forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.classList.toggle("hidden", !match);
      if (match) visibleTotal += 1;
    });
    document.querySelectorAll(".section").forEach((section) => {
      const visible = section.querySelectorAll(".card:not(.hidden)").length;
      const hasGrid = section.querySelector(".card-grid");
      if (hasGrid) section.classList.toggle("hidden", visible === 0 && !!query);
    });
    const noResults = document.getElementById("no-results");
    if (noResults) noResults.classList.toggle("hidden", !query || visibleTotal > 0);
  }

  function trackActiveSection() {
    const sections = Array.from(document.querySelectorAll(".section"));
    const navLinks = Array.from(navEl.querySelectorAll("a"));
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const setActive = (slug) => {
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + slug);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
  }

  // ---------- Theme ----------

  function initTheme() {
    const stored = localStorage.getItem("theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    updateThemeIcon();

    themeToggle.addEventListener("click", () => {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const current =
        document.documentElement.getAttribute("data-theme") ||
        (prefersDark ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      updateThemeIcon();
    });
  }

  function updateThemeIcon() {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const current =
      document.documentElement.getAttribute("data-theme") ||
      (prefersDark ? "dark" : "light");
    themeToggle.setAttribute("data-resolved-theme", current);
  }
})();
