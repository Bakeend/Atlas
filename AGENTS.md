# AGENTS.md — Regras de Engenharia do Atlas Finance

> Este arquivo é a regra-mãe para qualquer agente, desenvolvedor ou automação que altere este repositório.
>
> Objetivo: manter o Atlas Finance estável, consistente, seguro, barato de operar e fácil de evoluir.

## 0. Precedência e escopo

Estas regras valem para todo o repositório.

Quando houver conflito:

1. Segurança e integridade dos dados financeiros vêm primeiro.
2. Este `AGENTS.md` define regras gerais de engenharia.
3. `REGRAS_VISUAIS.md` é a fonte específica para UI/UX e componentes visuais.
4. Código existente e contratos públicos devem ser preservados até haver motivo técnico comprovado para mudança.

Não reescrever uma feature inteira quando uma correção incremental resolver.

---

## 1. Stack oficial

O projeto atual usa principalmente:

- React 19
- Vite
- TypeScript em modo strict
- Zustand
- Zod
- React Hook Form
- Recharts
- Lucide React
- IndexedDB/persistência local
- Capacitor para Android
- DeepSeek via OpenRouter para IA
- GitHub Actions para CI e build Android

Antes de adicionar uma biblioteca, verificar se o projeto já possui uma solução equivalente.

Não adicionar dependência para resolver algo simples que pode ser feito com a stack atual.

---

## 2. Fluxo obrigatório antes de alterar código

Antes de implementar qualquer tarefa:

1. Ler os arquivos realmente envolvidos.
2. Localizar componentes, services, store, schemas e testes existentes.
3. Confirmar se já existe solução reutilizável.
4. Identificar o menor conjunto de arquivos necessário.
5. Entender o comportamento mobile e web.
6. Entender impacto em persistência, IA e Android quando aplicável.
7. Só então alterar.

### Proibido

- inventar estrutura sem verificar o projeto;
- criar componente duplicado;
- criar segundo fluxo de negócio paralelo;
- substituir arquitetura funcional sem necessidade;
- fazer refactor amplo junto com bugfix pequeno;
- alterar comportamento não solicitado só porque parece mais elegante.

### Regra do diff mínimo

Uma correção deve produzir o menor diff que resolva corretamente a causa raiz.

Se um bug pode ser corrigido em 20 linhas, não transformar em uma refatoração de 500 linhas.

---

## 3. Regras de codificação TypeScript/React

### TypeScript

- Manter `strict` ativo.
- Não introduzir novos `any` sem justificativa real.
- Ao tocar código legado com `any`, reduzir quando for seguro, mas não fazer limpeza massiva fora do escopo.
- Preferir tipos explícitos nos contratos de domínio, tools, services e respostas externas.
- Usar unions discriminadas para estados e blocos visuais.
- Validar dados externos com Zod.
- Nunca confiar em JSON vindo de IA, API, importação ou storage sem validação quando houver risco de inconsistência.

### React

- Componentes devem focar em apresentação e coordenação de UI.
- Regra financeira complexa não pertence ao JSX.
- Não executar cálculos pesados repetidamente dentro de render quando puderem ser derivados em service/memoização.
- Evitar componentes gigantes; extrair quando houver responsabilidade clara, não por quantidade arbitrária de linhas.
- Não criar estado duplicado para algo que já existe no Zustand.
- Efeitos devem ter motivo explícito e cleanup correto.
- Listeners, timers, streams, reconhecimento de voz e objetos de áudio devem ser liberados no unmount.

### Nomes

- Componentes: `PascalCase`.
- Funções/variáveis: `camelCase`.
- Constantes globais: `UPPER_SNAKE_CASE` apenas quando realmente constantes.
- Nomes devem explicar intenção financeira, não implementação acidental.

Exemplo:

```ts
calculateAvailableMoney()
```

é melhor que:

```ts
calc2()
```

---

## 4. Encoding, idioma e texto

Todo arquivo de texto deve ser salvo em **UTF-8**.

Preferir UTF-8 sem BOM em novos arquivos.

### Nunca aceitar mojibake

Exemplos proibidos:

```text
finanÃ§as
atÃ©
peÃ§a
nÃ£o
```

