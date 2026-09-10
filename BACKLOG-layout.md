# Backlog — layout · Facilitation_frontend (A21)

> **Cible :** `STANDARD-frontend-layout.md` (repo `foxugly-ops`) ; réf = `FoxRunner_frontend`
> (+ app runnable `foxugly-ops/frontend-reference/foo-app`).
> **Statut : ✅ CONFORME — MERGÉ + DÉPLOYÉ** (facilitation.foxugly.com). Aucune tâche restante.

## ✅ Fait + déployé
- Tokens sémantiques + retrait Tailwind ; chrome `core/layout` (`app-topmenu`, `app-user-menu`,
  `app-footer`) ; `app-language-switcher` (Transloco 5 langues) ; shell + skip-link ; empty-state + skeletons.
- **Conformité 2026-07-12 (déployé)** :
  - Chrome : triggers thème + langue **borderless** ; **icône globe retirée** du switcher (code langue seul).
  - **`app-auth-card`** + **7 pages auth migrées** ; login au gabarit de réf (`p-password`, « Se souvenir »
    + « Oublié ? » sur une ligne, bouton emerald, séparateur « ou » + **lien magique inline**, « Créer un compte »).
    `remember` → persistance du refresh token dans `AuthService`.
  - Footer complet (logo/lien Foxugly, **Privacy**, rights, séparateurs `·`) + page `/privacy`.
  - **Turnstile (Cloudflare)** câblé + **LIVE** sur register + forgot-password + magic-link (widget
    `shared/turnstile/`, clés SSM seedées, backend fail-closed). Cf. mémoire `fleet-turnstile-rollout`.
- **Audit profond 2026-07-12 (déployé)** :
  - Token **`--chrome-accent`** ajouté (lien nav actif = tint translucide `color-mix`).
  - Topmenu → **BEM `topbar__*`** (classes lâches `.brand`/`.nav`/`.nav-cta` renommées).
  - Home routée sur **`/home`** (+ redirect `''`→`home`, liens marque/nav mis à jour).
  - Route `magic-link-request` **orpheline supprimée** (la demande de lien magique est inline depuis le login ;
    page de vérification conservée).
  - Fiche About : stack **« Tailwind » → « SCSS/BEM »** (5 langues) — mention obsolète corrigée.

**Aucune tâche restante.**
