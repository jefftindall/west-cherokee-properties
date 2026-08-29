resource "random_password" "sql" {
  length           = 24
  special          = true
  override_special = "!@#%^*-_=+"
}

resource "azurerm_mssql_server" "ops" {
  name                         = local.sql_name
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  version                      = "12.0"
  administrator_login          = "wcpadmin"
  administrator_login_password = random_password.sql.result
  minimum_tls_version          = "1.2"
  tags                         = local.tags
}

resource "azurerm_mssql_database" "ops" {
  name                        = "wcp"
  server_id                   = azurerm_mssql_server.ops.id
  sku_name                    = "GP_S_Gen5_1"
  min_capacity                = 0.5
  auto_pause_delay_in_minutes = 60
  storage_account_type        = "Local"
  tags                        = local.tags
}

resource "azurerm_mssql_firewall_rule" "azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.ops.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_key_vault_secret" "sql_admin_password" {
  name         = "SQL-ADMIN-PASSWORD"
  value        = random_password.sql.result
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

locals {
  sql_connection_string = "Server=tcp:${azurerm_mssql_server.ops.fully_qualified_domain_name},1433;Initial Catalog=${azurerm_mssql_database.ops.name};Persist Security Info=False;User ID=wcpadmin;Password=${random_password.sql.result};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
}

resource "azurerm_key_vault_secret" "sql_connection_string" {
  name         = "SQL-CONNECTION-STRING"
  value        = local.sql_connection_string
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}
