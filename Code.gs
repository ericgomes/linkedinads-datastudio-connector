// =============================================================================
// Conector LinkedIn Ads -> Looker Studio (Google Apps Script)
//
// SCAFFOLD construído a partir da documentação oficial da LinkedIn Marketing API
// (rest/adAnalytics). AINDA NÃO TESTADO — depende de acesso aprovado ao
// Marketing Developer Platform. Pontos a validar com dados reais estão marcados
// com "TODO". Arquitetura espelha o conector Meta Ads da agência.
// =============================================================================

var CC = DataStudioApp.createCommunityConnector();
var LI_API     = 'https://api.linkedin.com';
var LI_VERSION = '202606'; // header LinkedIn-Version (YYYYMM). Atualizar ao migrar de versão.

// ---------------------------------------------------------------------------
// Auth — OAuth 2.0 (biblioteca apps-script-oauth2)
// ---------------------------------------------------------------------------
// O LinkedIn não tem "token que não expira": access token dura 60 dias e a
// biblioteca renova via refresh token (365 dias, só para apps aprovados).
// CLIENT_ID/SECRET ficam em Script Properties (definidos uma vez pelo dev).

function getAuthType() {
  return CC.newAuthTypeResponse().setAuthType(CC.AuthType.OAUTH2).build();
}

function getOAuthService() {
  var sp = PropertiesService.getScriptProperties();
  return OAuth2.createService('linkedin')
    .setAuthorizationBaseUrl('https://www.linkedin.com/oauth/v2/authorization')
    .setTokenUrl('https://www.linkedin.com/oauth/v2/accessToken')
    .setClientId(sp.getProperty('OAUTH_CLIENT_ID'))
    .setClientSecret(sp.getProperty('OAUTH_CLIENT_SECRET'))
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    // r_ads_reporting: analytics; r_ads: listar contas/campanhas/criativos.
    .setScope('r_ads_reporting r_ads');
}

function get3PAuthorizationUrls() {
  return getOAuthService().getAuthorizationUrl();
}

function authCallback(request) {
  var ok = getOAuthService().handleCallback(request);
  return HtmlService.createHtmlOutput(ok
    ? 'Autorizado com sucesso. Pode fechar esta aba.'
    : 'Falha na autorização. Tente novamente.');
}

function isAuthValid() {
  return getOAuthService().hasAccess();
}

function resetAuth() {
  getOAuthService().reset();
}

function isAdminUser() {
  return true; // habilita debugText para o dono
}

// ---------------------------------------------------------------------------
// Config — seleção da conta de anúncios
// ---------------------------------------------------------------------------

function getConfig(request) {
  try {
    return buildConfig(request);
  } catch (e) {
    CC.newUserError()
      .setDebugText('getConfig: ' + (e.stack || e.message || e))
      .setText('Erro ao carregar configuração: ' + (e.message || e))
      .throwException();
  }
}

function buildConfig(request) {
  var config = CC.getConfig();
  var accounts = fetchAdAccounts();

  var sel = config.newSelectSingle().setId('account_id').setName('Conta de Anúncios');
  if (!accounts.length) {
    sel.addOption(config.newOptionBuilder()
      .setLabel('Nenhuma conta encontrada — verifique o acesso do usuário').setValue(''));
  }
  accounts.forEach(function (a) {
    sel.addOption(config.newOptionBuilder()
      .setLabel(a.name + ' (' + a.id + ')').setValue(String(a.id)));
  });

  config.setDateRangeRequired(true);
  return config.build();
}

