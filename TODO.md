# 📋 REPFIX FlowTrack — Lista de Tarefas (To-Do List)

> Registo completo do estado atual do **REPFIX FlowTrack** e dos pontos concluídos.

---

## ✅ Concluído e Guardado

- [x] **Tour Interativo (`react-joyride`)**
  - [x] 17 passos dinâmicos adaptados ao perfil (`key_user`, `admin`, `both`, `technician`) em `client/src/contexts/TourContext.jsx`
  - [x] Navegação automática entre abas (`/processos` e `/calendario`) e *fail-safe* de elementos DOM
  - [x] Arranque automático no 1.º login por utilizador (`localStorage`) + botão `(i)` no cabeçalho (`client/src/components/Header.jsx`)
- [x] **Regras de Perfil de Técnico (`technician`) e Workflow**
  - [x] Visibilidade restrita apenas aos processos atribuídos ao próprio técnico (`server/routes/processes.js`)
  - [x] Modo de leitura bloqueado para técnicos nas fases `ELABORAÇÃO`, `ANÁLISE`, `SUPERVISÃO` e `FECHADO` (`client/src/components/ProcessDetailModal.jsx`)
- [x] **Notificações e Emails Reais via SMTP (`geral@repfix.pt`)**
  - [x] MFA e Senha de Aplicação configurados na conta `geral@repfix.pt` (`server/.env` e `server/services/emailService.js`)
  - [x] Envio de email/notificação nas fases `ELABORAÇÃO` e `SUPERVISÃO` **exclusivamente para o Gestor atribuído ao processo** (`manager_id`)
  - [x] Envio de email automático ao Técnico quando lhe é atribuído um processo
- [x] **Integração Completa Google Drive (`geral@repfix.pt`)**
  - [x] Autenticação OAuth 2.0 configurada (`server/config/google-oauth.json`)
  - [x] Criação automática da subpasta `{ID}_{Cliente}` dentro de `REPFIX FlowTrack` (`1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC`) e renomeação automática caso o nome do cliente mude
  - [x] Upload automático de anexos dos comentários diretamente para a subpasta do processo na Google Drive (`server/routes/history.js`)
  - [x] Movimentação automática da subpasta `{ID}_{Cliente}` para a pasta **`Concluidos`** (`1zm67Q9L_V9SN6qHfK_3_lPJO4w6A9JzG`) quando o processo é fechado (`FECHADO`)
- [x] **Integração Completa Google Calendar + Calendário FlowTrack**
  - [x] Criação e atualização automática de eventos no **Google Calendar** (`geral@repfix.pt`) e no calendário interno sempre que se cria ou altera morada, data, hora, cliente ou técnico no FlowTrack
  - [x] Eventos no Google Calendar configurados com a **cor Manjericão** (`colorId: '10'`), **sem lembretes/notificações** (`reminders.overrides: []`) e incluindo **Nome do Processo**, **Técnico**, **Contacto do Técnico (Telemóvel + Email)** e **Localidade/Morada**
  - [x] Campo **Contacto / Telemóvel (`phone`)** adicionado à Gestão de Utilizadores (`client/src/pages/UsersPage.jsx` e `server/routes/users.js`) com sincronização automática para o Google Calendar
  - [x] Remoção automática do evento do calendário quando o processo é fechado (`FECHADO`)
- [x] **Arranque Rápido e Estrutura de Deploy**
  - [x] Script `iniciar-flowtrack.bat` na raiz do projeto e ficheiro `render.yaml`
- [x] **Limpeza para Produção**
  - [x] Todos os processos de teste, eventos do Google Calendar e pastas de teste da Google Drive eliminados; contadores reiniciados e 4 utilizadores mantidos.
- [x] **Persistência Automática 100% na Google Drive (Sem Cartão / Custo 0€)**
  - [x] Sincronização automática da base de dados (`_FlowTrack_Cloud_Database.json`) na Google Drive (`geral@repfix.pt`) após cada alteração (`backupDatabaseToDrive` / `scheduleDatabaseBackup` em `server/services/googleDriveService.js` e `server/server.js`)
  - [x] Restauro automático da base de dados a partir da Google Drive sempre que o servidor na cloud reinicia (`restoreDatabaseFromDriveIfNeeded`)
  - [x] Download automático de anexos em falta a partir da Google Drive (`downloadDriveFileToLocal` em `/uploads/attachments/:filename`)
  - [x] Suporte a variáveis de ambiente OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) para o Render

