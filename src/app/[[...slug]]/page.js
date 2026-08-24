// A UI vive no layout.js deste segmento (AppShell), que o App Router preserva entre
// navegações — ver comentário lá. A page existe só para o segmento responder à rota;
// ela remonta a cada navegação, por isso não pode renderizar nada com estado.
export default function Page() {
  return null;
}