// GET /rest/adAccounts?q=search  (requer r_ads)
function fetchAdAccounts() {
  var data = liGet(LI_API + '/rest/adAccounts?q=search');
  return (data.elements || []).map(function (a) {
    return { id: a.id, name: a.name || ('Conta ' + a.id) };
  });
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function getSchema(request) {
  var f = CC.getFields();
  var T = CC.FieldType;
  var A = CC.AggregationType;

  // Dimensions — hierarquia LinkedIn: Conta > Grupo de Campanha > Campanha > Criativo
  f.newDimension().setId('date').setName('Data (Dia)').setType(T.YEAR_MONTH_DAY);
  f.newDimension().setId('year_month').setName('Data (Ano Mês)').setType(T.YEAR_MONTH);
  f.newDimension().setId('account_id').setName('ID Conta').setType(T.TEXT);
  f.newDimension().setId('account_name').setName('Conta').setType(T.TEXT);
  // A nomenclatura da API do LinkedIn é deslocada 1 nível em relação ao Campaign
  // Manager (e ao Meta). Mapeamos para a nomenclatura do painel/Meta:
  //   API sponsoredCampaignGroup -> "Campanha"             (pivot CAMPAIGN_GROUP)
  //   API sponsoredCampaign      -> "Conjunto de Anúncios" (pivot CAMPAIGN)
  //   API sponsoredCreative      -> "Anúncio"              (pivot CREATIVE)
  f.newDimension().setId('campaign_id').setName('ID Campanha').setType(T.TEXT);
  f.newDimension().setId('campaign_name').setName('Campanha').setType(T.TEXT);
  f.newDimension().setId('adset_id').setName('ID Conjunto').setType(T.TEXT);
  f.newDimension().setId('adset_name').setName('Conjunto de Anúncios').setType(T.TEXT);
  f.newDimension().setId('ad_id').setName('ID Anúncio').setType(T.TEXT);
  f.newDimension().setId('ad_name').setName('Anúncio').setType(T.TEXT);

  // Metrics base (aditivas)
  f.newMetric().setId('impressions').setName('Impressões').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('clicks').setName('Cliques').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('landing_page_clicks').setName('Cliques no Link').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('spend').setName('Investimento').setType(T.CURRENCY_BRL).setAggregation(A.SUM); // TODO: moeda dinâmica
  f.newMetric().setId('conversions').setName('Conversões').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('leads').setName('Leads').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('reactions').setName('Reações').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('comments').setName('Comentários').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('shares').setName('Compartilhamentos').setType(T.NUMBER).setAggregation(A.SUM);
  f.newMetric().setId('video_views').setName('Views de Vídeo').setType(T.NUMBER).setAggregation(A.SUM);

  // Métricas de razão como fórmula (agregam corretamente em qualquer nível)
  f.newMetric().setId('cpm').setName('CPM').setType(T.CURRENCY_BRL)
    .setFormula('SUM($spend) / SUM($impressions) * 1000').setAggregation(A.AUTO);
  f.newMetric().setId('cpc').setName('CPC').setType(T.CURRENCY_BRL)
    .setFormula('SUM($spend) / SUM($clicks)').setAggregation(A.AUTO);
  f.newMetric().setId('ctr').setName('CTR').setType(T.PERCENT)
    .setFormula('SUM($clicks) / SUM($impressions)').setAggregation(A.AUTO);
  f.newMetric().setId('cost_per_conversion').setName('Custo por Conversão').setType(T.CURRENCY_BRL)
    .setFormula('SUM($spend) / SUM($conversions)').setAggregation(A.AUTO);
  f.newMetric().setId('cost_per_lead').setName('Custo por Lead').setType(T.CURRENCY_BRL)
    .setFormula('SUM($spend) / SUM($leads)').setAggregation(A.AUTO);
  f.newMetric().setId('conversion_rate').setName('Taxa de Conversão').setType(T.PERCENT)
    .setFormula('SUM($conversions) / SUM($clicks)').setAggregation(A.AUTO);

  return { schema: f.build() };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

var DIMENSION_IDS = ['date', 'year_month', 'account_id', 'account_name',
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name'];

// Métrica do schema -> campo da API adAnalytics (fields=)
var METRIC_API = {
  impressions:         'impressions',
  clicks:              'clicks',
  landing_page_clicks: 'landingPageClicks',
  spend:               'costInLocalCurrency',
  conversions:         'externalWebsiteConversions',
  leads:               'oneClickLeads',
  reactions:           'reactions',
  comments:            'comments',
  shares:              'shares',
  video_views:         'videoViews'
};

function getData(request) {
  try {
    return buildData(request);
  } catch (e) {
    CC.newUserError()
      .setDebugText('getData: ' + (e.stack || e.message || e))
      .setText('Erro ao carregar dados: ' + (e.message || e))
      .throwException();
  }
}

function buildData(request) {
  var accountId = request.configParams.account_id;
  var reqFields = request.fields.map(function (f) { return f.name; });
  var dims      = reqFields.filter(function (f) { return DIMENSION_IDS.indexOf(f) >= 0; });

  var pivots      = requestedPivots(dims); // 0..3 níveis de hierarquia
  var granularity = dims.indexOf('date') >= 0 ? 'DAILY'
                  : dims.indexOf('year_month') >= 0 ? 'MONTHLY'
                  : 'ALL';

  // fields= sempre inclui pivotValues e dateRange, mais as métricas pedidas.
  var apiMetrics = reqFields.filter(function (f) { return METRIC_API[f]; })
                            .map(function (f) { return METRIC_API[f]; });
  var fields = uniq(['pivotValues', 'dateRange'].concat(apiMetrics));

  var elements  = fetchAnalytics(accountId, pivots, granularity, request.dateRange, fields);
  var accName   = resolveAccountName(accountId);
  var nameMap   = resolveAllNames(accountId, elements);

  var allSchema = getSchema(request).schema;
  var reqSchema = allSchema.filter(function (s) { return reqFields.indexOf(s.name) >= 0; });

  var rows = elements.map(function (el) {
    return {
      values: reqSchema.map(function (field) {
        return liExtract(field.name, el, accountId, accName, nameMap);
      })
    };
  });

  return { schema: reqSchema, rows: rows };
}

// Pivots pedidos (todos os níveis de hierarquia presentes, até 3).
// Deslocamento de nomenclatura (ver getSchema):
//   Campanha -> CAMPAIGN_GROUP | Conjunto -> CAMPAIGN | Anúncio -> CREATIVE
function requestedPivots(dims) {
  var p = [];
  if (dims.indexOf('campaign_id') >= 0 || dims.indexOf('campaign_name') >= 0) p.push('CAMPAIGN_GROUP');
  if (dims.indexOf('adset_id')    >= 0 || dims.indexOf('adset_name')    >= 0) p.push('CAMPAIGN');
  if (dims.indexOf('ad_id')       >= 0 || dims.indexOf('ad_name')       >= 0) p.push('CREATIVE');
  return p;
}

// Busca analytics. 0 pivots -> Analytics finder no nível conta; 1..3 pivots ->
// Statistics finder (retorna a hierarquia completa em pivotValues por linha,
// resolvendo o problema de níveis pais virem vazios num único pivot).
function fetchAnalytics(accountId, pivots, granularity, dateRange, fields) {
  var common = '&timeGranularity=' + granularity
    + '&dateRange=' + liDateRange(dateRange.startDate, dateRange.endDate)
    + '&accounts=' + encodeURIComponent('List(urn:li:sponsoredAccount:' + accountId + ')')
    + '&fields=' + fields.join(',');
  var url = pivots.length === 0
    ? LI_API + '/rest/adAnalytics?q=analytics&pivot=ACCOUNT' + common
    : LI_API + '/rest/adAnalytics?q=statistics&pivots=List(' + pivots.join(',') + ')' + common;
  var data = liGet(url);
  return data.elements || [];
}

// Converte "YYYY-MM-DD" (Looker) para o formato rest.li do LinkedIn.
function liDateRange(start, end) {
  function part(dateStr, key) {
    var p = dateStr.split('-');
    return key + ':(year:' + (+p[0]) + ',month:' + (+p[1]) + ',day:' + (+p[2]) + ')';
  }
  return '(' + part(start, 'start') + ',' + part(end, 'end') + ')';
}

// ---------------------------------------------------------------------------
// Resolução de nomes (pivotValues vêm como URN; precisamos do nome legível)
// ---------------------------------------------------------------------------

// Resolve URN -> nome para TODOS os tipos presentes nos elements (campanha,
// conjunto, anúncio). Retorna um map keyed pela URN completa -> nome.
// Endpoints aninhados sob a conta; no batch, o `List(...)` fica LITERAL (encodar
// o List inteiro dá erro 400); só os `:` das URNs de criativo são encodados.
function resolveAllNames(accountId, elements) {
  var map = {};
  var byType = {}; // tipo da URN -> [urns únicas]
  elements.forEach(function (el) {
    (el.pivotValues || []).forEach(function (urn) {
      var t = urnType(urn);
      if (t === 'sponsoredAccount' || !t) return; // conta resolvida à parte
      byType[t] = byType[t] || [];
      if (byType[t].indexOf(urn) < 0) byType[t].push(urn);
    });
  });

  var base = LI_API + '/rest/adAccounts/' + accountId + '/';
  Object.keys(byType).forEach(function (t) {
    var urns = byType[t];
    try {
      if (t === 'sponsoredCreative') {
        var idList = 'List(' + urns.map(function (u) { return encodeURIComponent(u); }).join(',') + ')';
        var r = liGet(base + 'creatives?ids=' + idList).results || {};
        Object.keys(r).forEach(function (k) { map[k] = (r[k] && r[k].name) || ('#' + urnId(k)); });
      } else {
        var entity = t === 'sponsoredCampaign' ? 'adCampaigns' : 'adCampaignGroups';
        var ids = urns.map(function (u) { return urnId(u); });
        var r2 = liGet(base + entity + '?ids=List(' + ids.join(',') + ')').results || {};
        Object.keys(r2).forEach(function (id) {
          map['urn:li:' + t + ':' + id] = (r2[id] && r2[id].name) || ('#' + id);
        });
      }
    } catch (e) {
      // Sem nomes desse tipo: as dimensões caem no id.
    }
  });
  return map;
}

function resolveAccountName(accountId) {
  try {
    var data = liGet(LI_API + '/rest/adAccounts/' + accountId);
    return data.name || String(accountId);
  } catch (e) {
    return String(accountId);
  }
}

// ---------------------------------------------------------------------------
// Extração de valores
// ---------------------------------------------------------------------------

function liExtract(fieldName, el, accountId, accName, nameMap) {
  var d = el.dateRange && el.dateRange.start;
  switch (fieldName) {
    case 'date':                return d ? ('' + d.year + pad(d.month) + pad(d.day)) : '';
    case 'year_month':          return d ? ('' + d.year + pad(d.month)) : '';
    case 'account_id':          return String(accountId);
    case 'account_name':        return accName;
    case 'campaign_id':   return hierId(el, 'sponsoredCampaignGroup');           // painel: Campanha
    case 'campaign_name': return hierName(el, 'sponsoredCampaignGroup', nameMap);
    case 'adset_id':      return hierId(el, 'sponsoredCampaign');                // painel: Conjunto
    case 'adset_name':    return hierName(el, 'sponsoredCampaign', nameMap);
    case 'ad_id':         return hierId(el, 'sponsoredCreative');               // painel: Anúncio
    case 'ad_name':       return hierName(el, 'sponsoredCreative', nameMap);
    case 'impressions':         return intVal(el.impressions);
    case 'clicks':              return intVal(el.clicks);
    case 'landing_page_clicks': return intVal(el.landingPageClicks);
    case 'spend':               return floatVal(el.costInLocalCurrency);
    case 'conversions':         return intVal(el.externalWebsiteConversions);
    case 'leads':               return intVal(el.oneClickLeads);
    case 'reactions':           return intVal(el.reactions);
    case 'comments':            return intVal(el.comments);
    case 'shares':              return intVal(el.shares);
    case 'video_views':         return intVal(el.videoViews);
    // cpm/cpc/ctr/cost_per_conversion/cost_per_lead/conversion_rate são fórmulas.
    default:                    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP + helpers
// ---------------------------------------------------------------------------

function liGet(url) {
  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'Authorization':           'Bearer ' + getOAuthService().getAccessToken(),
      'LinkedIn-Version':        LI_VERSION,
      'X-Restli-Protocol-Version': '2.0.0'
    },
    muteHttpExceptions: true
  });
  var text = resp.getContentText();
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Resposta inesperada do LinkedIn (HTTP ' + resp.getResponseCode() + '): ' + text.slice(0, 200));
  }
  if (data.status && data.status >= 400) {
    throw new Error('LinkedIn API: ' + (data.message || text.slice(0, 200)) + ' (HTTP ' + data.status + ')');
  }
  return data;
}

// Acha, entre os pivotValues da linha, a URN do tipo pedido (ex.: sponsoredCampaign).
function urnOfType(pivotValues, type) {
  pivotValues = pivotValues || [];
  for (var i = 0; i < pivotValues.length; i++) {
    if (String(pivotValues[i]).indexOf('urn:li:' + type + ':') === 0) return pivotValues[i];
  }
  return '';
}
function hierId(el, type)          { var u = urnOfType(el.pivotValues, type); return u ? urnId(u) : ''; }
function hierName(el, type, nameMap) { var u = urnOfType(el.pivotValues, type); return u ? (nameMap[u] || urnId(u)) : ''; }

function urnType(urn)  { var p = String(urn).split(':'); return p.length >= 4 ? p[2] : ''; }
function urnId(urn)    { var p = String(urn).split(':'); return p[p.length - 1] || ''; }
function pad(n)        { return (n < 10 ? '0' : '') + n; }
function intVal(v)     { return parseInt(v || 0, 10); }
function floatVal(v)   { return parseFloat(v || 0); }
function uniq(arr)     { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }
