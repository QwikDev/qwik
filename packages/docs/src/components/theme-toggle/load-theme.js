try {
  const getItem = localStorage.getItem("theme-preference");
  const el = document.firstElementChild;
  if (!el) {
    throw new Error("documentElement not found");
  }

  if (getItem === "light" || getItem === "dark") {
    el.setAttribute("data-theme", getItem);
  } else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    el.setAttribute("data-theme", isDark ? "dark" : "light");
  }
} catch (err) {
  console.error(err);
}
