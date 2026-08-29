terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

data "azurerm_client_config" "current" {}

locals {
  name_suffix  = var.environment
  rg_name      = "rg-wcp-${local.name_suffix}"
  kv_name      = "kv-wcp-${local.name_suffix}"
  swa_name     = "swa-wcp-${local.name_suffix}"
  sql_name     = "sql-wcp-${local.name_suffix}"
  sql_location = var.sql_location != "" ? var.sql_location : var.location

  tags = merge(var.tags, {
    environment = var.environment
    project     = "west-cherokee-properties"
    managed     = "terraform"
  })

  public_site_url = var.environment == "prod" ? (
    var.custom_domain != "" ? "https://${var.custom_domain}" : "https://westcherokee.com"
    ) : (
    length(var.custom_hostnames) > 0 ? "https://${var.custom_hostnames[0]}" : "https://test.westcherokee.com"
  )
}

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_key_vault" "main" {
  name                       = local.kv_name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = var.soft_delete_retention_days
  purge_protection_enabled   = var.purge_protection_enabled
  rbac_authorization_enabled = true
  tags                       = local.tags
}

resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id

  lifecycle {
    ignore_changes = [principal_id]
  }
}

resource "azurerm_static_web_app" "main" {
  name                = local.swa_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku_tier            = "Standard"
  sku_size            = "Standard"

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    SITE_URL                     = local.public_site_url
    TURNSTILE_SECRET             = data.azurerm_key_vault_secret.turnstile_secret.value
    CONTACT_NOTIFY_EMAIL         = data.azurerm_key_vault_secret.site_contact_email.value
    ACS_CONNECTION_STRING        = data.azurerm_key_vault_secret.acs_connection_string.value
    ACS_EMAIL_SENDER             = data.azurerm_key_vault_secret.acs_email_sender.value
    ALLOWED_USER_IDS             = data.azurerm_key_vault_secret.allowed_user_ids.value
    SQL_CONNECTION_STRING        = azurerm_key_vault_secret.sql_connection_string.value
    STRIPE_SECRET_KEY            = data.azurerm_key_vault_secret.stripe_secret_key.value
    RENT_PAYMENTS_ENABLED        = var.rent_payments_enabled ? "true" : "false"
    EXTERNAL_ID_CLIENT_ID        = data.azurerm_key_vault_secret.external_id_client_id.value
    EXTERNAL_ID_CLIENT_SECRET    = data.azurerm_key_vault_secret.external_id_client_secret.value
    APPINSIGHTS_CONNECTIONSTRING = azurerm_application_insights.main.connection_string
  }

  tags = local.tags
}

resource "azurerm_role_assignment" "swa_kv_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_static_web_app.main.identity[0].principal_id
}
