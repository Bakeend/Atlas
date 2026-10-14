# Política de segurança

O Atlas Finance manipula dados financeiros pessoais, portanto privacidade e integridade são prioridades.

## Reportar vulnerabilidades

**Não divulgue publicamente vulnerabilidades exploráveis ou dados pessoais em issues, PRs ou discussões.**

1. Verifique se o repositório tem a opção **Private vulnerability reporting** habilitada na aba **Security** do GitHub e, se estiver, utilize-a.
2. Se a opção não estiver disponível, entre em contato com o mantenedor por um canal privado a partir do perfil [Bakeend](https://github.com/Bakeend) e combine um meio seguro para compartilhar os detalhes.
3. Inclua versão/commit, passos para reproduzir com dados sintéticos, impacto e ambiente. Nunca anexe backups financeiros reais, tokens, extratos ou capturas com informações pessoais.

Não há promessa pública de prazo de resposta ou programa de recompensa.

## Modelo de dados e limites

- Persistência local com IndexedDB/AlaSQL e fallback para localStorage, conforme ambiente.
- Backup JSON manual **sem criptografia**. Quem tiver o arquivo poderá ler as informações.
- Limpar os dados do navegador ou remover o aplicativo pode apagar dados locais.
- Não há sincronização com servidor ou autenticação de usuário no fluxo principal atual.
- Dependências, histórico de commits, builds e permissões Android devem ser reavaliados antes de qualquer publicação pública.

## Recomendações para usuários

- Proteja seu aparelho e navegador com bloqueio de tela/senha.
- Mantenha backups em local seguro, de preferência criptografado pelo sistema.
- Não envie dados reais para issues ou testes.
- Use versões e artefatos de release verificados; o APK gerado no CI é de depuração.

Consulte o [checklist de publicação](docs/OPEN_SOURCE_CHECKLIST.md) para os controles que ainda devem ser conferidos.
