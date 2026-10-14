# Contribuindo para o Atlas Finance

Obrigado por ajudar a melhorar o Atlas! Qualquer contribuição deve respeitar a **integridade dos dados financeiros** e preservar o comportamento existente.

## Antes de começar

1. Leia [AGENTS.md](AGENTS.md) (regras de engenharia), [REGRAS_VISUAIS.md](REGRAS_VISUAIS.md) (padrões visuais) e [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
2. Confira issues abertas para evitar trabalho duplicado.
3. Para alterações amplas, abra uma issue e descreva o problema antes do PR.
4. Não compartilhe dados bancários reais, capturas de usuários, tokens, backups ou arquivos \`.env\`.

## Ambiente

Requisitos: Node.js 22, npm e Git.

\`\`\`bash
npm ci
npm run dev
\`\`\`

Validação antes de um PR:

\`\`\`bash
npm run lint   # Checagem de tipos
npm test
npm run build
\`\`\`

O APK Android é opcional para contribuições exclusivamente Web; mudanças em código nativo, Capacitor, manifesto ou plugins devem ser testadas também no Android.

## Fluxo de contribuição

- Crie uma branch descritiva a partir de \`master\`, como \`fix/correcao-extrato\`.
- Faça mudanças pequenas e explique o motivo no PR.
- Adicione testes para correções em cálculos, persistência ou importação.
- Teste migração/restauração antes de mudar estruturas de dados.
- Não inclua refatorações sem relação com o problema corrigido.
- Se alterar a UI, siga os componentes e tokens existentes.
- Se alterar texto ou funcionalidade pública, atualize a documentação.
- Use exemplos fictícios e remova metadados pessoais das capturas de tela.

## Modelo de pull request

Descreva o **problema**, a **solução**, os **testes executados** e, quando necessário, o **impacto na privacidade/persistência**. Consulte o template padrão de PR.

## Relato de vulnerabilidade

**Não abra issue pública com prova de conceito que contenha credenciais ou dados pessoais.** Siga [SECURITY.md](SECURITY.md).

## Licenciamento

Ao contribuir, você concorda que suas contribuições serão disponibilizadas sob a [Licença MIT](LICENSE) do projeto e declara ter direito de disponibilizar o código enviado.
