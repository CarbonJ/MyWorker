// Theme bootstrap — runs as a blocking script before first paint to avoid a
// light-mode flash. External file (not inline) so the production CSP can drop
// 'unsafe-inline' from script-src.
if (localStorage.getItem('myworker:theme') === 'dark' ||
    (!localStorage.getItem('myworker:theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}