- [x] **Publicação Online 24/7 na Cloud (`Render.com` — Custo 0€ e Sem Cartão)**
  - [x] Código publicado no GitHub (`https://github.com/mbperalta92/FlowTrack.git`)
  - [x] Aplicação online em produção no endereço oficial: **[https://flowtrack-tgpx.onrender.com](https://flowtrack-tgpx.onrender.com)**
  - [x] Blindagem de segurança e privacidade ativa (bloqueio de motores de busca `noindex/nofollow`, `robots.txt`, autenticação JWT obrigatória, e dados guardados na conta privada `geral@repfix.pt`)
- [x] **Rastreabilidade de N.º Processo Cliente / Ref.ª e Anexos na Abertura**
  - [x] Campo dedicado `N.º Processo Cliente / Ref.ª` na criação e edição do processo, visível na tabela, cartões Kanban, topo do processo, e-mails automáticos e Google Calendar / Calendário FlowTrack
  - [x] Possibilidade de anexar ficheiros logo na criação de um Novo Processo (com envio automático para a subpasta da Google Drive)
- [x] **Sistema de Tickets de Suporte & Melhoria (`🎫 Gerar Ticket`)**
  - [x] Botão `🎫 Gerar Ticket` no menu de perfil do utilizador (`Header.jsx` / `Header.css`)
  - [x] Seleção de Tipo (`🐛 Bug / Erro` ou `💡 Oportunidade de Melhoria`), 9 Categorias, Nível de Impacto (`Baixo`, `Médio`, `Alto`), Descrição e Anexos/Prints
  - [x] Envio direto para `geral@repfix.pt` com `mbperalta92@gmail.com` em CC e ficheiros anexados diretamente no e-mail (`server/routes/tickets.js`)

---

## 💡 Lista de Oportunidades de Melhoria (Pós-Feedback dos Utilizadores)

### ⚡ Categoria: Velocidade e Disponibilidade do FlowTrack
#### 1. Eliminação do Tempo de Arranque (*Cold Start*) via UptimeRobot (Gratuito)
- **O que é:**
  Um serviço externo gratuito de monitorização ([UptimeRobot.com](https://uptimerobot.com)) que visita automaticamente a aplicação de 5 em 5 minutos.
- **O que faz:**
  No plano gratuito do Render (`$0/mês`), se ninguém aceder ao FlowTrack durante 15 minutos seguidos (ex.: durante a noite ou horas sem atividade), o servidor entra em modo de poupança (*sleep*). Quando o primeiro utilizador abre o site após essa pausa, demora cerca de **30 a 50 segundos** a acordar (nas navegações seguintes é imediato). O UptimeRobot faz um toque automático a `/api/health` a cada 5 minutos para impedir que o servidor adormeça, garantindo que a página abre sempre em **1 segundo**.
- **Como podemos fazer (em 2 minutos, quando quiseres ativar):**
  1. Criar conta gratuita em [https://uptimerobot.com](https://uptimerobot.com) (com `geral@repfix.pt`, sem cartão).
  2. Clicar em **`+ Add New Monitor`**.
  3. Escolher **Monitor Type:** `HTTP(s)`, **Friendly Name:** `REPFIX FlowTrack`, **URL:** `https://flowtrack-tgpx.onrender.com/api/health` e **Interval:** `5 minutes`.
  4. Clicar em **`Create Monitor`**.
- **Prós (Vantagens):**
  - ✅ **100% Gratuito** e não exige cartão multibanco.
  - ✅ **Abertura instantânea (1 segundo)** a qualquer hora do dia ou da noite para todos os utilizadores.
  - ✅ Envia um alerta por e-mail para `geral@repfix.pt` caso algum dia o servidor do Render esteja em manutenção.
- **Contras (Desvantagens):**
  - ⚠️ Como mantém o servidor ligado 24h/dia sem pausas, consome cerca de ~720h das **750 horas mensais gratuitas** do Render (se criares um 2.º site gratuito na mesma conta do Render no futuro, teriam de partilhar essas 750 horas).
  - ⚠️ Depende de criar e manter uma conta num serviço externo adicional (UptimeRobot).
