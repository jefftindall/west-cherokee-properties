resource "github_repository_environment" "this" {
  count       = var.manage_github_actions ? 1 : 0
  environment = var.environment
  repository  = var.github_repo
}

resource "github_actions_environment_variable" "azure_client_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_CLIENT_ID"
  value         = azuread_application.github_actions.client_id
}

resource "github_actions_environment_variable" "azure_tenant_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_TENANT_ID"
  value         = data.azurerm_client_config.current.tenant_id
}

resource "github_actions_environment_variable" "azure_subscription_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_SUBSCRIPTION_ID"
  value         = data.azurerm_client_config.current.subscription_id
}

resource "github_actions_environment_variable" "azure_resource_group" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_RESOURCE_GROUP"
  value         = azurerm_resource_group.main.name
}

resource "github_actions_environment_variable" "azure_static_web_app_name" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_STATIC_WEB_APP_NAME"
  value         = azurerm_static_web_app.main.name
}

resource "github_actions_environment_variable" "appinsights_connection_string" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "APPINSIGHTS_CONNECTION_STRING"
  value         = azurerm_application_insights.main.connection_string
}

# Job-level `if:` cannot see environment variables. Repo vars gate CD deploy jobs.
resource "github_actions_variable" "staging_hostname" {
  count         = var.manage_github_actions && var.environment == "staging" ? 1 : 0
  repository    = var.github_repo
  variable_name = "STAGING_HOSTNAME"
  value         = azurerm_static_web_app.main.default_host_name
}

resource "github_actions_variable" "prod_hostname" {
  count         = var.manage_github_actions && var.environment == "prod" ? 1 : 0
  repository    = var.github_repo
  variable_name = "PROD_HOSTNAME"
  value         = azurerm_static_web_app.main.default_host_name
}

resource "github_actions_environment_secret" "swa_deploy_token" {
  count           = var.manage_github_actions ? 1 : 0
  environment     = github_repository_environment.this[0].environment
  repository      = var.github_repo
  secret_name     = "AZURE_STATIC_WEB_APPS_API_TOKEN"
  plaintext_value = azurerm_static_web_app.main.api_key
}
