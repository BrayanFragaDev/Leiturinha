// Avisos curtos na região #avisos. Mensagens seguidas se empilham.
const DURATION_MS = 4000;

export function showToast(msg) {
  const host = document.getElementById('avisos');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'aviso';
  el.textContent = msg;
  host.append(el);
  setTimeout(() => el.remove(), DURATION_MS);
}
