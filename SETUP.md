# LinkedIn Ads Connector — Guia de Configuração

> ⚠️ **Status: scaffold não testado.** O código segue a documentação oficial da
> LinkedIn Marketing API, mas só pode ser validado após o acesso ao **Marketing
> Developer Platform** ser aprovado. Pontos marcados com `TODO` no `Code.gs`
> precisam de validação com dados reais.

## Parte 1 — Criar o App e solicitar acesso (GARGALO — comece por aqui)

1. Acesse https://developer.linkedin.com/ → **Create app**
2. Vincule uma **Company Page** da agência, preencha nome/logo
3. Na aba **Products**, solicite o **Advertising API** (Marketing Developer Platform)
   - Preencha o formulário de caso de uso (relatórios de anúncios em Looker Studio)
   - ⏳ A LinkedIn revisa e aprova em **semanas** — sem isso, nada funciona
4. Na aba **Auth**, anote o **Client ID** e o **Client Secret**
5. Em **Authorized redirect URLs**, adicione a URL de callback do Apps Script:
   ```
   https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
   ```
   (o `{SCRIPT_ID}` sai de Configurações do projeto no Apps Script)

### Permissões (scopes) necessárias
- `r_ads_reporting` — relatórios (adAnalytics)
- `r_ads` — listar contas/campanhas/criativos

## Parte 2 — Configurar o Apps Script

1. Suba `Code.gs` + `appsscript.json` (via clasp: `clasp push -f`)
2. A biblioteca **apps-script-oauth2** já está declarada no manifesto
3. Em **Configurações do projeto → Propriedades do script**, adicione:
   - `OAUTH_CLIENT_ID` = Client ID do app LinkedIn
   - `OAUTH_CLIENT_SECRET` = Client Secret do app LinkedIn

## Parte 3 — Deploy e teste no Looker Studio

1. Apps Script → **Implantar → Testar implantações** → copie o **Head Deployment ID**
2. Abra:
   ```
   https://lookerstudio.google.com/datasources/create?connectorId=SEU_ID
   ```
3. **Autorizar** → o fluxo OAuth do LinkedIn abre → faça login e conceda acesso
4. Selecione a **Conta de Anúncios** → escolha as dimensões/métricas → **Conectar**

## Diferenças em relação ao Meta

| Meta | LinkedIn |
|------|----------|
| System User Token (não expira) | OAuth 2.0 (access 60d, refresh 365d) |
| Campanha → Conjunto → Anúncio | Grupo de Campanha → Campanha → Criativo |
| `/insights` + breakdowns | `/rest/adAnalytics` + pivots |
| Facebook/Instagram/Audience | Plataforma única (sem breakdown) |
| Acesso imediato | Aprovação do Marketing API (semanas) |

## Métricas disponíveis

Impressões, Cliques, Cliques no Link, Investimento, Conversões, Leads, Reações,
Comentários, Compartilhamentos, Views de Vídeo, e as razões CPM, CPC, CTR,
Custo por Conversão, Custo por Lead, Taxa de Conversão.

> Nota: o `approximateMemberReach` (alcance) não é retornado pela API na versão
> atual, então não há dimensão/métrica de alcance neste conector.
