data "azuread_client_config" "current" {}

locals {
  auth_callback_path          = "/.auth/login/aad/callback"
  user_impersonation_scope_id = "4e8f2c1a-9b7d-4a6e-8f3c-1d2e3a4b5c6d"
  auth_hostnames = distinct(concat(
    [azurerm_static_web_app.main.default_host_name],
    var.custom_domain == "" ? [] : [var.custom_domain, "www.${var.custom_domain}"],
    var.custom_hostnames,
  ))
  redirect_uris = [
    for host in local.auth_hostnames : "https://${host}${local.auth_callback_path}"
  ]
}

resource "azuread_application" "swa" {
  display_name     = "wcp-office-${var.environment}"
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Sign in to the West Cherokee Properties office."
      admin_consent_display_name = "Access office"
      enabled                    = true
      id                         = local.user_impersonation_scope_id
      type                       = "User"
      user_consent_description   = "Sign in to the office."
      user_consent_display_name  = "Access office"
      value                      = "user_impersonation"
    }
  }

  web {
    redirect_uris = local.redirect_uris

    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = true
    }
  }

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_service_principal" "swa" {
  client_id                    = azuread_application.swa.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_application_password" "swa" {
  application_id = azuread_application.swa.id
  display_name   = "swa-client-secret"
}

resource "azurerm_key_vault_secret" "aad_client_id" {
  name         = "AAD-CLIENT-ID"
  value        = azuread_application.swa.client_id
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "aad_client_secret" {
  name         = "AAD-CLIENT-SECRET"
  value        = azuread_application_password.swa.value
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}
