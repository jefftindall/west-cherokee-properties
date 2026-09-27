# Standalone Function App for the daily rent timer. SWA managed Functions are HTTP-only,
# so timers cannot live in the SWA API. Flex Consumption on-demand stays inside the monthly
# free grant at one run per day; see docs/runbooks/cost-and-quotas.md.
locals {
  rent_jobs_app_name     = "func-wcp-jobs-${local.name_suffix}"
  rent_jobs_plan_name    = "asp-wcp-jobs-${local.name_suffix}"
  rent_jobs_storage_name = "stwcpjobs${local.name_suffix}"
  rent_jobs_function     = "rentDailyJobs"
}

resource "azurerm_storage_account" "rent_jobs" {
  name                            = local.rent_jobs_storage_name
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = local.tags
}

resource "azurerm_storage_container" "rent_jobs_deploy" {
  name                  = "deployments"
  storage_account_id    = azurerm_storage_account.rent_jobs.id
  container_access_type = "private"
}

resource "azurerm_service_plan" "rent_jobs" {
  name                = local.rent_jobs_plan_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = local.tags
}

resource "azurerm_function_app_flex_consumption" "rent_jobs" {
  name                = local.rent_jobs_app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.rent_jobs.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.rent_jobs.primary_blob_endpoint}${azurerm_storage_container.rent_jobs_deploy.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.rent_jobs.primary_access_key

  runtime_name           = "node"
  runtime_version        = "22"
  instance_memory_in_mb  = 512
  maximum_instance_count = 1

  https_only                                     = true
  webdeploy_publish_basic_authentication_enabled = false

  site_config {
    application_insights_connection_string = azurerm_application_insights.main.connection_string
  }

  app_settings = {
    SITE_URL                     = local.public_site_url
    SQL_CONNECTION_STRING        = azurerm_key_vault_secret.sql_connection_string.value
    STRIPE_SECRET_KEY            = data.azurerm_key_vault_secret.stripe_secret_key.value
    RENT_PAYMENTS_ENABLED        = var.rent_payments_enabled ? "true" : "false"
    RENT_COMMUNICATIONS_ENABLED  = var.rent_communications_enabled ? "true" : "false"
    RENT_COMMUNICATIONS_PREVIEW  = var.rent_communications_preview ? "true" : "false"
    CONTACT_NOTIFY_EMAIL         = data.azurerm_key_vault_secret.site_contact_email.value
    ACS_CONNECTION_STRING        = data.azurerm_key_vault_secret.acs_connection_string.value
    ACS_EMAIL_SENDER             = data.azurerm_key_vault_secret.acs_email_sender.value
    APPINSIGHTS_CONNECTIONSTRING = azurerm_application_insights.main.connection_string
    # Disabled timers still run on demand via the portal Test/Run or the master-key admin endpoint.
    "AzureWebJobs.${local.rent_jobs_function}.Disabled" = var.rent_jobs_schedule_enabled ? "false" : "true"
  }

  tags = local.tags
}

resource "azurerm_role_assignment" "github_actions_rent_jobs_deploy" {
  scope                = azurerm_function_app_flex_consumption.rent_jobs.id
  role_definition_name = "Website Contributor"
  principal_id         = azuread_service_principal.github_actions.object_id
}
