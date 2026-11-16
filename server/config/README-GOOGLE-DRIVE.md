# Configuração da Google Drive API (REPFIX FlowTrack)

Para ativar a criação automática de subpastas `{ID}_{Cliente}` e o envio automático de anexos para a pasta partilhada da REPFIX (`1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC`):

1. Aceda à **Google Cloud Console**: https://console.cloud.google.com/
2. Crie um projeto (ex: `REPFIX-FlowTrack`) e ative a **Google Drive API** em *APIs & Services > Library*.
3. Vá a *IAM & Admin > Service Accounts* e clique em **Create Service Account** (ex: `flowtrack-drive`).
4. Clique na Service Account criada, vá ao separador **Keys** -> **Add Key** -> **Create new key** -> selecione **JSON**.
5. Guarde o ficheiro JSON descarregado exatamente nesta pasta com o nome:
   `google-credentials.json`
6. Copie o email da Service Account (`client_email` que está dentro do ficheiro JSON, ex: `flowtrack-drive@...iam.gserviceaccount.com`) e **partilhe** a pasta da Google Drive (`https://drive.google.com/drive/folders/1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC`) com esse email com permissão de **Editor**.

