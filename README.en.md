<p align="center">
  <img src="docs/assets/atlas-banner.svg" alt="Atlas Finance — open-source personal finance app" width="100%" />
</p>

<p align="center"><strong>Your money, your rules.</strong><br/>Local-first personal finance for Web and Android.</p>

<p align="center">
  <a href="README.md">Português (Brasil)</a> ·
  <a href="CONTRIBUTING.md">Contributing (PT-BR)</a> ·
  <a href="SECURITY.md">Security (PT-BR)</a> ·
  <a href="LICENSE">MIT License</a>
</p>

## What is Atlas Finance?

**Atlas Finance** is an independent, evolving personal-finance application built with React, TypeScript and Capacitor. It supports financial records, cash-flow organization, credit cards, budgets and balance forecasts, using local browser/device storage.

The banner is a **concept illustration**, not a screenshot of the running app.

### Current functionality

- Dashboard with balances, income, expenses and charts
- Transactions, categories, accounts and wallets
- Payment allocation, budgets and financial goals
- Credit cards, invoices, purchases and installments
- Recurring expenses/income and balance forecasting
- Import of CSV/OFX bank statements with duplicate detection
- Themes, notifications, customizable dashboard and navigation
- Manual JSON backup/restore

### Technology

React 19, TypeScript, Vite, Tailwind CSS, Zustand, Zod, React Hook Form, AlaSQL/IndexedDB/localStorage, Recharts, Vitest, Vite PWA, and Capacitor 7 (Android).

**Note:** AI/OpenRouter mentioned in older documentation or commits is historical, not a currently integrated user-facing feature.

## Run locally

Requires **Node.js 22**, npm and Git.

\`\`\`bash
git clone https://github.com/Bakeend/financas.git
cd financas
npm ci
npm run dev
\`\`\`

Run checks and create a production web build:

\`\`\`bash
npm run lint   # TypeScript typecheck, not ESLint
npm test
npm run build
npm run preview
\`\`\`

For Android development, install Android Studio, Android SDK and an appropriate JDK (CI uses Java 21):

\`\`\`bash
npm run build
npx cap sync android
npx cap open android
\`\`\`

The Android GitHub Action creates a **debug APK** artifact, not a signed production release.

## Privacy and limitations

Financial records are stored **on the device/browser** using IndexedDB or a local-storage fallback. CSV/OFX imports are processed locally in the current flow. JSON backup exports are **not encrypted**: keep them private and never attach real financial data to issues or pull requests. Browser storage is not a replacement for a safe backup. The current app does not offer mandatory login or a cloud-sync service.

This repository has not been declared production/security audited. Review [the publication checklist](docs/OPEN_SOURCE_CHECKLIST.md) before making it public.

## Contributing and licensing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), [AGENTS.md](AGENTS.md), and [REGRAS_VISUAIS.md](REGRAS_VISUAIS.md). For proposed changes, open an issue first if scope is significant and run the lint, test and build scripts before filing a PR.

Licensed under the [MIT License](LICENSE), © 2026 Bakeend. Provided "as is", without warranties or financial advice.
