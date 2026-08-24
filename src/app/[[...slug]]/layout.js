"use client";

import AppShell from "./app-shell";

// O shell inteiro do app vive no LAYOUT deste segmento, não na page: no App Router a
// page de um segmento dinâmico REMONTA a cada mudança de slug (ou seja, a cada
// router.push do setView), zerando todo o estado (filtro de unidade, listas, edição)
// e refazendo todos os fetches. Era a causa de "editar abre vazio" e do filtro de
// unidade se perder ao navegar. Layouts são preservados entre navegações — o shell
// mantém o estado e a URL continua sendo a fonte da verdade da tela via usePathname().
export default function SlugLayout({ children }) {
  return (
    <>
      <AppShell />
      {children}
    </>
  );
}
