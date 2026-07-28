// Converte o `avatar_url` ARMAZENADO (forma canônica "/uploads/<arquivo>") na URL que o
// NAVEGADOR deve usar para carregar a foto do usuário.
//
// Mesma armadilha da logo (ver src/lib/branding.js): no modo `output: "standalone"` do Next,
// arquivos gravados em public/uploads/ em runtime NÃO são servidos estaticamente — o servidor
// estático "captura" /uploads/* antes de qualquer route handler e devolve 404. Por isso a foto
// é entregue por /api/avatars/<arquivo>, que nunca colide com public/.
export function toServableAvatarUrl(stored) {
  if (!stored) return "";
  if (stored.startsWith("/uploads/")) {
    return `/api/avatars/${stored.slice("/uploads/".length)}`;
  }
  return stored; // já é /api/avatars/...
}
