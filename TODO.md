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

---

## ⏳ Passos Finais para Amanhã (Publicação Online 24/7 — 0€ e Sem Cartão)

1. **Passo 1 — GitHub Desktop:**
   - [ ] Fazer **Commit to main** e **Push origin** para enviar o código atualizado para o GitHub.
2. **Passo 2 — Render.com (Plano *Free Web Service* — Sem Cartão):**
   - [ ] Entrar em [https://render.com](https://render.com) com a conta do GitHub, escolher **New -> Web Service**, selecionar o repositório `FlowTrack` e o plano **Free (0€)**.
   - [ ] Colar as variáveis de ambiente (`SMTP_*` e `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`).
3. **Passo 3 — UptimeRobot.com (Plano *Free* — Sem Cartão):**
   - [ ] Criar um monitor HTTP(s) gratuito de 5 em 5 minutos para `https://<teu-link>.onrender.com/api/health` para manter a aplicação acordada **24/7**.
