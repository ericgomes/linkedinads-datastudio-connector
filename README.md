# LinkedIn Ads Connector para Looker Studio

Conector **Community** do Looker Studio (Google Apps Script) que puxa dados do
**LinkedIn Ads** (Marketing API / `rest/adAnalytics`) para seus dashboards.

> ⚠️ **Scaffold em desenvolvimento** — construído a partir da documentação
> oficial, ainda **não testado** com dados reais (depende de aprovação do
> LinkedIn Marketing Developer Platform).

## Recursos

- 🔐 Autenticação **OAuth 2.0** (com refresh automático de token)
- 🏢 Seleção de conta de anúncios
- 📊 Níveis: **Conta → Grupo de Campanha → Campanha → Criativo** (via pivots)
- 📅 Dimensões de data: dia e Ano-Mês
- 📈 Métricas de performance + razões (CPM, CPC, CTR, CPL, custo/conversão) como campos com fórmula

## Arquitetura (espelha o conector Meta Ads da agência)

| Arquivo | Descrição |
|---------|-----------|
| `Code.gs` | Conector: OAuth2, config, schema, getData nível-consciente |
| `appsscript.json` | Manifesto (biblioteca OAuth2 + dataStudio) |
| `SETUP.md` | Guia de configuração completo |

## Configuração

Veja **[SETUP.md](./SETUP.md)** — do app no LinkedIn Developer Portal ao deploy
no Looker Studio.

---

Desenvolvido por [Agência Linka](https://agencialinka.com.br).
