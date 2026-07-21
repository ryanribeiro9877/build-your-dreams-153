/* ============================================================
   domSafeMutations — rede de segurança contra tradutores de navegador
   ------------------------------------------------------------
   Extensões de tradução (Google Tradutor, etc.) reescrevem text nodes
   trocando-os por <font>…</font>. O React guarda referências aos nós
   originais e, ao re-renderizar, chama parent.removeChild(nó) /
   parent.insertBefore(nó, ref) sobre nós cujo pai REAL mudou —
   estourando "NotFoundError: Failed to execute 'removeChild' on 'Node':
   The node to be removed is not a child of this node.".

   A defesa PRIMÁRIA é o <meta name="google" content="notranslate"> +
   translate="no" no index.html (impede a mutação na origem). Este patch
   é só o cinto-e-suspensório: se algum tradutor ignorar as diretivas,
   preferimos um no-op silencioso a um white-screen no error boundary.

   O patch NÃO altera o caminho feliz: só curto-circuita quando a
   invariante pai↔filho JÁ está violada (o que, sem ele, lançaria).
   Mantém console.error para que bugs REAIS de React continuem visíveis.

   Ref: facebook/react#11538 (padrão consolidado na comunidade).
============================================================ */

export function installDomTranslationGuard(): void {
  if (typeof Node !== "function" || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (typeof console !== "undefined") {
        console.error(
          "[domSafeMutations] removeChild ignorado: nó não é filho deste pai " +
            "(provável mutação de tradutor de navegador).",
          child,
          this,
        );
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== "undefined") {
        console.error(
          "[domSafeMutations] insertBefore ignorado: nó de referência não é filho " +
            "deste pai (provável mutação de tradutor de navegador).",
          referenceNode,
          this,
        );
      }
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