Correto:

```text
finanças
até
peça
não
```

Antes de concluir uma alteração que toca textos em português:

- procurar por `Ã`, `Â`, `�` e sequências quebradas similares;
- conferir labels, placeholders, mensagens de erro e prompts;
- não mascarar erro de encoding com CSS ou replace global permanente quando a fonte pode ser corrigida.

A interface é `pt-BR`.

Valores monetários devem usar formatação brasileira e BRL.

---

## 5. Regras de domínio financeiro

Estas regras são críticas.

### Dinheiro

Nunca usar `float` como representação principal de dinheiro.

Internamente:

```ts
amountInCents: number
```

ou equivalente em centavos inteiros.

Converter para formato humano apenas na borda da UI.

### Transferências

Transferência entre contas do próprio usuário:

- não é receita;
- não é despesa;
- não deve inflar fluxo de caixa.

### Recorrências

Recorrência futura é previsão/compromisso, não gasto realizado.

Pagamento de recorrência deve evitar dupla contagem.

Quando houver vínculo entre recorrência e transação real, respeitar identificadores de ocorrência e deduplicação.

### Datas

- Persistir datas em formato previsível, preferencialmente `YYYY-MM-DD` para datas financeiras sem horário.
- Não introduzir timezone UTC em datas mensais simples de forma que mude o dia no Brasil.
- `dia 31` em recorrência deve cair no último dia válido do mês quando necessário.

### Exclusão

Para dados financeiros importantes:

- preferir soft delete/undo quando já suportado;
- nunca usar operação destrutiva como falso “undo”;
- exclusão deve respeitar política de confirmação.

---

## 6. Arquitetura e separação de responsabilidades

Fluxo desejado:

```text
UI
↓
Controller / handler
↓
Service / domain
↓
Store / repository
↓
Persistência
```

Para IA:

```text
Chat UI
↓
Chat Controller
↓
Agent Service
↓
Tool Executor
↓
Domain Service
↓
Store / Repository
```

### Não fazer

```text
Componente React
↓
regra financeira complexa
↓
IndexedDB direto
```

ou:

```text
LLM
↓
write direto no banco
```

Tools devem chamar serviços/regras já existentes sempre que possível.

---

## 7. Política visual obrigatória

Ler e obedecer `REGRAS_VISUAIS.md` antes de criar ou alterar qualquer componente visual.

Resumo das regras que bloqueiam review:

- `MoneyInput` para valores monetários;
- `SelectMenu` no lugar de `<select>` nativo;
- `DatePicker` no lugar de `<input type="date">`;
- `ColorPicker` no lugar de `<input type="color">`;
- `Field` como wrapper padrão de formulário;
- `Modal`/overlays do design system no lugar de `alert()` e `confirm()`;
- Lucide para ícones;
- não usar emoji como elemento principal de UI;
- reutilizar tokens existentes;
- não inventar cores/radius/shadows locais sem necessidade.

### Mobile-first

O APK é produto de primeira classe, não uma adaptação secundária.

Toda mudança visual deve ser pensada primeiro em largura móvel.

Testar mentalmente e/ou visualmente pelo menos:

- 360 px;
- 390 px;
- 412 px;
- 640 px;
- desktop.

### Safe area

