# Assinatura de código do Agente (Authenticode)

Hoje o instalador do agente (`FunevDeskAgenteSetup.exe`) **não é assinado digitalmente**. Por isso o
Windows mostra **"Publicador desconhecido"** no SmartScreen e no UAC ao instalar. Assinar o
executável remove esse aviso, aumenta a confiança em ambientes corporativos e é pré-requisito
para vender o produto para empresas maiores.

O build **já está preparado** para assinar (carimbo de tempo RFC-3161 e SHA-256 configurados em
`agent-desktop/package.json`). Falta apenas fornecer o **certificado**.

## 1. Adquirir um certificado de assinatura de código

Compre um **Code Signing Certificate** de uma Autoridade Certificadora (CA) confiável:

| Tipo | SmartScreen | Custo aprox./ano | Observação |
|---|---|---|---|
| **OV** (Organization Validation) | Reputação é construída com o tempo | US$ 200–400 | Mais barato; o aviso some depois de algumas centenas de instalações. |
| **EV** (Extended Validation) | **Confiança imediata** (sem aviso) | US$ 300–700 | Recomendado. Vem em token USB/HSM. |

CAs comuns: DigiCert, Sectigo, GlobalSign, SSL.com. A validação da empresa leva de 1 a 5 dias.

## 2. Disponibilizar o certificado para o build

### Certificado em arquivo `.pfx` (OV)
```powershell
$env:CSC_LINK = "C:\caminho\para\certificado.pfx"
$env:CSC_KEY_PASSWORD = "senha-do-pfx"
npm run build   # dentro de agent-desktop/
```
O electron-builder detecta `CSC_LINK`/`CSC_KEY_PASSWORD` e assina EXE + MSI automaticamente,
já com carimbo de tempo (o app continua válido mesmo após o certificado expirar).

### Certificado EV em token USB/HSM
O EV não exporta a chave privada — a assinatura usa o token. Configure o `signtool` para usar o
provedor do token e aponte o electron-builder para um script de assinatura custom
(`win.sign`), ou assine os artefatos manualmente após o `build:dir` com:
```powershell
signtool sign /sha1 <thumbprint-do-cert> /fd sha256 /tr http://timestamp.digicert.com /td sha256 "FunevDeskAgenteSetup.exe"
```

## 3. Conferir a assinatura
```powershell
signtool verify /pa /v "dist\FunevDeskAgenteSetup-1.2.3.exe"
```
Ou: botão direito no `.exe` → Propriedades → aba **Assinaturas digitais**.

## 4. Auto-update assinado
Com o instalador assinado, o `electron-updater` passa a validar a assinatura das atualizações.
Mantenha o **mesmo certificado** (mesmo `publisherName`) entre versões para que o update não seja
rejeitado. Se trocar de certificado, publique uma versão de transição.

---

**Resumo:** o código está pronto. Assim que você tiver o `.pfx` (ou o token EV), basta exportar
as duas variáveis de ambiente e rodar `npm run build` — o instalador sai assinado, sem o aviso de
publicador desconhecido.
