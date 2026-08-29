locals {
  law_name  = "law-wcp-${local.name_suffix}"
  appi_name = "appi-wcp-${local.name_suffix}"
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.law_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                 = local.appi_name
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  workspace_id         = azurerm_log_analytics_workspace.main.id
  application_type     = "web"
  retention_in_days    = 30
  daily_data_cap_in_gb = 1
  sampling_percentage  = 100
  tags                 = local.tags
}

resource "azurerm_application_insights_standard_web_test" "homepage" {
  count                   = var.environment == "prod" && var.custom_domain != "" ? 1 : 0
  name                    = "webtest-wcp-home"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr"]
  frequency               = 600
  timeout                 = 30
  enabled                 = true

  request {
    url = "https://${var.custom_domain}/"
  }
}