Elementos fixos/sticky no Android devem considerar:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
```

Não deixar composer, modal, FAB ou action sheet escondido atrás da navegação inferior.

### Densidade

Em mobile:

- evitar grandes áreas vazias;
- evitar controles empilhados quando cabem lado a lado com legibilidade;
- valores principais não podem esmagar descrição;
- menus não devem cobrir conteúdo sem necessidade;
- toque mínimo confortável: aproximadamente 40–44 px para ações importantes.

---

## 8. Política de implementação

### Incremental por padrão

Ao implementar feature ou correção:

1. preservar contratos existentes;
2. reaproveitar componentes e services;
3. adicionar tipos/testes;
4. migrar somente o necessário;
5. remover código antigo somente quando o novo fluxo estiver validado.

### Sem “placeholder perigoso”

Não deixar em produção código como:

```ts
// temporary
// not correct but placeholder
// TODO: fix later
```

quando isso afeta dados, exclusão, IA, pagamento, segurança ou persistência.

TODO aceitável deve ser não crítico e claramente isolado.

### Feature flag

Usar flag quando uma mudança experimental puder comprometer fluxo existente.

Não usar flag para esconder bug conhecido indefinidamente.

---

## 9. IA, OpenRouter e controle de custo

A IA deve agregar interpretação e raciocínio; código determinístico deve resolver o resto.

### Chave de API

`OPENROUTER_API_KEY` é segredo de servidor.

Nunca:

```text
VITE_OPENROUTER_API_KEY
```

Nunca expor chave no bundle, localStorage ou logs do browser.

Seguir `.env.example`.

### Regra de chamadas

Evitar chamadas desnecessárias.

Meta:

- botão conhecido: `0` chamadas;
- confirmação de ação já preparada: `0` chamadas;
- write simples interpretado por linguagem natural: normalmente `1` chamada;
- read simples: normalmente `1` chamada;
- análise: `1–2` chamadas;
- planejamento complexo: poucas chamadas justificadas.

O limite do agent loop é proteção, não objetivo.

### Tools

- enviar somente tools relevantes quando a arquitetura permitir;
- não expor tool destrutiva sem necessidade;
- validar argumentos com Zod;
- tool failure nunca pode virar mensagem falsa de sucesso;
- resultados grandes devem ser compactados antes de voltar ao modelo quando possível;
- UI recebe dados completos quando necessário; modelo recebe somente o necessário.

### Structured output

Modelo não retorna HTML/JSX/CSS executável.

Fluxo correto:

```text
LLM JSON estruturado
↓
Zod
↓
Renderer React conhecido
```

Nunca usar `dangerouslySetInnerHTML` com saída de IA.

### Prompt injection

Descrições, nomes de transação, notas e dados persistidos são **dados não confiáveis**.

Nunca tratá-los como instruções de sistema.

---

## 10. Voz e Capacitor

No Android, recursos de dispositivo devem preferir implementação nativa/Capacitor quando WebView não oferece suporte confiável.

### Reconhecimento de voz

Fluxo esperado:

```text
Android
→ plugin nativo Capacitor

Web compatível
→ Web Speech fallback

