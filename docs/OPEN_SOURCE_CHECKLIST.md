# Checklist de abertura do código — Atlas Finance

Esta lista acompanha a preparação do repositório para publicação **sem alterar sua visibilidade**. Não equivale a uma auditoria independente de segurança.

## Documentação e comunidade

- [x] README em português e versão em inglês
- [x] Banner SVG compatível com o GitHub e alinhado à cor oficial \`#2F80ED\`
- [x] Licença MIT adicionada (validar titularidade e direitos sobre todos os arquivos)
- [x] Guia de contribuições, conduta e política de segurança
- [x] Templates de issues e pull requests

## Antes de tornar o repositório público

- [ ] **Auditar todo o histórico Git**, não apenas a árvore atual. Credenciais removidas de commits ainda podem ser recuperadas ao publicar.
- [ ] Executar um detector de segredos no histórico completo (por exemplo, Gitleaks) e revisar resultados manualmente.
- [ ] Se houver segredo histórico, **revogar/rotacionar primeiro** e avaliar reescrita do histórico (com coordenação de forks e clones).
- [ ] Revisar commits antigos que adicionaram e depois removeram integrações de IA, endpoints, artefatos auxiliares e variáveis \`.env\`.
- [ ] Confirmar que nenhuma captura, planilha, extrato, backup, log ou arquivo de demonstração contém dados pessoais reais.
- [ ] Confirmar origem, autoria e direitos de logotipos, imagens, fontes e outros recursos, e se podem acompanhar a licença MIT.
- [ ] Rodar \`npm ci\`, \`npm run lint\`, \`npm test\` e \`npm run build\` em ambiente limpo.
- [ ] Fazer auditoria de dependências (\`npm audit\`, licenças e atualizações), registrando riscos conhecidos.
- [ ] Verificar no Android as permissões, armazenamento local, atualizações, backups e artefatos assinados.
- [ ] Testar importação CSV/OFX, regras financeiras, cartões, restauração de backup e migrações com dados fictícios.
- [ ] Validar o fluxo de backup JSON **sem criptografia** e avisos ao usuário.
- [ ] Revisar \`AGENTS.md\` e demais materiais técnicos para retirar referências a recursos removidos, incluindo IA.
- [ ] Configurar regras de proteção da branch, revisão de PR, varredura de segredos e relatórios privados de vulnerabilidades, quando disponíveis.
- [ ] Criar release/tag e capturas **reais**, anonimizadas, após testes.
- [ ] Revisar a licença MIT com o titular do código e verificar a compatibilidade dos recursos de terceiros.
- [ ] **Só então** alterar a visibilidade do repositório para público, conscientemente.

## Notas técnicas

- \`.gitignore\` já exclui \`.env\`, \`.env.*\` (exceto \`.env.example\`), logs e diretórios de build.
- Os dados de demonstração encontrados em \`src/testing/seedFixture.ts\` são genéricos; não devem ser confundidos com dados reais.
- O armazenamento atual é local, com IndexedDB e fallback; isso **não fornece criptografia** por si só.
- O APK do workflow é um build **debug**.
- A referência a IA/OpenRouter em \`AGENTS.md\` reflete uma arquitetura anterior e não deve ser promovida como funcionalidade atual.
