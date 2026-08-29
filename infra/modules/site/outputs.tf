output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "static_web_app_name" {
  value = azurerm_static_web_app.main.name
}

output "static_web_app_default_host_name" {
  value = azurerm_static_web_app.main.default_host_name
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "sql_server_name" {
  value = azurerm_mssql_server.ops.name
}

output "application_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}

output "aad_client_id" {
  value = azuread_application.swa.client_id
}

output "github_actions_client_id" {
  value = azuread_application.github_actions.client_id
}
