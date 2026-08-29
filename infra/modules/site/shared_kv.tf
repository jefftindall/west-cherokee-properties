data "azurerm_key_vault" "shared" {
  name                = var.shared_key_vault_name
  resource_group_name = var.shared_key_vault_resource_group_name
}

data "azurerm_key_vault_secret" "site_contact_email" {
  name         = "SITE-CONTACT-EMAIL"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "turnstile_secret" {
  name         = "TURNSTILE-SECRET-KEY"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "acs_connection_string" {
  name         = "ACS-CONNECTION-STRING"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "acs_email_sender" {
  name         = "ACS-EMAIL-SENDER"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "allowed_user_ids" {
  name         = "ALLOWED-USER-IDS"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "external_id_client_id" {
  name         = "EXTERNAL-ID-CLIENT-ID"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "external_id_client_secret" {
  name         = "EXTERNAL-ID-CLIENT-SECRET"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = var.environment == "prod" ? "STRIPE-LIVE-SECRET-KEY" : "STRIPE-TEST-SECRET-KEY"
  key_vault_id = data.azurerm_key_vault.shared.id
}