Sem suporte
→ teclado/texto
```

### Permissões

- pedir permissão apenas no momento de uso;
- explicar falha de forma amigável;
- nunca entrar em loop de solicitação;
- microfone negado não pode quebrar o chat.

### Recursos

Ao parar voz/TTS:

- encerrar listener;
- liberar stream/tracks;
- remover callbacks;
- limpar timers.

Não armazenar áudio permanentemente por padrão.

---

## 11. Segurança

### Segredos

Nunca commitar:

- API keys reais;
- tokens;
- credenciais;
- dumps pessoais;
- `.env` real.

Manter exemplos em `.env.example` apenas com placeholders.

### Entrada não confiável

Validar:

- arquivos CSV/OFX;
- respostas de IA;
- payloads de API;
- IDs vindos da UI;
- dados antigos carregados do storage quando houver migração.

### Operações destrutivas

Delete, reset, limpar histórico importante ou aplicar plano relevante deve ter fluxo explícito de confirmação quando definido pela política do produto.

Confirmação visual não deve chamar novamente a IA se a ação já estiver determinada.

---

## 12. Debugging — método obrigatório

Não corrigir por tentativa e erro aleatória.

Seguir:

```text
1. Reproduzir
2. Isolar
3. Encontrar causa raiz
4. Corrigir o menor ponto possível
5. Criar/verificar regressão
6. Rodar validações
```

### Ao receber screenshot de bug

Investigar:

- componente real;
- CSS aplicado;
- comportamento específico mobile/WebView;
- dado que alimenta a UI;
- diferença entre browser e APK.

Não assumir que o screenshot prova a causa.

### Logs

Logs de desenvolvimento devem ser úteis e curtos.

Preferir prefixos:

```text
[AI]
[VOICE]
[IMPORT]
[STORE]
[ANDROID]
[FORECAST]
```

Não registrar:

- chave de API;
- payload financeiro completo sem necessidade;
- dados pessoais;
- áudio;
- histórico inteiro da conversa em produção.

### Erros

Não usar `catch {}` silencioso em código crítico.

Se o erro puder ser ignorado com segurança, documentar por quê.

Se afeta persistência/operação financeira, propagar resultado de falha para a UI.

Nunca mostrar sucesso antes da persistência confirmar sucesso.

---

## 13. Testes

Qualquer mudança deve preservar testes existentes.

Antes de considerar concluído:

```bash
npm run lint
npm test
npm run build
```

Neste projeto `npm run lint` executa o typecheck TypeScript; não tratar isso como ESLint tradicional sem verificar `package.json`.

### Quando adicionar teste

Adicionar/atualizar teste para:

- regra financeira;
- bug com risco de regressão;
- parser/importação;
- recorrência;
- cálculo de dinheiro livre;
- safe daily spend;
- confirmação/undo;
- AI tool policy;
- roteamento complexo;
- estado de voz quando testável sem runtime nativo.

### Bugfix

Quando viável, reproduzir o bug em teste antes ou junto da correção.

---

## 14. Validação Android

Mudanças puramente web ainda devem considerar o APK.

Se alterar qualquer um destes itens, validar Android:

- Capacitor config;
- plugin nativo;
- voz;
- permissões;
- safe-area;
- file picker;
- keyboard behavior;
- status/navigation bars;
- código que depende de browser API;
- build scripts Android.

Pipeline esperado:

```text
npm ci
npm run lint
npm test
npm run build
npx cap sync android
./gradlew assembleDebug
```

O workflow `.github/workflows/android-apk.yml` é a referência para a build Android atual.

Não afirmar “APK estável” sem a build Android realmente passar.

---

## 15. DevOps e CI/CD

### CI obrigatório

O workflow `Stable Build` deve continuar validando:

```text
npm ci
npm run lint
npm test
npm run build
```

Não remover etapa para fazer pipeline “passar”.

Corrigir a causa.

### Determinismo

CI deve usar:

```bash
npm ci
```

não `npm install` para dependências versionadas do projeto, salvo etapas específicas de tooling temporário já justificadas.

`package-lock.json` deve acompanhar mudanças de dependência.

### Dependências

Ao adicionar dependência:

1. justificar necessidade;
2. verificar compatibilidade com React/Vite/Capacitor atuais;
3. atualizar lockfile;
4. validar build web;
5. validar APK se houver integração nativa.

### Artefatos

- `dist` é artefato de build, não fonte de verdade.
- APK gerado deve vir de pipeline reproduzível.
- Não editar artefato compilado manualmente.

### Falha de CI

Se pipeline falhar:

1. abrir job/step que falhou;
2. ler log real;
3. reproduzir localmente quando possível;
4. corrigir causa;
5. não adicionar `|| true`, `continue-on-error` ou skip sem justificativa formal.

### Timeout

Timeout deve existir para jobs externos/Android para evitar runner preso.

---

## 16. Git e commits

Preferir commits pequenos e coerentes.

Formato recomendado:

```text
fix(scope): descrição
feat(scope): descrição
refactor(scope): descrição
test(scope): descrição
docs(scope): descrição
ci(scope): descrição
```

Exemplos:

```text
fix(voice): use native recognition on Android
fix(import): compact mobile preview rows
ci(android): validate speech recognition plugin
```

### Não fazer

- commit “update” com dezenas de assuntos;
- misturar feature, refactor e formatação geral;
- commitar segredo;
- alterar lockfile sem motivo;
- formatar o projeto inteiro durante bugfix.

---

## 17. Performance

Não otimizar no escuro, mas evitar desperdícios óbvios.

### UI

- não re-renderizar histórico inteiro do chat por alteração local se evitável;
- listas grandes devem evitar cálculos caros por linha;
- gráficos devem receber dados já derivados;
- limpar listeners e timers.

### IA

- minimizar contexto;
- minimizar tool schemas;
- evitar segunda chamada para texto trivial;
- não reenviar histórico técnico desnecessário.

### Storage

- não escrever no IndexedDB em loop por render;
- agrupar operações relacionadas quando arquitetura suportar;
- migração deve ser versionada e segura.

---

## 18. Acessibilidade

Toda funcionalidade deve funcionar sem voz.

Regras mínimas:

- `aria-label` em botões só com ícone;
- `aria-expanded` em menus;
- `role` correto quando custom control exige;
- foco visível;
- Escape fecha overlays quando apropriado;
- navegação por teclado para selects e dialogs;
- contraste suficiente;
- não usar apenas cor para comunicar erro/status.

---

## 19. Política de revisão de UI em mobile

Antes de concluir alteração visual, conferir:

- texto não truncou informação crítica;
- valor não empurra ação para fora;
- dropdown/action sheet não cobre conteúdo importante;
- bottom nav não cobre botão/composer;
- teclado Android não deixa campo inacessível;
- modal cabe em viewport pequena;
- scroll continua funcionando;
- safe-area foi respeitado;
- componentes nativos indesejados não aparecem.

### Controles nativos permitidos

Somente quando comportamento do sistema é desejável, por exemplo:

- teclado Android;
- file picker para upload;
- permissões do sistema;
- compartilhamento nativo quando explicitamente implementado.

Não usar calendário, select ou color picker nativos quando o projeto já possui versão visual própria.

---

## 20. Política de compatibilidade

Antes de usar API web:

```ts
if ('feature' in window) {
  // usar
}
```

ou fornecer adapter/fallback.

Browser funcionando não significa WebView funcionando.

Para recursos críticos no APK, verificar suporte Capacitor/Android.

---

## 21. Migrações e persistência

Mudança em estrutura persistida deve considerar usuários que já possuem dados.

Nunca assumir storage vazio.

Ao alterar schema:

1. identificar versão anterior;
2. criar migração determinística;
3. preservar campos desconhecidos quando apropriado;
4. validar dados antigos;
5. evitar perda silenciosa.

Não “resolver” incompatibilidade apagando IndexedDB automaticamente.

---

## 22. Definição de pronto — Definition of Done

Uma tarefa só está pronta quando todos os itens aplicáveis forem verdadeiros:

- [ ] causa raiz entendida;
- [ ] implementação incremental;
- [ ] sem duplicação de componente/service;
- [ ] TypeScript passa;
- [ ] testes passam;
- [ ] build Vite passa;
- [ ] Android validado se afetado;
- [ ] dados financeiros continuam íntegros;
- [ ] nenhum segredo exposto;
- [ ] UI mobile revisada;
- [ ] `REGRAS_VISUAIS.md` respeitado;
- [ ] sem mojibake/encoding quebrado;
- [ ] mensagens de erro são úteis;
- [ ] sem sucesso falso;
- [ ] sem chamadas desnecessárias à IA;
- [ ] listeners/timers/resources têm cleanup;
- [ ] commit descreve uma mudança coerente.

---

## 23. Checklist rápido para agentes

Antes:

```text
[ ] Li AGENTS.md
[ ] Li REGRAS_VISUAIS.md se houver UI
[ ] Li os arquivos envolvidos
[ ] Entendi o fluxo atual
[ ] Identifiquei a menor mudança
```

Durante:

```text
[ ] Reuso componentes/services
[ ] Não introduzo any sem necessidade
[ ] Não duplico regra financeira
[ ] Não exponho segredo
[ ] Não uso controles nativos proibidos
[ ] Não adiciono chamada de IA desnecessária
```

Depois:

```text
[ ] npm run lint
[ ] npm test
[ ] npm run build
[ ] Android se aplicável
[ ] conferir mobile
[ ] conferir encoding pt-BR
[ ] relatar exatamente o que foi validado
```

---

## 24. Regra final

O padrão de engenharia deste projeto é:

```text
CORRETO > RÁPIDO
SIMPLES > ESPERTO
REUTILIZÁVEL > DUPLICADO
DETERMINÍSTICO > IA DESNECESSÁRIA
MOBILE-FIRST > ADAPTAÇÃO DEPOIS
DADO ÍNTEGRO > CONVENIÊNCIA
BUILD VALIDADA > “DEVE FUNCIONAR”
```

Nunca declarar uma correção, build ou APK como estável sem validação correspondente.
